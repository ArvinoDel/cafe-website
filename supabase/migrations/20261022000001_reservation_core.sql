/*
 * Migration: 20261022000001_reservation_core
 *
 * Core Reservation Engine & Concurrency Synchronization
 *
 * 1. Schema Updates:
 *    - reservations: duration_minutes, occasion, items, preorder_total, payment_method,
 *      paid_at, refund_status, owner_token_hash, ip_hash, blocked_range, hold_extended.
 *    - Statuses: pending_payment, awaiting_confirmation, confirmed, seated, completed,
 *      cancelled, expired, no_show.
 *    - CHECK: status IN ('confirmed', 'seated', 'completed') requires paid_at IS NOT NULL.
 *    - EXCLUDE USING gist (table_id WITH =, blocked_range WITH &&)
 *      WHERE status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'seated').
 *    - table_id FK -> ON DELETE RESTRICT.
 *    - branches: timezone ('Asia/Jakarta'), reservation_cancel_lead_minutes (180),
 *      reservation_checkin_early_minutes (15).
 *    - table_sessions: add reservation_id column referencing reservations(id).
 *
 * 2. SQL Functions (SECURITY DEFINER, search_path = public):
 *    - sweep_reservations(p_branch_id uuid DEFAULT NULL)
 *    - available_tables(p_branch_id uuid, p_starts_at timestamptz, p_duration_minutes integer, p_party_size integer)
 *    - create_reservation_hold(...)
 *    - claim_payment(p_code text, p_verifier text, p_proof_path text)
 *    - confirm_reservation_payment(p_reservation_id uuid)
 *    - cancel_reservation(p_code text, p_verifier text)
 *    - update_reservation_details(p_code text, p_verifier text, p_notes text, p_occasion text)
 *    - reschedule_reservation(p_code text, p_verifier text, p_new_starts_at timestamptz, p_new_table_id uuid)
 *    - check_in_reservation(p_code text, p_verifier text, p_token text)
 *    - lookup_reservation(p_code text, p_verifier text)
 *
 * All functions take SELECT ... FOR UPDATE on the tables row to eliminate races with claim_table.
 */

-- ── 0. Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. SCHEMA UPDATES ─────────────────────────────────────────────────────────

-- Branches columns
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS reservation_cancel_lead_minutes integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS reservation_checkin_early_minutes integer NOT NULL DEFAULT 15;

-- table_sessions reservation_id link
ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS reservation_id uuid NULL REFERENCES reservations(id) ON DELETE SET NULL;

-- reservations columns
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS duration_minutes  integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS occasion          text    NULL,
  ADD COLUMN IF NOT EXISTS items             jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method    text    NULL,
  ADD COLUMN IF NOT EXISTS paid_at           timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refund_status     text    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS owner_token_hash  text    NULL,
  ADD COLUMN IF NOT EXISTS ip_hash           text    NULL,
  ADD COLUMN IF NOT EXISTS blocked_range     tstzrange NULL,
  ADD COLUMN IF NOT EXISTS hold_extended     boolean NOT NULL DEFAULT false;

-- Duration constraint (60..180, step 30)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_reservations_duration_minutes'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_duration_minutes
      CHECK (duration_minutes IN (60, 90, 120, 150, 180));
  END IF;
END $$;

-- Refund status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_reservations_refund_status'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservations_refund_status
      CHECK (refund_status IN ('none', 'needs_refund', 'refunded'));
  END IF;
END $$;

-- Status constraint
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN (
    'pending_payment',
    'awaiting_confirmation',
    'confirmed',
    'seated',
    'completed',
    'cancelled',
    'expired',
    'no_show'
  ));

-- Backfill paid_at for existing confirmed/seated/completed rows before constraint
UPDATE reservations
SET paid_at = COALESCE(paid_at, now())
WHERE status IN ('confirmed', 'seated', 'completed') AND paid_at IS NULL;

