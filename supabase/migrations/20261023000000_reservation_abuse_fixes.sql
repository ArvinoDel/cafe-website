-- Migration: 20261023000000_reservation_abuse_fixes.sql
-- Description: Hardening and abuse fixes across reservations, table sessions, and storage.

-- ── 1. SCHEMA UPDATES ─────────────────────────────────────────────────────────

-- 1.1 Branches: add reservation_confirm_window_minutes (default 120 minutes)
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS reservation_confirm_window_minutes integer NOT NULL DEFAULT 120;

-- 1.2 Reservations: add needs_kitchen_order flag
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS needs_kitchen_order boolean NOT NULL DEFAULT false;

-- 1.3 Orders: add payment_status column (default unpaid)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

-- 1.4 Rate limits table for DB-backed distributed atomic rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 1
);

-- Index for maintenance / cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- 1.5 Storage: Create private bucket reservation-proofs with 5MB limit and allowed MIME types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reservation-proofs',
  'reservation-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ── 2. HELPER FUNCTIONS ───────────────────────────────────────────────────────

-- 2.1 Phone Normalization: strips non-digits and standardizes +62 / 0 prefix to 62...
CREATE OR REPLACE FUNCTION normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF v_digits LIKE '0%' THEN
    v_digits := '62' || substr(v_digits, 2);
  ELSIF v_digits NOT LIKE '62%' THEN
    v_digits := '62' || v_digits;
  END IF;
  RETURN v_digits;
END;
$$;

-- 2.2 Atomic DB Rate Limiter Function
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_count        integer;
  v_allowed      boolean;
  v_reset_at     timestamptz;
BEGIN
  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE
  SET
    window_start = CASE
      WHEN rate_limits.window_start + (p_window_seconds * INTERVAL '1 second') <= v_now THEN v_now
      ELSE rate_limits.window_start
    END,
    count = CASE
      WHEN rate_limits.window_start + (p_window_seconds * INTERVAL '1 second') <= v_now THEN 1
      ELSE rate_limits.count + 1
    END
  RETURNING window_start, count INTO v_window_start, v_count;

  v_reset_at := v_window_start + (p_window_seconds * INTERVAL '1 second');
  v_allowed  := (v_count <= p_limit);

  RETURN jsonb_build_object(
    'allowed',   v_allowed,
    'count',     v_count,
    'limit',     p_limit,
    'reset_at',  v_reset_at,
    'remaining', GREATEST(0, p_limit - v_count)
  );
END;
$$;

