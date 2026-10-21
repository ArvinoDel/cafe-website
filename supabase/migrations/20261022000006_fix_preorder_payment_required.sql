-- Migration: 20261022000005_fix_preorder_payment_required.sql
-- Description: Ensure create_reservation_hold marks reservations with preorder_total > 0 as pending_payment with active hold timer.

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

  -- 11. Calculate hold timeout & initial status (requires payment if branch min preorder > 0 OR customer preordered items)
  v_requires_payment := (v_min_preorder > 0 OR COALESCE(p_preorder_total, 0) > 0);
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
