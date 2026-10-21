/*
 * Migration: 20261022000003_checkin_bump_walkin
 *
 * Updates check_in_reservation to release any active session on the target table
 * (e.g. walk-in holding the table during the early check-in window)
 * so that the reservation owner can check in without unique constraint conflict.
 */

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

  -- 4. Release any existing active session on target table (e.g. walk-in holding table during early arrival window)
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'reservation_checkin',
    released_at     = now()
  WHERE table_id = v_res.table_id
    AND status = 'active';

  -- 5. Release caller's other active session if any
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE session_token = p_token
    AND status = 'active';

  -- 6. Create new table_session tied to this reservation
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

  -- 7. Transition reservation to seated + session_id
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