-- ── 3. UPDATED SWEEP_RESERVATIONS ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sweep_reservations(
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count   integer := 0;
  v_no_show_count   integer := 0;
  v_completed_count integer := 0;
BEGIN
  -- 1. pending_payment past hold_expires_at -> expired
  WITH expired_unpaid AS (
    UPDATE reservations
    SET
      status     = 'expired',
      updated_at = now()
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'pending_payment'
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= now()
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired_unpaid;

  -- 2a. awaiting_confirmation whose hold_expires_at passed AND has NO proof -> expired
  WITH expired_no_proof AS (
    UPDATE reservations
    SET
      status     = 'expired',
      updated_at = now()
    WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'awaiting_confirmation'
      AND payment_proof_url IS NULL
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= now()
    RETURNING id
  )
  SELECT v_expired_count + count(*) INTO v_expired_count FROM expired_no_proof;

  -- 2b. awaiting_confirmation WITH proof past staff confirm window -> expired + needs_refund
  WITH expired_with_proof AS (
    UPDATE reservations r
    SET
      status        = 'expired',
      refund_status = 'needs_refund',
      updated_at    = now()
    FROM branches b
    WHERE r.branch_id = b.id
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
      AND r.status = 'awaiting_confirmation'
      AND r.payment_proof_url IS NOT NULL
      AND (COALESCE(r.hold_expires_at, r.created_at) + (COALESCE(b.reservation_confirm_window_minutes, 120) * INTERVAL '1 minute')) <= now()
    RETURNING r.id
  )
  SELECT v_expired_count + count(*) INTO v_expired_count FROM expired_with_proof;

  -- 3. confirmed with no session after starts_at + grace -> no_show
  WITH noshow_rows AS (
    UPDATE reservations r
    SET
      status     = 'no_show',
      updated_at = now()
    FROM branches b
    WHERE r.branch_id = b.id
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
      AND r.status = 'confirmed'
      AND r.session_id IS NULL
      AND (r.starts_at + (COALESCE(b.reservation_grace_minutes, 15) * INTERVAL '1 minute')) <= now()
    RETURNING r.id
  )
  SELECT count(*) INTO v_no_show_count FROM noshow_rows;

  -- 4. seated whose session ended -> completed
  WITH completed_rows AS (
    UPDATE reservations r
    SET
      status     = 'completed',
      updated_at = now()
    FROM table_sessions s
    WHERE r.session_id = s.id
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
      AND r.status = 'seated'
      AND (s.status <> 'active' OR s.expires_at <= now() OR now() >= r.ends_at)
    RETURNING r.id
  )
  SELECT count(*) INTO v_completed_count FROM completed_rows;

  RETURN jsonb_build_object(
    'ok',              true,
    'swept_at',        now(),
    'expired_count',   v_expired_count,
    'no_show_count',   v_no_show_count,
    'completed_count', v_completed_count
  );
END;
$$;

-- ── 4. UPDATED CLAIM_TABLE (with sweep at top) ────────────────────────────────

CREATE OR REPLACE FUNCTION claim_table(
  p_branch_id uuid,
  p_code      text,
  p_token     text,
  p_ip_hash   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch             branches%ROWTYPE;
  v_table              tables%ROWTYPE;
  v_existing           table_sessions%ROWTYPE;
  v_ip_hold_count      integer;
  v_soft_hold_interval interval;
  v_candidate_expiry   timestamptz;
  v_effective_exp      timestamptz;
  v_buffer_interval    interval;
  v_res_starts_at      timestamptz;
  v_res_ends_at        timestamptz;
  v_new_session        table_sessions%ROWTYPE;
BEGIN
  -- 0. Always sweep reservations first
  PERFORM sweep_reservations(p_branch_id);

  -- 1. Fetch branch settings
  SELECT * INTO v_branch FROM branches WHERE id = p_branch_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BRANCH_NOT_FOUND');
  END IF;

  -- 2. Lock the target table row
  SELECT *
  INTO v_table
  FROM tables
  WHERE branch_id = p_branch_id
    AND code      = upper(trim(p_code))
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_NOT_FOUND');
  END IF;

  -- 3. Expire stale active sessions for this table
  UPDATE table_sessions
  SET
    status          = 'expired',
    released_reason = 'expired',
    released_at     = now()
  WHERE
    table_id = v_table.id
    AND status = 'active'
    AND expires_at <= now();

  -- 4. Expire any stale active sessions for this token (on any table)
  UPDATE table_sessions
  SET
    status          = 'expired',
    released_reason = 'expired',
    released_at     = now()
  WHERE
    session_token = p_token
    AND status = 'active'
    AND expires_at <= now();

  -- 5. Check if there is already an active session on this table
  SELECT *
  INTO v_existing
  FROM table_sessions
  WHERE table_id = v_table.id AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.session_token = p_token THEN
      RETURN jsonb_build_object(
        'ok',          true,
        'is_existing', true,
        'session',     jsonb_build_object(
          'id',          v_existing.id,
          'table_id',    v_existing.table_id,
          'table_code',  v_table.code,
          'table_label', v_table.label,
          'branch_id',   v_existing.branch_id,
          'expires_at',  v_existing.expires_at,
          'started_at',  v_existing.started_at,
          'upgraded',    (v_existing.upgraded_at IS NOT NULL)
        )
      );
    ELSE
      RETURN jsonb_build_object('ok', false, 'code', 'TABLE_TAKEN');
    END IF;
  END IF;

  -- 6. Check per-IP non-upgraded hold limit (max 5 active holds per branch)
  IF p_ip_hash IS NOT NULL THEN
    SELECT count(*)
    INTO v_ip_hold_count
    FROM table_sessions
    WHERE branch_id = p_branch_id
      AND ip_hash   = p_ip_hash
      AND status    = 'active'
      AND upgraded_at IS NULL;

    IF v_ip_hold_count >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_HOLDS');
    END IF;
  END IF;

  -- 7. Calculate soft hold candidate expiry
  v_soft_hold_interval := (COALESCE(v_branch.claim_soft_hold_minutes, 20) * INTERVAL '1 minute');
  v_candidate_expiry   := now() + v_soft_hold_interval;
  v_effective_exp      := v_candidate_expiry;

  -- 8. Check whole reservation window
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');

  SELECT r.starts_at, r.ends_at
  INTO v_res_starts_at, v_res_ends_at
  FROM reservations r
  WHERE
    r.table_id = v_table.id
    AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed')
    AND (r.starts_at - v_buffer_interval) < v_candidate_expiry
    AND r.ends_at > now()
  ORDER BY r.starts_at ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_res_starts_at <= now() OR v_res_starts_at <= v_candidate_expiry THEN
      RETURN jsonb_build_object(
        'ok',        false,
        'code',      'TABLE_RESERVED',
        'starts_at', v_res_starts_at,
        'ends_at',   v_res_ends_at
      );
    ELSE
      v_effective_exp := v_res_starts_at - v_buffer_interval;
      IF v_effective_exp <= now() THEN
        RETURN jsonb_build_object(
          'ok',        false,
          'code',      'TABLE_RESERVED',
          'starts_at', v_res_starts_at,
          'ends_at',   v_res_ends_at
        );
      END IF;
    END IF;
  END IF;

  -- 9. Release caller's active session on any other table
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE
    session_token = p_token
    AND status    = 'active'
    AND table_id  <> v_table.id;

  -- 10. Insert the new active session
  INSERT INTO table_sessions (
    table_id, branch_id, session_token,
    status, started_at, expires_at, upgraded_at, ip_hash
  )
  VALUES (
    v_table.id, p_branch_id, p_token,
    'active', now(), v_effective_exp, NULL, p_ip_hash
  )
  RETURNING * INTO v_new_session;

  RETURN jsonb_build_object(
    'ok',          true,
    'is_existing', false,
    'session',     jsonb_build_object(
      'id',          v_new_session.id,
      'table_id',    v_new_session.table_id,
      'table_code',  v_table.code,
      'table_label', v_table.label,
      'branch_id',   v_new_session.branch_id,
      'expires_at',  v_new_session.expires_at,
      'started_at',  v_new_session.started_at,
      'upgraded',    false
    )
  );
END;
$$;

-- ── 5. UPDATED CREATE_RESERVATION_HOLD ────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_reservation_hold(
  p_branch_id        uuid,
  p_table_id         uuid,
  p_code             text,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
  p_party_size       integer,
  p_starts_at        timestamptz,
  p_duration_minutes integer,
  p_occasion         text,
  p_notes            text,
  p_items            jsonb,
  p_preorder_total   integer,
  p_owner_token_hash text,
  p_ip_hash          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch             branches%ROWTYPE;
  v_table              tables%ROWTYPE;
  v_buffer_interval    interval;
  v_lead_interval      interval;
  v_max_days           integer;
  v_ends_at            timestamptz;
  v_blocked_range      tstzrange;
  v_tz                 text;
  v_start_time         text;
  v_end_time           text;
  v_open_time          text;
  v_close_time         text;
  v_min_preorder       integer;
  v_phone_holds        integer;
  v_ip_holds           integer;
  v_hold_minutes       integer;
  v_hold_expires_at    timestamptz;
  v_res_id             uuid;
BEGIN
  -- 0. Always sweep reservations first
  PERFORM sweep_reservations(p_branch_id);

  -- 1. Lock the table row to eliminate races with claim_table
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_NOT_FOUND', 'message', 'Meja tidak ditemukan.');
  END IF;

  IF NOT v_table.is_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_INACTIVE', 'message', 'Meja sedang tidak aktif.');
  END IF;

  IF p_party_size > v_table.seats THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CAPACITY_EXCEEDED', 'message', 'Jumlah tamu melebihi kapasitas meja.');
  END IF;

  -- 2. Fetch and check branch
  SELECT *
  INTO v_branch
  FROM branches
  WHERE id = p_branch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BRANCH_NOT_FOUND', 'message', 'Cabang tidak ditemukan.');
  END IF;

  IF NOT v_branch.reservations_enabled THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESERVATIONS_DISABLED', 'message', 'Layanan reservasi tidak aktif di cabang ini.');
  END IF;

  -- 3. Validate duration
  IF p_duration_minutes < 60 OR p_duration_minutes > 180 OR (p_duration_minutes % 30) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DURATION', 'message', 'Durasi harus antara 60 dan 180 menit dengan kelipatan 30 menit.');
  END IF;

  -- 4. Advance booking bounds
  v_lead_interval := (COALESCE(v_branch.reservation_min_lead_minutes, 120) * INTERVAL '1 minute');
  IF p_starts_at < (now() + v_lead_interval) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MIN_LEAD_VIOLATION',
      'message', format('Reservasi harus dibuat minimal %s menit sebelumnya.', COALESCE(v_branch.reservation_min_lead_minutes, 120))
    );
  END IF;

  v_max_days := COALESCE(v_branch.reservation_max_days_ahead, 30);
  IF p_starts_at > (now() + (v_max_days * INTERVAL '1 day')) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MAX_DAYS_EXCEEDED',
      'message', format('Reservasi hanya dapat dibuat maksimal %s hari ke depan.', v_max_days)
    );
  END IF;

  -- 5. Time-of-day check in SQL using branch timezone
  v_tz := COALESCE(v_branch.timezone, 'Asia/Jakarta');
  v_start_time := to_char(p_starts_at AT TIME ZONE v_tz, 'HH24:MI');
  v_open_time  := COALESCE(v_branch.reservation_open_time, '08:00');
  v_close_time := COALESCE(v_branch.reservation_close_time, '21:00');

  IF v_start_time < v_open_time OR v_start_time >= v_close_time THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'OUTSIDE_HOURS',
      'message', format('Jam reservasi (%s) di luar jam operasional reservasi (%s–%s %s).', v_start_time, v_open_time, v_close_time, v_tz)
    );
  END IF;

  -- Check reservation end time does not exceed closing time
  v_ends_at   := p_starts_at + (p_duration_minutes * INTERVAL '1 minute');
  v_end_time  := to_char(v_ends_at AT TIME ZONE v_tz, 'HH24:MI');

  IF v_end_time > v_close_time OR (v_ends_at::date > p_starts_at::date) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EXCEEDS_CLOSING_TIME',
      'message', format('Waktu selesai reservasi (%s) melebihi jam tutup (%s). Silakan kurangi durasi atau pilih jam lebih awal.', v_end_time, v_close_time)
    );
  END IF;

  -- 6. Items & Preorder Total validation (ALWAYS require at least 1 item and preorder_total >= max(min_preorder, 1))
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PREORDER_REQUIRED',
      'message', 'Reservasi mewajibkan pre-order minimal 1 menu.'
    );
  END IF;

  v_min_preorder := GREATEST(COALESCE(v_branch.reservation_min_preorder, 0), 1);
  IF COALESCE(p_preorder_total, 0) < v_min_preorder THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PREORDER_BELOW_MINIMUM',
      'message', format('Total pre-order minimal adalah Rp%s.', to_char(v_min_preorder, 'FM999,999,999'))
    );
  END IF;

  -- 7. Compute blocked_range
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');
  v_blocked_range   := tstzrange(p_starts_at - v_buffer_interval, v_ends_at + v_buffer_interval, '[)');

  -- 8. Check active table_session overlap
  IF EXISTS (
    SELECT 1
    FROM table_sessions
    WHERE table_id = p_table_id
      AND status = 'active'
      AND expires_at > (p_starts_at - v_buffer_interval)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_CURRENTLY_OCCUPIED', 'message', 'Meja sedang digunakan oleh pelanggan lain.');
  END IF;

  -- 9. Check existing overlapping reservations
  IF EXISTS (
    SELECT 1
    FROM reservations r
    WHERE r.table_id = p_table_id
      AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'seated')
      AND r.blocked_range && v_blocked_range
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_ALREADY_RESERVED', 'message', 'Meja sudah dipesan untuk waktu tersebut.');
  END IF;

  -- 10. Rate limit: at most 2 unconfirmed holds (pending_payment + awaiting_confirmation) per normalized phone and ip_hash
  SELECT count(*)
  INTO v_phone_holds
  FROM reservations
  WHERE branch_id = p_branch_id
    AND normalize_phone(customer_phone) = normalize_phone(p_customer_phone)
    AND status IN ('pending_payment', 'awaiting_confirmation');

  IF v_phone_holds >= 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TOO_MANY_HOLDS',
      'message', 'Terlalu banyak reservasi yang belum dikonfirmasi untuk nomor telepon ini.'
    );
  END IF;

  IF p_ip_hash IS NOT NULL THEN
    SELECT count(*)
    INTO v_ip_holds
    FROM reservations
    WHERE branch_id = p_branch_id
      AND ip_hash = p_ip_hash
      AND status IN ('pending_payment', 'awaiting_confirmation');

    IF v_ip_holds >= 2 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'TOO_MANY_HOLDS',
        'message', 'Terlalu banyak reservasi yang belum dikonfirmasi dari jaringan/perangkat ini.'
      );
    END IF;
  END IF;

  -- 11. Initial status is ALWAYS pending_payment with hold timer
  v_hold_minutes    := COALESCE(v_branch.reservation_hold_minutes, 15);
  v_hold_expires_at := now() + (v_hold_minutes * INTERVAL '1 minute');

  -- 12. Insert the reservation
  BEGIN
    INSERT INTO reservations (
      code,
      branch_id,
      table_id,
      customer_name,
      customer_phone,
      customer_email,
      party_size,
      starts_at,
      ends_at,
      duration_minutes,
      occasion,
      notes,
      items,
      preorder_total,
      status,
      hold_expires_at,
      blocked_range,
      owner_token_hash,
      ip_hash,
      hold_extended
    )
    VALUES (
      upper(trim(p_code)),
      p_branch_id,
      p_table_id,
      trim(p_customer_name),
      trim(p_customer_phone),
      trim(nullif(p_customer_email, '')),
      p_party_size,
      p_starts_at,
      v_ends_at,
      p_duration_minutes,
      trim(nullif(p_occasion, '')),
      trim(nullif(p_notes, '')),
      p_items,
      p_preorder_total,
      'pending_payment',
      v_hold_expires_at,
      v_blocked_range,
      p_owner_token_hash,
      p_ip_hash,
      false
    )
    RETURNING id INTO v_res_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CODE_COLLISION', 'message', 'Kode reservasi bertabrakan, silakan coba lagi.');
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TABLE_ALREADY_RESERVED', 'message', 'Meja sudah dipesan di waktu tersebut.');
  END;

  RETURN jsonb_build_object(
    'ok',              true,
    'id',              v_res_id,
    'code',            upper(trim(p_code)),
    'status',          'pending_payment',
    'starts_at',       p_starts_at,
    'ends_at',         v_ends_at,
    'hold_expires_at', v_hold_expires_at,
    'table_code',      v_table.code,
    'table_label',     v_table.label
  );
