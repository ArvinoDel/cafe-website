/*
 * Migration: 20261022000002_admin_actions
 *
 * SQL-backed admin operations for reservations and table session release.
 * Enforces row locks (SELECT ... FOR UPDATE on tables and reservations)
 * and guarantees linked session release on cancel, no-show, or completion.
 */

-- ── 1. admin_transition_reservation ──────────────────────────────────────────

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
  v_res    reservations%ROWTYPE;
  v_table  tables%ROWTYPE;
  v_refund text;
BEGIN
  -- 1. Validate action
  IF p_action NOT IN ('confirm', 'cancel', 'no_show', 'complete', 'mark_refunded') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', 'Aksi tidak valid.');
  END IF;

  -- 2. Handle confirm via existing confirm_reservation_payment RPC
  IF p_action = 'confirm' THEN
    RETURN confirm_reservation_payment(p_reservation_id);
  END IF;

  -- 3. Lock reservation row
  SELECT *
  INTO v_res
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Reservasi tidak ditemukan.');
  END IF;

  -- 4. Handle mark_refunded
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

  -- 5. Lock table row for cancel, no_show, complete
  SELECT *
  INTO v_table
  FROM tables
  WHERE id = v_res.table_id
  FOR UPDATE;

  -- Check terminal states
  IF v_res.status IN ('cancelled', 'completed', 'no_show', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_TERMINAL', 'message', 'Status reservasi sudah final, tidak dapat diubah.');
  END IF;

  CASE p_action
    WHEN 'cancel' THEN
      v_refund := CASE WHEN v_res.paid_at IS NOT NULL THEN 'needs_refund' ELSE 'none' END;

      UPDATE reservations
      SET
        status        = 'cancelled',
        refund_status = v_refund,
        updated_at    = now()
      WHERE id = v_res.id;

      -- Release linked active table session if present
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

      -- Release linked active table session if present
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
      IF v_res.status NOT IN ('confirmed', 'seated') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Hanya reservasi aktif yang bisa diselesaikan.');
      END IF;

      UPDATE reservations
      SET
        status     = 'completed',
        updated_at = now()
      WHERE id = v_res.id;

      -- Release linked active table session if present
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
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', 'Aksi tidak didukung.');
  END CASE;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_transition_reservation(uuid, text) FROM PUBLIC, anon;


-- ── 2. admin_release_table_session ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_release_table_session(
  p_table_id   uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_reason     text DEFAULT 'staff'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess  table_sessions%ROWTYPE;
  v_table tables%ROWTYPE;
BEGIN
  IF p_session_id IS NULL AND p_table_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_REQUEST', 'message', 'table_id atau session_id diperlukan.');
  END IF;

  -- 1. Find active session
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_sess
    FROM table_sessions
    WHERE id = p_session_id AND status = 'active'
    FOR UPDATE;
  ELSE
    SELECT * INTO v_sess
    FROM table_sessions
    WHERE table_id = p_table_id AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'Tidak ada sesi aktif yang ditemukan.');
  END IF;

  -- 2. Lock table row
  SELECT * INTO v_table
  FROM tables
  WHERE id = v_sess.table_id
  FOR UPDATE;

  -- 3. Release the session
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = COALESCE(p_reason, 'staff'),
    released_at     = now()
  WHERE id = v_sess.id;

  RETURN jsonb_build_object(
    'ok',         true,
    'session_id', v_sess.id,
    'table_id',   v_sess.table_id,
    'message',    'Meja berhasil dikosongkan.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_release_table_session(uuid, uuid, text) FROM PUBLIC, anon;