-- Paid_at required constraint
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_paid_at_required;
ALTER TABLE reservations
  ADD CONSTRAINT chk_reservations_paid_at_required
  CHECK (status NOT IN ('confirmed', 'seated', 'completed') OR paid_at IS NOT NULL);

-- Backfill blocked_range for existing rows
UPDATE reservations r
SET blocked_range = tstzrange(
  r.starts_at - (COALESCE(b.reservation_buffer_minutes, 15) * INTERVAL '1 minute'),
  r.ends_at + (COALESCE(b.reservation_buffer_minutes, 15) * INTERVAL '1 minute'),
  '[)'
)
FROM branches b
WHERE r.branch_id = b.id AND r.blocked_range IS NULL;

-- Replace exclusion constraint with blocked_range exclusion
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS no_overlapping_reservations;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS no_overlapping_reservations_blocked_range;

ALTER TABLE reservations
  ADD CONSTRAINT no_overlapping_reservations_blocked_range
  EXCLUDE USING gist (
    table_id WITH =,
    blocked_range WITH &&
  )
  WHERE (status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'seated'));

-- Update table_id FK to ON DELETE RESTRICT
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_table_id_fkey;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_table_id_fkey
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE RESTRICT;

-- Index on blocked_range
CREATE INDEX IF NOT EXISTS idx_reservations_blocked_range
  ON reservations USING gist (table_id, blocked_range);

CREATE INDEX IF NOT EXISTS idx_reservations_owner_token_hash
  ON reservations (owner_token_hash);

CREATE INDEX IF NOT EXISTS idx_reservations_ip_hash
  ON reservations (branch_id, ip_hash)
  WHERE status = 'pending_payment';


-- ── 2. SQL FUNCTIONS ──────────────────────────────────────────────────────────