END;
$$;

-- ── 6. UPDATED CLAIM_PAYMENT (requires verified proof in storage) ─────────────

CREATE OR REPLACE FUNCTION claim_payment(
  p_code       text,
  p_verifier   text,
  p_proof_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res              reservations%ROWTYPE;
  v_new_hold_expires timestamptz;
  v_is_extended      boolean;
  v_code_lock        jsonb;
BEGIN
  -- 0. Check verifier throttle lockout per code (max 5 failed attempts in 15 minutes)
  SELECT check_rate_limit('verifier_fail:' || upper(trim(p_code)), 5, 900) INTO v_code_lock;
  IF (v_code_lock->>'allowed')::boolean = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 1. Find reservation with row lock
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  IF right(v_res.customer_phone, 4) <> p_verifier
     AND COALESCE(v_res.owner_token_hash, '') <> p_verifier THEN
    -- Increment wrong attempt counter
    PERFORM check_rate_limit('verifier_fail:' || upper(trim(p_code)), 5, 900);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  DELETE FROM rate_limits WHERE key = 'verifier_fail:' || upper(trim(p_code));

  -- 2. Validate current state
  IF v_res.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status reservasi bukan menunggu pembayaran.');
  END IF;

  IF v_res.hold_expires_at IS NOT NULL AND v_res.hold_expires_at <= now() THEN
    UPDATE reservations SET status = 'expired', updated_at = now() WHERE id = v_res.id;
    RETURN jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED', 'message', 'Waktu pembayaran reservasi telah berakhir.');
  END IF;

  -- 3. Require valid proof path starting with '<code>/' and existing in storage.objects bucket 'reservation-proofs'
  IF p_proof_path IS NULL
     OR trim(p_proof_path) = ''
     OR p_proof_path NOT LIKE (upper(trim(p_code)) || '/%')
     OR NOT EXISTS (
       SELECT 1
       FROM storage.objects
       WHERE bucket_id = 'reservation-proofs'
         AND name = p_proof_path
     )
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PROOF_REQUIRED',
      'message', 'Bukti pembayaran wajib diunggah ke storage dan berada dalam folder kode reservasi.'
    );
  END IF;

  -- 4. Extend hold once by 30 minutes
  IF v_res.hold_extended = false THEN
    v_new_hold_expires := COALESCE(v_res.hold_expires_at, now()) + INTERVAL '30 minutes';
    v_is_extended      := true;
  ELSE
    v_new_hold_expires := v_res.hold_expires_at;
    v_is_extended      := true;
  END IF;

  -- 5. Transition to awaiting_confirmation
  UPDATE reservations
  SET
    status            = 'awaiting_confirmation',
    payment_proof_url = p_proof_path,
    hold_expires_at   = v_new_hold_expires,
    hold_extended     = v_is_extended,
    updated_at        = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',              true,
    'code',            v_res.code,
    'status',          'awaiting_confirmation',
    'hold_expires_at', v_new_hold_expires
  );
