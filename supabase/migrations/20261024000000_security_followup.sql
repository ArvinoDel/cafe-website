-- Migration: 20261024000000_security_followup.sql
-- Description: Security follow-up: rate_limits RLS & permissions, verifier throttle split, unreviewed proof handling.

-- ── 1. SCHEMA UPDATES ─────────────────────────────────────────────────────────

-- 1.1 Add proof_unreviewed flag to reservations table
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS proof_unreviewed boolean NOT NULL DEFAULT false;

-- 1.2 Enable Row Level Security on rate_limits table (no policies)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- 1.3 Revoke all permissions on rate_limits and helper functions from PUBLIC, anon, authenticated
REVOKE ALL ON TABLE rate_limits FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION normalize_phone(text) FROM PUBLIC, anon, authenticated;


-- ── 2. VERIFIER THROTTLE PRIMITIVES ───────────────────────────────────────────

-- 2.1 Peek verifier lock (read-only): checks if IP+code or per-code lock is triggered
CREATE OR REPLACE FUNCTION peek_verifier_lock(
  p_code     text,
  p_ip_hash  text DEFAULT NULL,
  p_is_owner boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code text := upper(trim(p_code));
  v_rec       record;
BEGIN
  -- 1. Per IP + Code lock: max 5 failed attempts in 15 minutes (900s)
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    SELECT * INTO v_rec
    FROM rate_limits
    WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;

    IF FOUND AND (v_rec.window_start + INTERVAL '900 seconds') > now() AND v_rec.count >= 5 THEN
      RETURN false;
    END IF;
  END IF;

  -- 2. Looser per-code ceiling: max 20 failed attempts in 15 minutes (900s)
  -- A request carrying the valid owner cookie hash bypasses this per-code ceiling
  IF NOT p_is_owner THEN
    SELECT * INTO v_rec
    FROM rate_limits
    WHERE key = 'v_fail_code:' || v_norm_code;

    IF FOUND AND (v_rec.window_start + INTERVAL '900 seconds') > now() AND v_rec.count >= 20 THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION peek_verifier_lock(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- 2.2 Record verifier failure (increment only on wrong verifier)
CREATE OR REPLACE FUNCTION record_verifier_failure(
  p_code    text,
  p_ip_hash text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code text := upper(trim(p_code));
BEGIN
  -- 1. Increment IP + Code failure counter (limit 5, window 900s)
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    PERFORM check_rate_limit('v_fail_ip:' || v_norm_code || ':' || p_ip_hash, 5, 900);
  END IF;

  -- 2. Increment per-code ceiling failure counter (limit 20, window 900s)
  PERFORM check_rate_limit('v_fail_code:' || v_norm_code, 20, 900);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_verifier_failure(text, text) FROM PUBLIC, anon, authenticated;


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
  -- 0. Delete rate_limits rows older than 1 day
  DELETE FROM rate_limits
  WHERE window_start < now() - INTERVAL '1 day';

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

  -- 2b. awaiting_confirmation WITH proof past staff confirm window -> expired + proof_unreviewed = true (do NOT set needs_refund)
  WITH expired_with_proof AS (
    UPDATE reservations r
    SET
      status           = 'expired',
      proof_unreviewed = true,
      updated_at       = now()
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

REVOKE EXECUTE ON FUNCTION sweep_reservations(uuid) FROM PUBLIC, anon, authenticated;


-- ── 4. FUNCTION OVERLOAD CLEANUP & RECREATION ─────────────────────────────────

-- Drop old signatures to avoid function ambiguity
DROP FUNCTION IF EXISTS claim_payment(text, text, text);
DROP FUNCTION IF EXISTS lookup_reservation(text, text);
DROP FUNCTION IF EXISTS check_in_reservation(text, text, text);
DROP FUNCTION IF EXISTS cancel_reservation(text, text);
DROP FUNCTION IF EXISTS update_reservation_details(text, text, text, text);
DROP FUNCTION IF EXISTS reschedule_reservation(text, text, timestamptz, uuid);


-- ── 4.1 claim_payment (updated throttle) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_payment(
  p_code       text,
  p_verifier   text,
  p_proof_path text,
  p_ip_hash    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code        text := upper(trim(p_code));
  v_res              reservations%ROWTYPE;
  v_branch           branches%ROWTYPE;
  v_new_hold_expires timestamptz;
  v_is_extended      boolean := false;
  v_is_owner         boolean := false;
BEGIN
  -- 1. Find reservation with row lock
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = v_norm_code
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
      PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  v_is_owner := (v_res.owner_token_hash IS NOT NULL AND v_res.owner_token_hash = p_verifier);

  -- 2. Peek verifier lock (read-only)
  IF NOT peek_verifier_lock(v_norm_code, p_ip_hash, v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 3. Verify credentials (phone last 4 OR owner_token_hash)
  IF right(v_res.customer_phone, 4) <> p_verifier AND NOT v_is_owner THEN
    PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset IP lockout on valid verifier
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;
  END IF;
  IF v_is_owner THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_code:' || v_norm_code;
  END IF;

  -- 4. Validate current state
  IF v_res.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status reservasi bukan menunggu pembayaran.');
  END IF;

  IF v_res.hold_expires_at IS NOT NULL AND v_res.hold_expires_at <= now() THEN
    UPDATE reservations SET status = 'expired', updated_at = now() WHERE id = v_res.id;
    RETURN jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED', 'message', 'Waktu pembayaran reservasi telah berakhir.');
  END IF;

  -- 5. Require valid proof path starting with '<code>/' and existing in storage.objects bucket 'reservation-proofs'
  IF p_proof_path IS NULL
     OR trim(p_proof_path) = ''
     OR p_proof_path NOT LIKE (v_norm_code || '/%')
     OR NOT EXISTS (
       SELECT 1
       FROM storage.objects
       WHERE bucket_id = 'reservation-proofs'
         AND name = p_proof_path
     ) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'code',    'PROOF_REQUIRED',
      'message', 'Bukti pembayaran wajib diunggah dan terverifikasi di server sebelum klaim dapat diproses.'
    );
  END IF;

  -- 6. Extend hold window for staff review
  SELECT * INTO v_branch FROM branches WHERE id = v_res.branch_id;
  v_new_hold_expires := now() + (COALESCE(v_branch.reservation_confirm_window_minutes, 120) * INTERVAL '1 minute');

  IF v_res.hold_extended = false AND (v_res.hold_expires_at IS NULL OR v_res.hold_expires_at < v_new_hold_expires) THEN
    v_is_extended := true;
  END IF;

  UPDATE reservations
  SET
    status            = 'awaiting_confirmation',
    payment_proof_url = p_proof_path,
    proof_unreviewed  = false,
    hold_expires_at   = CASE WHEN v_is_extended THEN v_new_hold_expires ELSE hold_expires_at END,
    hold_extended     = CASE WHEN v_is_extended THEN true ELSE hold_extended END,
    updated_at        = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',              true,
    'code',            v_res.code,
    'status',          'awaiting_confirmation',
    'hold_extended',   v_is_extended,
    'hold_expires_at', CASE WHEN v_is_extended THEN v_new_hold_expires ELSE v_res.hold_expires_at END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_payment(text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 4.2 lookup_reservation (updated throttle) ─────────────────────────────────

CREATE OR REPLACE FUNCTION lookup_reservation(
  p_code     text,
  p_verifier text,
  p_ip_hash  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code        text := upper(trim(p_code));
  v_res              reservations%ROWTYPE;
  v_table            tables%ROWTYPE;
  v_remaining_hold   integer := NULL;
  v_is_owner         boolean := false;
BEGIN
  -- 1. Find reservation
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = v_norm_code;

  IF NOT FOUND THEN
    IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
      PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  v_is_owner := (v_res.owner_token_hash IS NOT NULL AND v_res.owner_token_hash = p_verifier);

  -- 2. Peek verifier lock (read-only)
  IF NOT peek_verifier_lock(v_norm_code, p_ip_hash, v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 3. Verify credentials (phone last 4 OR owner_token_hash)
  IF right(v_res.customer_phone, 4) <> p_verifier AND NOT v_is_owner THEN
    PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;
  END IF;
  IF v_is_owner THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_code:' || v_norm_code;
  END IF;

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
    'refund_status',          v_res.refund_status,
    'proof_unreviewed',       v_res.proof_unreviewed
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION lookup_reservation(text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 4.3 check_in_reservation (updated throttle) ───────────────────────────────

CREATE OR REPLACE FUNCTION check_in_reservation(
  p_code     text,
  p_verifier text,
  p_token    text,
  p_ip_hash  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code       text := upper(trim(p_code));
  v_res             reservations%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_table           tables%ROWTYPE;
  v_early_interval  interval;
  v_new_session_id  uuid;
  v_is_owner        boolean := false;
BEGIN
  -- 1. Find reservation with row lock
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = v_norm_code
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
      PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  v_is_owner := (v_res.owner_token_hash IS NOT NULL AND v_res.owner_token_hash = p_verifier);

  -- 2. Peek verifier lock (read-only)
  IF NOT peek_verifier_lock(v_norm_code, p_ip_hash, v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 3. Verify credentials (phone last 4 OR owner_token_hash)
  IF right(v_res.customer_phone, 4) <> p_verifier AND NOT v_is_owner THEN
    PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;
  END IF;
  IF v_is_owner THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_code:' || v_norm_code;
  END IF;

  -- Idempotent check: if already seated with this token, return success
  IF v_res.status = 'seated' AND v_res.session_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM table_sessions WHERE id = v_res.session_id AND session_token = p_token AND status = 'active'
    ) THEN
      SELECT * INTO v_table FROM tables WHERE id = v_res.table_id;
      RETURN jsonb_build_object(
        'ok',           true,
        'status',       'seated',
        'session_id',   v_res.session_id,
        'table_id',     v_res.table_id,
        'table_code',   v_table.code,
        'table_label',  v_table.label,
        'branch_id',    v_res.branch_id,
        'reservation',  row_to_json(v_res)
      );
    END IF;
  END IF;

  IF v_res.status <> 'confirmed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_CONFIRMED',
      'message', format('Reservasi belum dikonfirmasi atau status saat ini: %s.', v_res.status)
    );
  END IF;

  -- 4. Validate arrival window
  SELECT * INTO v_branch FROM branches WHERE id = v_res.branch_id;
  v_early_interval := (COALESCE(v_branch.reservation_checkin_early_minutes, 15) * INTERVAL '1 minute');

  IF now() < (v_res.starts_at - v_early_interval) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CHECKIN_TOO_EARLY',
      'message', format('Check-in baru dibuka %s menit sebelum waktu reservasi (%s).', COALESCE(v_branch.reservation_checkin_early_minutes, 15), to_char(v_res.starts_at AT TIME ZONE COALESCE(v_branch.timezone, 'Asia/Jakarta'), 'HH24:MI'))
    );
  END IF;

  IF now() > v_res.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKIN_EXPIRED', 'message', 'Waktu reservasi telah berakhir.');
  END IF;

  -- 5. Lock target table row
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = v_res.table_id
  FOR UPDATE;

  -- 6. Release any existing active session on target table
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'reservation_checkin',
    released_at     = now()
  WHERE table_id = v_res.table_id
    AND status = 'active';

  -- 7. Release caller's other active session if any
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE session_token = p_token
    AND status = 'active';

  -- 8. Create new table_session tied to this reservation
  INSERT INTO table_sessions (
    table_id,
    branch_id,
    session_token,
    status,
    started_at,
    expires_at,
    upgraded_at,
    ip_hash,
    reservation_id
  )
  VALUES (
    v_res.table_id,
    v_res.branch_id,
    p_token,
    'active',
    now(),
    v_res.ends_at,
    now(),
    v_res.ip_hash,
    v_res.id
  )
  RETURNING id INTO v_new_session_id;

  -- 9. Transition reservation to seated + session_id
  UPDATE reservations
  SET
    status     = 'seated',
    session_id = v_new_session_id,
    updated_at = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',          true,
    'status',      'seated',
    'session_id',  v_new_session_id,
    'table_id',    v_res.table_id,
    'table_code',  v_table.code,
    'table_label', v_table.label,
    'branch_id',   v_res.branch_id,
    'reservation', row_to_json(v_res)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION check_in_reservation(text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 4.4 cancel_reservation (updated throttle) ─────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_reservation(
  p_code     text,
  p_verifier text,
  p_ip_hash  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code     text := upper(trim(p_code));
  v_res           reservations%ROWTYPE;
  v_branch        branches%ROWTYPE;
  v_lead_interval interval;
  v_refund        text;
  v_is_owner      boolean := false;
BEGIN
  -- 1. Find reservation with row lock
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = v_norm_code
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
      PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  v_is_owner := (v_res.owner_token_hash IS NOT NULL AND v_res.owner_token_hash = p_verifier);

  -- 2. Peek verifier lock (read-only)
  IF NOT peek_verifier_lock(v_norm_code, p_ip_hash, v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 3. Verify credentials (phone last 4 OR owner_token_hash)
  IF right(v_res.customer_phone, 4) <> p_verifier AND NOT v_is_owner THEN
    PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;
  END IF;
  IF v_is_owner THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_code:' || v_norm_code;
  END IF;

  IF v_res.status IN ('cancelled', 'completed', 'no_show', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_TERMINAL', 'message', 'Reservasi sudah selesai atau telah dibatalkan.');
  END IF;

  -- 4. Validate cancellation lead time
  SELECT * INTO v_branch FROM branches WHERE id = v_res.branch_id;
  v_lead_interval := (COALESCE(v_branch.reservation_cancel_lead_minutes, 180) * INTERVAL '1 minute');

  IF now() > (v_res.starts_at - v_lead_interval) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TOO_LATE_TO_CANCEL',
      'message', format('Pembatalan hanya diperbolehkan hingga %s menit sebelum jadwal reservasi.', COALESCE(v_branch.reservation_cancel_lead_minutes, 180))
    );
  END IF;

  -- 5. Cancel & mark refund if paid
  v_refund := CASE WHEN v_res.paid_at IS NOT NULL THEN 'needs_refund' ELSE 'none' END;

  UPDATE reservations
  SET
    status        = 'cancelled',
    refund_status = v_refund,
    updated_at    = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',            true,
    'code',          v_res.code,
    'status',        'cancelled',
    'refund_status', v_refund
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_reservation(text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 4.5 update_reservation_details (updated throttle) ─────────────────────────

CREATE OR REPLACE FUNCTION update_reservation_details(
  p_code     text,
  p_verifier text,
  p_notes    text,
  p_occasion text,
  p_ip_hash  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code text := upper(trim(p_code));
  v_res       reservations%ROWTYPE;
  v_is_owner  boolean := false;
BEGIN
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = v_norm_code
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
      PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  v_is_owner := (v_res.owner_token_hash IS NOT NULL AND v_res.owner_token_hash = p_verifier);

  -- 1. Peek verifier lock (read-only)
  IF NOT peek_verifier_lock(v_norm_code, p_ip_hash, v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 2. Verify credentials
  IF right(v_res.customer_phone, 4) <> p_verifier AND NOT v_is_owner THEN
    PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;
  END IF;
  IF v_is_owner THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_code:' || v_norm_code;
  END IF;

  IF v_res.status IN ('cancelled', 'completed', 'no_show', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_TERMINAL', 'message', 'Reservasi tidak dapat diubah.');
  END IF;

  UPDATE reservations
  SET
    notes      = trim(nullif(p_notes, '')),
    occasion   = trim(nullif(p_occasion, '')),
    updated_at = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',       true,
    'code',     v_res.code,
    'notes',    trim(nullif(p_notes, '')),
    'occasion', trim(nullif(p_occasion, ''))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION update_reservation_details(text, text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 4.6 reschedule_reservation (updated throttle) ─────────────────────────────

CREATE OR REPLACE FUNCTION reschedule_reservation(
  p_code          text,
  p_verifier      text,
  p_new_starts_at timestamptz,
  p_new_table_id  uuid,
  p_ip_hash       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_code       text := upper(trim(p_code));
  v_res             reservations%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_table           tables%ROWTYPE;
  v_lead_interval   interval;
  v_max_days        integer;
  v_tz              text;
  v_start_time      text;
  v_open_time       text;
  v_close_time      text;
  v_buffer_interval interval;
  v_ends_at         timestamptz;
  v_blocked_range   tstzrange;
  v_is_owner        boolean := false;
BEGIN
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = v_norm_code
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
      PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  v_is_owner := (v_res.owner_token_hash IS NOT NULL AND v_res.owner_token_hash = p_verifier);

  -- 1. Peek verifier lock (read-only)
  IF NOT peek_verifier_lock(v_norm_code, p_ip_hash, v_is_owner) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODE_LOCKED', 'message', 'Terlalu banyak percobaan verifikasi yang salah. Silakan coba lagi setelah 15 menit.');
  END IF;

  -- 2. Verify credentials
  IF right(v_res.customer_phone, 4) <> p_verifier AND NOT v_is_owner THEN
    PERFORM record_verifier_failure(v_norm_code, p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Reset lockout on valid verifier
  IF p_ip_hash IS NOT NULL AND p_ip_hash <> '' THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_ip:' || v_norm_code || ':' || p_ip_hash;
  END IF;
  IF v_is_owner THEN
    DELETE FROM rate_limits WHERE key = 'v_fail_code:' || v_norm_code;
  END IF;

  IF v_res.status NOT IN ('pending_payment', 'awaiting_confirmation', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Hanya reservasi aktif yang dapat dijadwalkan ulang.');
  END IF;

  -- Lock new table row
  SELECT * INTO v_table FROM tables WHERE id = p_new_table_id AND branch_id = v_res.branch_id FOR UPDATE;
  IF NOT FOUND OR v_table.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_NOT_FOUND', 'message', 'Meja tujuan tidak tersedia.');
  END IF;

  IF v_table.seats < v_res.party_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CAPACITY_EXCEEDED', 'message', 'Kapasitas meja baru tidak mencukupi.');
  END IF;

  SELECT * INTO v_branch FROM branches WHERE id = v_res.branch_id;

  -- Validate lead time & max days ahead
  v_lead_interval := (COALESCE(v_branch.reservation_min_lead_minutes, 120) * INTERVAL '1 minute');
  IF p_new_starts_at < (now() + v_lead_interval) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MIN_LEAD_VIOLATION', 'message', 'Jadwal baru harus minimal sesuai batas pemesanan awal.');
  END IF;

  v_max_days := COALESCE(v_branch.reservation_max_days_ahead, 30);
  IF p_new_starts_at > (now() + (v_max_days * INTERVAL '1 day')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAX_DAYS_EXCEEDED', 'message', 'Jadwal baru melebihi batas hari ke depan.');
  END IF;

  -- Validate opening hours in branch timezone
  v_tz := COALESCE(v_branch.timezone, 'Asia/Jakarta');
  v_start_time := to_char(p_new_starts_at AT TIME ZONE v_tz, 'HH24:MI');
  v_open_time  := COALESCE(v_branch.reservation_open_time, '08:00');
  v_close_time := COALESCE(v_branch.reservation_close_time, '21:00');

  IF v_start_time < v_open_time OR v_start_time >= v_close_time THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUTSIDE_HOURS', 'message', 'Jadwal baru di luar jam operasional reservasi.');
  END IF;

  -- Compute new blocked_range
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');
  v_ends_at         := p_new_starts_at + (v_res.duration_minutes * INTERVAL '1 minute');
  v_blocked_range   := tstzrange(p_new_starts_at - v_buffer_interval, v_ends_at + v_buffer_interval, '[)');

  -- Check active session overlap
  IF EXISTS (
    SELECT 1 FROM table_sessions
    WHERE table_id = p_new_table_id
      AND status = 'active'
      AND expires_at > (p_new_starts_at - v_buffer_interval)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_CURRENTLY_OCCUPIED', 'message', 'Meja sedang digunakan.');
  END IF;

  -- Check existing overlapping reservations (excluding this reservation row)
  IF EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.table_id = p_new_table_id
      AND r.id <> v_res.id
      AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'seated')
      AND r.blocked_range && v_blocked_range
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_ALREADY_RESERVED', 'message', 'Meja sudah dipesan di jadwal tersebut.');
  END IF;

  -- Update reservation
  UPDATE reservations
  SET
    table_id      = p_new_table_id,
    starts_at     = p_new_starts_at,
    ends_at       = v_ends_at,
    blocked_range = v_blocked_range,
    updated_at    = now()
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'ok',         true,
    'code',       v_res.code,
    'starts_at',  p_new_starts_at,
    'ends_at',    v_ends_at,
    'table_code', v_table.code
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION reschedule_reservation(text, text, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;
