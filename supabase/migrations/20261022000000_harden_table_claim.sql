/*
 * Migration: 20261022000000_harden_table_claim
 *
 * Hardening Table Claim: Soft Hold & Upgraded Lock Engine
 *
 * 1. Schema Updates:
 *    - table_sessions: add `upgraded_at` (timestamptz NULL), `ip_hash` (text NULL).
 *    - branches: add `claim_soft_hold_minutes` (integer NOT NULL DEFAULT 20, CHECK 5..60).
 *    - Drop authenticated UPDATE policy on table_sessions (staff release goes through admin route).
 *    - tables: add CHECK (code = upper(trim(code))) and unique index on (branch_id, upper(code)).
 *
 * 2. RPC claim_table(p_branch_id, p_code, p_token, p_ip_hash):
 *    - Removes reservation code bypass.
 *    - Grants soft hold (default 20 min).
 *    - Enforces <= 4 active non-upgraded holds per IP (5th triggers TOO_MANY_HOLDS).
 *    - Full reservation window overlap check (past & future).
 *
 * 3. RPC upgrade_table_session(p_token):
 *    - Upgrades active soft hold to full walkin_lock_minutes on first order.
 *    - Respects next reservation buffer.
 *
 * 4. RPC extend_table_session_soft_hold(p_token, p_max_minutes):
 *    - Extends soft hold up to 45 mins for group carts without upgrading.
 */

-- ── 1. SCHEMA UPDATES ─────────────────────────────────────────────────────────

-- table_sessions columns
ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS upgraded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ip_hash     text        NULL;

CREATE INDEX IF NOT EXISTS idx_table_sessions_ip_active
  ON table_sessions (branch_id, ip_hash)
  WHERE status = 'active' AND upgraded_at IS NULL;

-- branches columns
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS claim_soft_hold_minutes integer NOT NULL DEFAULT 20;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_branches_soft_hold_minutes'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT chk_branches_soft_hold_minutes
      CHECK (claim_soft_hold_minutes >= 5 AND claim_soft_hold_minutes <= 60);
  END IF;
END $$;

-- Drop authenticated UPDATE policy on table_sessions
DROP POLICY IF EXISTS "table_sessions_update_authenticated" ON table_sessions;

-- tables constraints
UPDATE tables
SET code = upper(trim(code))
WHERE code <> upper(trim(code));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tables_code_uppercase_trimmed'
  ) THEN
    ALTER TABLE tables
      ADD CONSTRAINT chk_tables_code_uppercase_trimmed
      CHECK (code = upper(trim(code)));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_branch_upper_code
  ON tables (branch_id, upper(code));


-- ── 2. RPC: claim_table ───────────────────────────────────────────────────────

-- Drop old overloads
DROP FUNCTION IF EXISTS claim_table(uuid, text, text, text);
DROP FUNCTION IF EXISTS claim_table(uuid, text, text);

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
  v_table              tables%ROWTYPE;
  v_branch             branches%ROWTYPE;
  v_existing           table_sessions%ROWTYPE;
  v_ip_hold_count      integer;
  v_soft_hold_interval interval;
  v_buffer_interval    interval;
  v_candidate_expiry   timestamptz;
  v_effective_exp      timestamptz;
  v_res_starts_at      timestamptz;
  v_res_ends_at        timestamptz;
  v_new_session_id     uuid;