END;
$$;

-- ── 7. UPDATED CONFIRM_RESERVATION_PAYMENT (only SLOT_LOST if real conflict) ───

CREATE OR REPLACE FUNCTION confirm_reservation_payment(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res   reservations%ROWTYPE;
  v_table tables%ROWTYPE;
BEGIN
  -- 1. Lock the reservation row
  SELECT *
  INTO v_res
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  IF v_res.status <> 'awaiting_confirmation' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Reservasi tidak dalam status menunggu konfirmasi.');
  END IF;

  -- 2. Lock the target table row
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = v_res.table_id
  FOR UPDATE;

  -- 3. Return SLOT_LOST only when a conflicting reservation or active session really exists
  IF EXISTS (
       SELECT 1
       FROM reservations r
       WHERE r.table_id = v_res.table_id
         AND r.id <> v_res.id
         AND r.status IN ('confirmed', 'seated')
         AND r.blocked_range && v_res.blocked_range
     )
     OR EXISTS (
       SELECT 1
       FROM table_sessions s
       WHERE s.table_id = v_res.table_id
         AND s.status = 'active'
         AND s.expires_at > lower(v_res.blocked_range)
     )
  THEN
    UPDATE reservations
    SET
      status        = 'expired',
      refund_status = 'needs_refund',
      updated_at    = now()
    WHERE id = v_res.id;

    RETURN jsonb_build_object(
      'ok',            false,
      'code',          'SLOT_LOST',
      'refund_status', 'needs_refund',
      'message',       'Waktu hold habis dan slot meja telah terisi oleh reservasi lain.'
    );
  END IF;

  -- 4. Free slot exists: confirm reservation and mark paid (even if hold_expires_at had elapsed)
  UPDATE reservations
  SET
    status     = 'confirmed',
    paid_at    = COALESCE(v_res.paid_at, now()),
    updated_at = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',         true,
    'status',     'confirmed',
    'paid_at',    COALESCE(v_res.paid_at, now()),
    'table_code', v_table.code
  );
