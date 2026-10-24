-- Migration: 20261025010000_trusted_wifi_cooldown.sql
-- Description:
-- 1. Migrate branches.trusted_ip_hashes to jsonb with { id, hash, hash_prefix, added_by, added_at, label }
-- 2. Add branches.claim_cooldown_minutes (default 10)
-- 3. Create soft_hold_cooldowns table
-- 4. Update claim_table to support cooldown, trusted Wi-Fi jsonb, and move cap exemption
-- 5. Update sweep_reservations to clean soft_hold_cooldowns and record cooldowns for expired soft holds

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. BRANCHES SCHEMA MIGRATIONS ─────────────────────────────────────────────

-- 1.1 Convert branches.trusted_ip_hashes from text[] to jsonb if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches'
      AND column_name = 'trusted_ip_hashes'
      AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS trusted_ip_hashes_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb;

    UPDATE branches
    SET trusted_ip_hashes_jsonb = COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'hash', elem,
            'hash_prefix', substring(elem FROM 1 FOR 8),
            'added_by', 'system (migrated)',
            'added_at', now()::text,
            'label', 'Wi-Fi (migrated)'
          )
        )
        FROM unnest(trusted_ip_hashes) AS elem
      ),
      '[]'::jsonb
    );

    ALTER TABLE branches DROP COLUMN trusted_ip_hashes;
    ALTER TABLE branches RENAME COLUMN trusted_ip_hashes_jsonb TO trusted_ip_hashes;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches'
      AND column_name = 'trusted_ip_hashes'
  ) THEN
    ALTER TABLE branches ADD COLUMN trusted_ip_hashes jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 1.2 Add claim_cooldown_minutes to branches (default 10)
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS claim_cooldown_minutes integer NOT NULL DEFAULT 10;


-- ── 2. TABLE: soft_hold_cooldowns ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS soft_hold_cooldowns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  table_id    uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  ip_hash     text,
  token_hash  text,
  until       timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soft_hold_cooldowns_lookup
  ON soft_hold_cooldowns (table_id, until);

CREATE INDEX IF NOT EXISTS idx_soft_hold_cooldowns_cleanup
  ON soft_hold_cooldowns (until);

ALTER TABLE soft_hold_cooldowns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soft_hold_cooldowns FROM PUBLIC, anon, authenticated;


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
  -- 0a. Delete rate_limits rows older than 1 day
  DELETE FROM rate_limits
  WHERE window_start < now() - INTERVAL '1 day';

  -- 0b. Clean old cooldown rows
  DELETE FROM soft_hold_cooldowns
  WHERE until <= now();

  -- 0c. Record cooldowns for un-upgraded soft holds that expired naturally
  INSERT INTO soft_hold_cooldowns (branch_id, table_id, ip_hash, token_hash, until)
  SELECT
    s.branch_id,
    s.table_id,
    s.ip_hash,
    encode(sha256(s.session_token::bytea), 'hex'),
    now() + (COALESCE(b.claim_cooldown_minutes, 10) * INTERVAL '1 minute')
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


-- ── 4. UPDATED CLAIM_TABLE FUNCTION ──────────────────────────────────────────

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
  v_is_trusted         boolean := false;
  v_token_hash         text;
  v_cooldown_until     timestamptz;
  v_remaining_seconds  integer;
  v_remaining_minutes  integer;
  v_ip_hold_count      integer;
  v_soft_hold_interval interval;
  v_candidate_expiry   timestamptz;
  v_effective_exp      timestamptz;
  v_buffer_interval    interval;
  v_res_starts_at      timestamptz;
  v_res_ends_at        timestamptz;
  v_new_session        table_sessions%ROWTYPE;