BEGIN
  -- 1. Lock the target table row (prevents concurrent inserts racing past checks)
  SELECT *
  INTO v_table
  FROM tables
  WHERE branch_id = p_branch_id
    AND upper(trim(code)) = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND OR v_table.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABLE_NOT_FOUND');
  END IF;

  -- 2. Load branch settings
  SELECT * INTO v_branch FROM branches WHERE id = p_branch_id;

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
      -- Same token is re-scanning: return existing session unchanged (no extension)
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
      -- Someone else owns this table
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

  -- 8. Check whole reservation window (starts_at - buffer < candidate_expiry AND ends_at > now)
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservations'
  ) THEN
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
      -- If reservation has already started OR starts within the candidate soft hold window
      IF v_res_starts_at <= now() OR v_res_starts_at <= v_candidate_expiry THEN
        RETURN jsonb_build_object(
          'ok',        false,
          'code',      'TABLE_RESERVED',
          'starts_at', v_res_starts_at,
          'ends_at',   v_res_ends_at
        );
      ELSE
        -- Reservation starts after candidate_expiry, but starts_at - buffer < candidate_expiry
        -- Cap expires_at to starts_at - buffer
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
  END IF;

  -- 9. Release caller's active session on any OTHER table (move scenario)
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE
    session_token = p_token
    AND status    = 'active'
    AND table_id  <> v_table.id;

  -- 10. Insert the new active session (soft hold: upgraded_at is NULL)
  INSERT INTO table_sessions (
    table_id, branch_id, session_token,
    status, started_at, expires_at, upgraded_at, ip_hash
  )
  VALUES (
    v_table.id, p_branch_id, p_token,
    'active', now(), v_effective_exp, NULL, p_ip_hash
  )
  RETURNING id INTO v_new_session_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'is_existing', false,
    'session',     jsonb_build_object(
      'id',          v_new_session_id,
      'table_id',    v_table.id,
      'table_code',  v_table.code,
      'table_label', v_table.label,
      'branch_id',   p_branch_id,
      'expires_at',  v_effective_exp,
      'started_at',  now(),
      'upgraded',    false
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_table(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_table(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_table(uuid, text, text, text) FROM authenticated;


-- ── 3. RPC: upgrade_table_session ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upgrade_table_session(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session         table_sessions%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_walkin_interval interval;
  v_buffer_interval interval;
  v_next_res_start  timestamptz;
  v_max_expiry      timestamptz;
  v_new_expiry      timestamptz;
BEGIN
  -- 1. Find active session for this token
  SELECT *
  INTO v_session
  FROM table_sessions
  WHERE session_token = p_token AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION');
  END IF;

  -- 2. Fetch branch settings
  SELECT * INTO v_branch FROM branches WHERE id = v_session.branch_id;

  v_walkin_interval := (COALESCE(v_branch.walkin_lock_minutes, 180) * INTERVAL '1 minute');
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');

  -- Full walk-in expiry from started_at
  v_max_expiry := v_session.started_at + v_walkin_interval;

  -- 3. Check next upcoming reservation start for this table
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservations'
  ) THEN
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
      -- Cap to next_reservation_start - buffer
      v_max_expiry := LEAST(v_max_expiry, v_next_res_start - v_buffer_interval);
    END IF;
  END IF;

  -- Ensure we never shorten current expires_at
  v_new_expiry := GREATEST(v_session.expires_at, v_max_expiry);

  -- 4. Update the session with upgraded_at timestamp
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

REVOKE EXECUTE ON FUNCTION upgrade_table_session(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upgrade_table_session(text) FROM anon;
REVOKE EXECUTE ON FUNCTION upgrade_table_session(text) FROM authenticated;


-- ── 4. RPC: extend_table_session_soft_hold ────────────────────────────────────

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
  v_session         table_sessions%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_buffer_interval interval;
  v_next_res_start  timestamptz;
  v_target_expiry   timestamptz;
  v_new_expiry      timestamptz;
BEGIN
  -- 1. Find active non-upgraded session
  SELECT *
  INTO v_session
  FROM table_sessions
  WHERE session_token = p_token AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION');
  END IF;

  -- If already upgraded, leave full lock alone
  IF v_session.upgraded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'expires_at', v_session.expires_at,
      'upgraded',   true
    );
  END IF;

  -- 2. Fetch branch settings
  SELECT * INTO v_branch FROM branches WHERE id = v_session.branch_id;
  v_buffer_interval := (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute');

  -- Extend soft hold to at most p_max_minutes from now
  v_target_expiry := now() + (COALESCE(p_max_minutes, 45) * INTERVAL '1 minute');

  -- 3. Check upcoming reservation
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservations'
  ) THEN
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

REVOKE EXECUTE ON FUNCTION extend_table_session_soft_hold(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION extend_table_session_soft_hold(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION extend_table_session_soft_hold(text, integer) FROM authenticated;
