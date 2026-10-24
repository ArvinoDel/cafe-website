-- Migration: 20261026000000_cooldown_retention.sql
-- Description:
-- 1. Replace sweep_reservations cooldown cleanup:
--    OLD: DELETE FROM soft_hold_cooldowns WHERE until <= now()
--    NEW: DELETE FROM soft_hold_cooldowns WHERE created_at < now() - INTERVAL '2 hours'
--    Rationale: keeping expired rows for 2 h feeds the "3+ unordered expiries in the
--    last 60 minutes" threshold count in claim_table.  The active-cooldown filter in
--    claim_table already uses "until > now()", so stale rows never block a new claim.

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
  -- 0a. Delete rate_limits rows older than 1 day
  DELETE FROM rate_limits
  WHERE window_start < now() - INTERVAL '1 day';

  -- 0b. Clean soft_hold_cooldowns rows older than 2 hours
  --     (NOT "until <= now()"; rows must be retained so the 3-expiry-in-60-min
  --      count in claim_table works correctly across multiple expired sessions.)
  DELETE FROM soft_hold_cooldowns
  WHERE created_at < now() - INTERVAL '2 hours';

  -- 0c. Record cooldowns for un-upgraded soft holds that expired naturally
  INSERT INTO soft_hold_cooldowns (branch_id, table_id, ip_hash, token_hash, until)
  SELECT
    s.branch_id,
    s.table_id,
    s.ip_hash,
    encode(sha256(convert_to(s.session_token, 'UTF8')), 'hex'),
    now() + (COALESCE(b.claim_cooldown_minutes, 3) * INTERVAL '1 minute')
  FROM table_sessions s
  JOIN branches b ON b.id = s.branch_id
  WHERE (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    AND s.status = 'active'
    AND s.expires_at <= now()
    AND s.upgraded_at IS NULL;

  UPDATE table_sessions
  SET
    status          = 'expired',
    released_reason = 'expired',
    released_at     = now()
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status = 'active'
    AND expires_at <= now();

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

  -- 2b. awaiting_confirmation WITH proof past staff confirm window -> expired + proof_unreviewed = true
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