-- ── 2.1 sweep_reservations ───────────────────────────────────────────────────

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
  WITH expired_rows AS (
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
  SELECT count(*) INTO v_expired_count FROM expired_rows;

  -- 2. confirmed with no session after starts_at + grace -> no_show
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

  -- 3. seated whose session ended -> completed
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
    'expired_count',   v_expired_count,
    'no_show_count',   v_no_show_count,
    'completed_count', v_completed_count,
    'swept_at',        now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION sweep_reservations(uuid) FROM PUBLIC, anon, authenticated;


-- ── 2.2 available_tables ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION available_tables(
  p_branch_id        uuid,
  p_starts_at        timestamptz,
  p_duration_minutes integer,
  p_party_size       integer
)
RETURNS TABLE (
  id    uuid,
  code  text,
  label text,
  seats integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch          branches%ROWTYPE;
  v_buffer_interval interval;
  v_ends_at         timestamptz;
  v_blocked_range   tstzrange;
BEGIN
  -- Always run sweep first
  PERFORM sweep_reservations(p_branch_id);

  SELECT * INTO v_branch FROM branches WHERE branches.id = p_branch_id;
  IF NOT FOUND OR v_branch.reservations_enabled = false THEN
    RETURN;
  END IF;

  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');
  v_ends_at         := p_starts_at + (COALESCE(p_duration_minutes, 120) * INTERVAL '1 minute');
  v_blocked_range   := tstzrange(p_starts_at - v_buffer_interval, v_ends_at + v_buffer_interval, '[)');

  RETURN QUERY
  SELECT
    t.id,
    t.code,
    t.label,
    t.seats
  FROM tables t
  WHERE t.branch_id = p_branch_id
    AND t.is_active = true
    AND t.seats >= p_party_size
    -- No overlapping reservation blocked range
    AND NOT EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.table_id = t.id
        AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'seated')
        AND r.blocked_range && v_blocked_range
    )
    -- No active table_session whose expires_at extends into the blocked window
    AND NOT EXISTS (
      SELECT 1
      FROM table_sessions s
      WHERE s.table_id = t.id
        AND s.status = 'active'
        AND s.expires_at > (p_starts_at - v_buffer_interval)
    )
  ORDER BY t.seats ASC, t.code ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION available_tables(uuid, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;


-- ── 2.3 create_reservation_hold ───────────────────────────────────────────────

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
  v_open_time          text;
  v_close_time         text;
  v_min_preorder       integer;
  v_phone_holds        integer;
  v_ip_holds           integer;
  v_hold_minutes       integer;
  v_hold_expires_at    timestamptz;
  v_res_id             uuid;
  v_requires_payment   boolean;
  v_initial_status     text;
BEGIN
  -- Always run sweep first
  PERFORM sweep_reservations(p_branch_id);

  -- 1. CRITICAL: Take the EXACT SAME row lock on tables that claim_table uses!
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = p_table_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND OR v_table.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_NOT_FOUND', 'message', 'Meja tidak ditemukan atau sedang tidak aktif.');
  END IF;

  IF v_table.seats < p_party_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CAPACITY_EXCEEDED', 'message', 'Kapasitas meja tidak mencukupi jumlah tamu.');
  END IF;

  -- 2. Fetch branch settings
  SELECT * INTO v_branch FROM branches WHERE id = p_branch_id;
  IF NOT FOUND OR v_branch.reservations_enabled = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESERVATIONS_DISABLED', 'message', 'Fitur reservasi sedang tidak aktif di cabang ini.');
  END IF;

  -- 3. Validate duration
  IF p_duration_minutes NOT IN (60, 90, 120, 150, 180) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DURATION', 'message', 'Durasi reservasi harus antara 60 hingga 180 menit dengan kelipatan 30 menit.');
  END IF;

  -- 4. Validate advance notice & max days ahead
  v_lead_interval := (COALESCE(v_branch.reservation_min_lead_minutes, 120) * INTERVAL '1 minute');
  IF p_starts_at < (now() + v_lead_interval) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MIN_LEAD_VIOLATION',
      'message', format('Reservasi harus dipesan minimal %s menit sebelumnya.', COALESCE(v_branch.reservation_min_lead_minutes, 120))
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

  -- 5. Time-of-day check in SQL using branch timezone (eliminates id-ID string comparison bug)
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

  -- 6. Items & Preorder Total validation
  v_min_preorder := COALESCE(v_branch.reservation_min_preorder, 0);
  IF v_min_preorder > 0 THEN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PREORDER_REQUIRED', 'message', 'Cabang ini mewajibkan pre-order menu untuk reservasi.');
    END IF;
    IF p_preorder_total < v_min_preorder THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'PREORDER_BELOW_MINIMUM',
        'message', format('Total pre-order minimal adalah Rp%s.', to_char(v_min_preorder, 'FM999,999,999'))
      );
    END IF;
  END IF;

  -- 7. Compute blocked_range
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');
  v_ends_at         := p_starts_at + (p_duration_minutes * INTERVAL '1 minute');
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

  -- 9. Check existing overlapping reservations (checked explicitly before insert)
  IF EXISTS (
    SELECT 1
    FROM reservations r
    WHERE r.table_id = p_table_id
      AND r.status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'seated')
      AND r.blocked_range && v_blocked_range
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_ALREADY_RESERVED', 'message', 'Meja sudah dipesan untuk waktu tersebut.');
  END IF;

  -- 10. Rate limit: at most 2 unpaid holds per phone and per ip_hash
  SELECT count(*)
  INTO v_phone_holds
  FROM reservations
  WHERE branch_id = p_branch_id
    AND customer_phone = p_customer_phone
    AND status = 'pending_payment';

  IF v_phone_holds >= 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TOO_MANY_HOLDS',
      'message', 'Terlalu banyak reservasi yang belum dibayar untuk nomor telepon ini.'
    );
  END IF;

  IF p_ip_hash IS NOT NULL THEN
    SELECT count(*)
    INTO v_ip_holds
    FROM reservations
    WHERE branch_id = p_branch_id
      AND ip_hash = p_ip_hash
      AND status = 'pending_payment';

    IF v_ip_holds >= 2 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'TOO_MANY_HOLDS',
        'message', 'Terlalu banyak reservasi yang belum dibayar dari jaringan/perangkat ini.'
      );
    END IF;
  END IF;

  -- 11. Calculate hold timeout & initial status
  v_requires_payment := (v_min_preorder > 0);
  v_initial_status   := CASE WHEN v_requires_payment THEN 'pending_payment' ELSE 'awaiting_confirmation' END;
  v_hold_minutes     := COALESCE(v_branch.reservation_hold_minutes, 15);
  v_hold_expires_at  := CASE WHEN v_requires_payment THEN now() + (v_hold_minutes * INTERVAL '1 minute') ELSE NULL END;

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
      COALESCE(p_items, '[]'::jsonb),
      COALESCE(p_preorder_total, 0),
      v_initial_status,
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
    'status',          v_initial_status,
    'starts_at',       p_starts_at,
    'ends_at',         v_ends_at,
    'hold_expires_at', v_hold_expires_at,
    'table_code',      v_table.code,
    'table_label',     v_table.label
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_reservation_hold(
  uuid, uuid, text, text, text, text, integer, timestamptz, integer, text, text, jsonb, integer, text, text
) FROM PUBLIC, anon, authenticated;


