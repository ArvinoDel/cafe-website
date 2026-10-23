-- Migration: 20261025000000_soft_hold_cap.sql
-- Description: Add branches.claim_max_holds_per_ip, branches.trusted_ip_hashes, and update claim_table to skip cap for trusted hashes

-- ── 1. SCHEMA UPDATES ─────────────────────────────────────────────────────────

-- 1.1 Add claim_max_holds_per_ip to branches (default 15)
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS claim_max_holds_per_ip integer NOT NULL DEFAULT 15;

-- 1.2 Add trusted_ip_hashes to branches (array of hashed client IPs)
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS trusted_ip_hashes text[] NOT NULL DEFAULT '{}';


-- ── 2. UPDATED CLAIM_TABLE FUNCTION ──────────────────────────────────────────

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

  -- 6. Check per-IP non-upgraded hold limit (skips for trusted Wi-Fi hashes; uses branch value otherwise)
  IF p_ip_hash IS NOT NULL AND NOT (p_ip_hash = ANY(COALESCE(v_branch.trusted_ip_hashes, '{}'::text[]))) THEN
    SELECT count(*)
    INTO v_ip_hold_count
    FROM table_sessions
    WHERE branch_id = p_branch_id
      AND ip_hash   = p_ip_hash
      AND status    = 'active'
      AND upgraded_at IS NULL;

    IF v_ip_hold_count >= COALESCE(v_branch.claim_max_holds_per_ip, 15) THEN
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