END;
$$;

-- ── 8. UPDATED LOCKING IN UPGRADE_TABLE_SESSION & EXTEND_HOLD ─────────────────

CREATE OR REPLACE FUNCTION upgrade_table_session(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id        uuid;
  v_session         table_sessions%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_walkin_interval interval;
  v_buffer_interval interval;
  v_max_expiry      timestamptz;
  v_next_res_start  timestamptz;
  v_new_expiry      timestamptz;
BEGIN
  -- 1. Identify table_id of active session
  SELECT table_id
  INTO v_table_id
  FROM table_sessions
  WHERE session_token = p_token AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION');
  END IF;

  -- 2. Lock tables row first (consistent lock ordering: tables -> table_sessions)
  PERFORM 1
  FROM tables
  WHERE id = v_table_id
  FOR UPDATE;

  -- 3. Lock session row
  SELECT *
  INTO v_session
  FROM table_sessions
  WHERE session_token = p_token AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION');
  END IF;

  -- 4. Fetch branch settings
  SELECT * INTO v_branch FROM branches WHERE id = v_session.branch_id;

  v_walkin_interval := (COALESCE(v_branch.walkin_lock_minutes, 180) * INTERVAL '1 minute');
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');

  v_max_expiry := v_session.started_at + v_walkin_interval;

  -- 5. Cap to next upcoming reservation start - buffer if any
  SELECT r.starts_at
  INTO v_next_res_start
  FROM reservations r
  WHERE
    r.table_id = v_session.table_id
    AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed')
    AND r.starts_at > now()
  ORDER BY r.starts_at ASC
  LIMIT 1;

  IF FOUND AND v_next_res_start IS NOT NULL THEN
    v_max_expiry := LEAST(v_max_expiry, v_next_res_start - v_buffer_interval);
  END IF;

  v_new_expiry := GREATEST(v_session.expires_at, v_max_expiry);

  -- 6. Upgrade session
  UPDATE table_sessions
  SET
    expires_at  = v_new_expiry,
    upgraded_at = COALESCE(v_session.upgraded_at, now())
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok',          true,
    'expires_at',  v_new_expiry,
    'upgraded_at', COALESCE(v_session.upgraded_at, now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION extend_table_session_soft_hold(
  p_token       text,
  p_max_minutes integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id        uuid;
  v_session         table_sessions%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_buffer_interval interval;
  v_next_res_start  timestamptz;
  v_target_expiry   timestamptz;
  v_new_expiry      timestamptz;
BEGIN
  -- 1. Identify table_id of active session
  SELECT table_id
  INTO v_table_id
  FROM table_sessions
  WHERE session_token = p_token AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION');
  END IF;

  -- 2. Lock tables row first
  PERFORM 1
  FROM tables
  WHERE id = v_table_id
  FOR UPDATE;

  -- 3. Lock session row
  SELECT *
  INTO v_session
  FROM table_sessions
  WHERE session_token = p_token AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION');
  END IF;

  IF v_session.upgraded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'expires_at', v_session.expires_at,
      'upgraded',   true
    );
  END IF;

  -- 4. Branch settings
  SELECT * INTO v_branch FROM branches WHERE id = v_session.branch_id;
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');

  v_target_expiry := now() + (COALESCE(p_max_minutes, 45) * INTERVAL '1 minute');

  SELECT r.starts_at
  INTO v_next_res_start
  FROM reservations r
  WHERE
    r.table_id = v_session.table_id
    AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed')
    AND r.starts_at > now()
  ORDER BY r.starts_at ASC
  LIMIT 1;

  IF FOUND AND v_next_res_start IS NOT NULL THEN
    v_target_expiry := LEAST(v_target_expiry, v_next_res_start - v_buffer_interval);
  END IF;

  v_new_expiry := GREATEST(v_session.expires_at, v_target_expiry);

  UPDATE table_sessions
  SET expires_at = v_new_expiry
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok',         true,
    'expires_at', v_new_expiry,
    'upgraded',   false
  );
END;
$$;

-- ── 9. UPDATED ADMIN_TRANSITION_RESERVATION (cancel with proof -> needs_refund) ──

CREATE OR REPLACE FUNCTION admin_transition_reservation(
  p_reservation_id uuid,
  p_action         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res   reservations%ROWTYPE;
  v_table tables%ROWTYPE;
  v_refund text;
BEGIN
  -- Handle confirm
  IF p_action = 'confirm' THEN
    RETURN confirm_reservation_payment(p_reservation_id);
  END IF;

  -- Lock reservation row
  SELECT *
  INTO v_res
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Handle mark_refunded
  IF p_action = 'mark_refunded' THEN
    IF v_res.refund_status <> 'needs_refund' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Hanya reservasi dengan status needs_refund yang dapat ditandai selesai refund.');
    END IF;

    UPDATE reservations
    SET
      refund_status = 'refunded',
      updated_at    = now()
    WHERE id = v_res.id;

    RETURN jsonb_build_object(
      'ok',            true,
      'id',            v_res.id,
      'status',        v_res.status,
      'refund_status', 'refunded'
    );
  END IF;

  -- Lock table row for cancel, no_show, complete
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = v_res.table_id
  FOR UPDATE;

  IF v_res.status IN ('cancelled', 'completed', 'no_show', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_TERMINAL', 'message', 'Status reservasi sudah final, tidak dapat diubah.');
  END IF;

  CASE p_action
    WHEN 'cancel' THEN
      -- Cancel of awaiting_confirmation with proof sets needs_refund
      v_refund := CASE
        WHEN v_res.paid_at IS NOT NULL THEN 'needs_refund'
        WHEN v_res.status = 'awaiting_confirmation' AND v_res.payment_proof_url IS NOT NULL THEN 'needs_refund'
        ELSE 'none'
      END;

      UPDATE reservations
      SET
        status        = 'cancelled',
        refund_status = v_refund,
        updated_at    = now()
      WHERE id = v_res.id;

      UPDATE table_sessions
      SET
        status          = 'released',
        released_reason = 'cancelled',
        released_at     = now()
      WHERE (id = v_res.session_id OR reservation_id = v_res.id)
        AND status = 'active';

      RETURN jsonb_build_object(
        'ok',            true,
        'id',            v_res.id,
        'status',        'cancelled',
        'refund_status', v_refund
      );

    WHEN 'no_show' THEN
      IF v_res.status NOT IN ('confirmed', 'awaiting_confirmation') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Hanya reservasi yang sudah dikonfirmasi yang bisa ditandai tidak hadir.');
      END IF;

      UPDATE reservations
      SET
        status     = 'no_show',
        updated_at = now()
      WHERE id = v_res.id;

      UPDATE table_sessions
      SET
        status          = 'released',
        released_reason = 'no_show',
        released_at     = now()
      WHERE (id = v_res.session_id OR reservation_id = v_res.id)
        AND status = 'active';

      RETURN jsonb_build_object(
        'ok',     true,
        'id',     v_res.id,
        'status', 'no_show'
      );

    WHEN 'complete' THEN
      IF v_res.status <> 'seated' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Hanya reservasi dengan status seated yang dapat diselesaikan.');
      END IF;

      UPDATE reservations
      SET
        status     = 'completed',
        updated_at = now()
      WHERE id = v_res.id;

      UPDATE table_sessions
      SET
        status          = 'released',
        released_reason = 'completed',
        released_at     = now()
      WHERE (id = v_res.session_id OR reservation_id = v_res.id)
        AND status = 'active';

      RETURN jsonb_build_object(
        'ok',     true,
        'id',     v_res.id,
        'status', 'completed'
      );

    ELSE
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', format('Aksi tidak dikenal: %s', p_action));
  END CASE;
END;
$$;

-- ── 10. UPDATED LOOKUP_RESERVATION (with verifier throttle) ────────────────────

CREATE OR REPLACE FUNCTION lookup_reservation(
  p_code     text,
  p_verifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res              reservations%ROWTYPE;
  v_table            tables%ROWTYPE;
  v_remaining_hold   integer := NULL;
  v_code_lock        jsonb;
BEGIN
  -- 0. Check verifier throttle lockout per code (max 5 failed attempts in 15 minutes)
  SELECT check_rate_limit('verifier_fail:' || upper(trim(p_code)), 5, 900) INTO v_code_lock;
  IF (v_code_lock->>'allowed')::boolean = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = upper(trim(p_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Verifier: last 4 digits of phone OR owner_token_hash
  IF right(v_res.customer_phone, 4) <> p_verifier
     AND COALESCE(v_res.owner_token_hash, '') <> p_verifier THEN
    -- Increment wrong attempt counter
    PERFORM check_rate_limit('verifier_fail:' || upper(trim(p_code)), 5, 900);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  DELETE FROM rate_limits WHERE key = 'verifier_fail:' || upper(trim(p_code));

  SELECT * INTO v_table FROM tables WHERE id = v_res.table_id;

  IF v_res.hold_expires_at IS NOT NULL THEN
    v_remaining_hold := GREATEST(0, EXTRACT(EPOCH FROM (v_res.hold_expires_at - now()))::integer);
  END IF;

  RETURN jsonb_build_object(
    'ok',                     true,
    'code',                   v_res.code,
    'status',                 v_res.status,
    'starts_at',              v_res.starts_at,
    'ends_at',                v_res.ends_at,
    'duration_minutes',       v_res.duration_minutes,
    'table_code',             v_table.code,
    'party_size',             v_res.party_size,
    'occasion',               v_res.occasion,
    'notes',                  v_res.notes,
    'items',                  v_res.items,
    'total',                  v_res.preorder_total,
    'hold_countdown_seconds', v_remaining_hold,
    'refund_status',          v_res.refund_status
  );
END;
$$;