BEGIN
  -- 0. Always sweep reservations and expired cooldowns first
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

  -- 2.1 Calculate token hash
  v_token_hash := encode(sha256(p_token::bytea), 'hex');

  -- 2.2 Determine if caller is on trusted Wi-Fi (reads JSONB array)
  IF p_ip_hash IS NOT NULL AND v_branch.trusted_ip_hashes IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_branch.trusted_ip_hashes) AS elem
      WHERE elem->>'hash' = p_ip_hash
         OR elem #>> '{}' = p_ip_hash
    ) INTO v_is_trusted;
  END IF;

  -- 3. Expire stale active sessions for this table (and insert cooldown if soft hold)
  INSERT INTO soft_hold_cooldowns (branch_id, table_id, ip_hash, token_hash, until)
  SELECT
    s.branch_id,
    s.table_id,
    s.ip_hash,
    encode(sha256(s.session_token::bytea), 'hex'),
    now() + (COALESCE(v_branch.claim_cooldown_minutes, 10) * INTERVAL '1 minute')
  FROM table_sessions s
  WHERE s.table_id = v_table.id
    AND s.status = 'active'
    AND s.expires_at <= now()
    AND s.upgraded_at IS NULL;

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
  INSERT INTO soft_hold_cooldowns (branch_id, table_id, ip_hash, token_hash, until)
  SELECT
    s.branch_id,
    s.table_id,
    s.ip_hash,
    encode(sha256(s.session_token::bytea), 'hex'),
    now() + (COALESCE(v_branch.claim_cooldown_minutes, 10) * INTERVAL '1 minute')
  FROM table_sessions s
  WHERE s.session_token = p_token
    AND s.status = 'active'
    AND s.expires_at <= now()
    AND s.upgraded_at IS NULL;

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

  -- 6. Check Cooldown: if unexpired cooldown exists for the same table + same ip_hash/token, return TABLE_COOLDOWN (trusted IPs exempt)
  IF NOT v_is_trusted THEN
    SELECT until INTO v_cooldown_until
    FROM soft_hold_cooldowns
    WHERE table_id = v_table.id
      AND until > now()
      AND (
        (p_ip_hash IS NOT NULL AND ip_hash = p_ip_hash)
        OR
        (token_hash IS NOT NULL AND token_hash = v_token_hash)
      )
    ORDER BY until DESC
    LIMIT 1;

    IF FOUND THEN
      v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_cooldown_until - now()))::integer);
      v_remaining_minutes := GREATEST(1, CEIL(v_remaining_seconds::numeric / 60.0)::integer);
      RETURN jsonb_build_object(
        'ok',                false,
        'code',              'TABLE_COOLDOWN',
        'until',             v_cooldown_until,
        'remaining_seconds', v_remaining_seconds,
        'remaining_minutes', v_remaining_minutes
      );
    END IF;
  END IF;

  -- 7. Check per-IP non-upgraded hold limit (skips for trusted Wi-Fi hashes; uses branch value otherwise)
  -- Moving tables must not count caller's own old soft hold (session_token <> p_token)
  IF p_ip_hash IS NOT NULL AND NOT v_is_trusted THEN
    SELECT count(*)
    INTO v_ip_hold_count
    FROM table_sessions
    WHERE branch_id = p_branch_id
      AND ip_hash   = p_ip_hash
      AND status    = 'active'
      AND upgraded_at IS NULL
      AND session_token <> p_token;

    IF v_ip_hold_count >= COALESCE(v_branch.claim_max_holds_per_ip, 15) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_HOLDS');
    END IF;
  END IF;

  -- 8. Calculate soft hold candidate expiry
  v_soft_hold_interval := (COALESCE(v_branch.claim_soft_hold_minutes, 20) * INTERVAL '1 minute');
  v_candidate_expiry   := now() + v_soft_hold_interval;
  v_effective_exp      := v_candidate_expiry;

  -- 9. Check whole reservation window
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

  -- 10. Release caller's active session on any other table (record cooldown if unupgraded)
  INSERT INTO soft_hold_cooldowns (branch_id, table_id, ip_hash, token_hash, until)
  SELECT
    s.branch_id,
    s.table_id,
    s.ip_hash,
    encode(sha256(s.session_token::bytea), 'hex'),
    now() + (COALESCE(v_branch.claim_cooldown_minutes, 10) * INTERVAL '1 minute')
  FROM table_sessions s
  WHERE s.session_token = p_token
    AND s.status = 'active'
    AND s.table_id <> v_table.id
    AND s.upgraded_at IS NULL;

  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE
    session_token = p_token
    AND status    = 'active'
    AND table_id  <> v_table.id;

  -- 11. Insert the new active session
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