-- ── 2.4 claim_payment ─────────────────────────────────────────────────────────

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
BEGIN
  -- 1. Find reservation with row lock
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  -- Same 404 for wrong code or wrong verifier
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  IF right(v_res.customer_phone, 4) <> p_verifier
     AND COALESCE(v_res.owner_token_hash, '') <> p_verifier THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- 2. Validate current state
  IF v_res.status <> 'pending_payment' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status reservasi bukan menunggu pembayaran.');
  END IF;

  IF v_res.hold_expires_at IS NOT NULL AND v_res.hold_expires_at <= now() THEN
    UPDATE reservations SET status = 'expired', updated_at = now() WHERE id = v_res.id;
    RETURN jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED', 'message', 'Waktu pembayaran reservasi telah berakhir.');
  END IF;

  -- 3. Extend hold once by 30 minutes
  IF v_res.hold_extended = false THEN
    v_new_hold_expires := COALESCE(v_res.hold_expires_at, now()) + INTERVAL '30 minutes';
    v_is_extended      := true;
  ELSE
    v_new_hold_expires := v_res.hold_expires_at;
    v_is_extended      := true;
  END IF;

  -- 4. Transition to awaiting_confirmation
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

REVOKE EXECUTE ON FUNCTION claim_payment(text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 2.5 confirm_reservation_payment ──────────────────────────────────────────

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

  -- 3. Check if hold expired and slot was lost
  IF (v_res.hold_expires_at IS NOT NULL AND v_res.hold_expires_at <= now())
     OR EXISTS (
       SELECT 1
       FROM reservations r
       WHERE r.table_id = v_res.table_id
         AND r.id <> v_res.id
         AND r.status IN ('confirmed', 'seated')
         AND r.blocked_range && v_res.blocked_range
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

  -- 4. Confirm the reservation and mark paid
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

REVOKE EXECUTE ON FUNCTION confirm_reservation_payment(uuid) FROM PUBLIC, anon, authenticated;


-- ── 2.6 cancel_reservation ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_reservation(
  p_code     text,
  p_verifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res           reservations%ROWTYPE;
  v_branch        branches%ROWTYPE;
  v_lead_interval interval;
  v_refund        text;
BEGIN
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
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  IF v_res.status IN ('cancelled', 'completed', 'no_show', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_TERMINAL', 'message', 'Reservasi sudah selesai atau telah dibatalkan.');
  END IF;

  -- 2. Validate cancellation lead time
  SELECT * INTO v_branch FROM branches WHERE id = v_res.branch_id;
  v_lead_interval := (COALESCE(v_branch.reservation_cancel_lead_minutes, 180) * INTERVAL '1 minute');

  IF now() > (v_res.starts_at - v_lead_interval) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TOO_LATE_TO_CANCEL',
      'message', format('Pembatalan hanya diperbolehkan hingga %s menit sebelum jadwal reservasi.', COALESCE(v_branch.reservation_cancel_lead_minutes, 180))
    );
  END IF;

  -- 3. Cancel & mark refund if paid
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

REVOKE EXECUTE ON FUNCTION cancel_reservation(text, text) FROM PUBLIC, anon, authenticated;


-- ── 2.7 update_reservation_details ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_reservation_details(
  p_code     text,
  p_verifier text,
  p_notes    text,
  p_occasion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res reservations%ROWTYPE;
BEGIN
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
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
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

REVOKE EXECUTE ON FUNCTION update_reservation_details(text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 2.8 reschedule_reservation ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reschedule_reservation(
  p_code          text,
  p_verifier      text,
  p_new_starts_at timestamptz,
  p_new_table_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  -- Always run sweep first
  SELECT * INTO v_res FROM reservations WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  IF right(v_res.customer_phone, 4) <> p_verifier
     AND COALESCE(v_res.owner_token_hash, '') <> p_verifier THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
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

REVOKE EXECUTE ON FUNCTION reschedule_reservation(text, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;


-- ── 2.9 check_in_reservation ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_in_reservation(
  p_code     text,
  p_verifier text,
  p_token    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res             reservations%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_table           tables%ROWTYPE;
  v_early_interval  interval;
  v_new_session_id  uuid;
BEGIN
  -- 1. Find reservation with row lock
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- Verifier: last 4 digits of phone OR owner_token_hash
  IF right(v_res.customer_phone, 4) <> p_verifier
     AND COALESCE(v_res.owner_token_hash, '') <> p_verifier THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
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

  -- 2. Validate arrival window
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

  -- 3. Lock target table row
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = v_res.table_id
  FOR UPDATE;

  -- 4. Release caller's other active session
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE session_token = p_token
    AND status = 'active';

  -- 5. Create new table_session tied to this reservation
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

  -- 6. Transition reservation to seated + session_id
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

REVOKE EXECUTE ON FUNCTION check_in_reservation(text, text, text) FROM PUBLIC, anon, authenticated;


-- ── 2.10 lookup_reservation ──────────────────────────────────────────────────

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
  v_hold_sec         integer := 0;
BEGIN
  -- 1. Find reservation
  SELECT *
  INTO v_res
  FROM reservations
  WHERE code = upper(trim(p_code));

  -- Return uniform 404 for wrong code or wrong verifier
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  IF right(v_res.customer_phone, 4) <> p_verifier
     AND COALESCE(v_res.owner_token_hash, '') <> p_verifier THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  SELECT * INTO v_table FROM tables WHERE id = v_res.table_id;

  IF v_res.hold_expires_at IS NOT NULL AND v_res.hold_expires_at > now() THEN
    v_hold_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_res.hold_expires_at - now()))::integer);
  END IF;

  -- Return only public fields — NEVER return payment_proof_url or full phone!
  RETURN jsonb_build_object(
    'ok',                      true,
    'code',                    v_res.code,
    'status',                  v_res.status,
    'starts_at',               v_res.starts_at,
    'ends_at',                 v_res.ends_at,
    'duration_minutes',        v_res.duration_minutes,
    'table_code',              v_table.code,
    'party_size',              v_res.party_size,
    'occasion',                v_res.occasion,
    'notes',                   v_res.notes,
    'total',                   v_res.preorder_total,
    'hold_countdown_seconds',  v_hold_sec,
    'refund_status',           v_res.refund_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION lookup_reservation(text, text) FROM PUBLIC, anon, authenticated;
