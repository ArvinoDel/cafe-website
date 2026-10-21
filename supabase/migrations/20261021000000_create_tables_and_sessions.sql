/*
 * Migration: 20261021000000_create_tables_and_sessions
 *
 * Phase 1 — Table Claim Lock
 *
 * 1. New table `tables`
 *    - Registry of physical tables per branch.
 *    - UNIQUE(branch_id, code) to prevent duplicate table codes per branch.
 *    - Backfilled from existing historical records (orders, table_requests, group_carts).
 *
 * 2. Branch settings columns (on existing `branches` table)
 *    - walkin_lock_minutes:          how long a walk-in QR claim lasts (default 180 = 3 h).
 *    - reservations_enabled:         feature flag, per-branch.
 *    - reservation_open_time:        opening time for reservation slots (HH:MM).
 *    - reservation_close_time:       closing time for reservation slots (HH:MM).
 *    - reservation_min_lead_minutes: minimum advance-notice before a reservation start.
 *    - reservation_max_days_ahead:   how far into the future reservations can be made.
 *    - reservation_hold_minutes:     how long to hold a pending_payment slot.
 *    - reservation_grace_minutes:    window after starts_at to still allow arrival check-in.
 *    - reservation_buffer_minutes:   gap kept clear before/after each reservation slot.
 *    - reservation_min_preorder:     minimum pre-order total required (0 = no minimum).
 *    - qris_image_url:               branch QRIS image URL for manual payment display.
 *
 * 3. New table `table_sessions`
 *    - Records an active table claim (walk-in or reservation).
 *    - Partial unique indexes enforce:
 *        a) Only one ACTIVE session per table_id.
 *        b) Only one ACTIVE session per session_token (claiming new table frees old one).
 *
 * 4. Postgres function `claim_table`
 *    - Single atomic transaction: lock → expire stale → check existing → check reservation
 *      clash → release old claim → insert new claim.
 *    - SECURITY DEFINER, search_path = public.
 *    - REVOKE EXECUTE from PUBLIC/anon/authenticated; only service role calls this.
 *    - Returns jsonb result object with status code and session details.
 *
 * 5. RLS & Realtime
 *    - RLS enabled on tables and table_sessions; NO anon policies.
 *    - Authenticated policies scoped to superadmin or branch admin.
 *    - Both tables added to supabase_realtime publication.
 *
 * Idempotent: all DDL uses IF NOT EXISTS / DO $$ BEGIN ... EXCEPTION WHEN ... END $$.
 */

-- ── 1. TABLE: tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tables (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code       text        NOT NULL,           -- e.g. 'A-1', stored uppercase
  label      text        NULL,               -- e.g. 'Area Indoor Dekat Jendela'
  seats      integer     NOT NULL DEFAULT 4
             CHECK (seats > 0 AND seats <= 50),
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique table code within a branch
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tables_branch_code'
  ) THEN
    ALTER TABLE tables ADD CONSTRAINT uq_tables_branch_code UNIQUE (branch_id, code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tables_branch_active ON tables(branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tables_code ON tables(code);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION set_tables_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tables_updated_at ON tables;
CREATE TRIGGER trg_tables_updated_at
  BEFORE UPDATE ON tables
  FOR EACH ROW EXECUTE PROCEDURE set_tables_updated_at();


-- ── 1b. BACKFILL `tables` from historical data ────────────────────────────────
-- Inserts distinct (branch_id, table_number) pairs found in orders, table_requests,
-- and group_carts. Safe to re-run: ON CONFLICT DO NOTHING.

INSERT INTO tables (branch_id, code, seats, is_active)
SELECT DISTINCT src.branch_id, upper(trim(src.table_number)), 4, true
FROM (
  SELECT branch_id, table_number FROM orders
    WHERE table_number IS NOT NULL AND table_number <> '' AND branch_id IS NOT NULL
  UNION
  SELECT branch_id, table_number FROM table_requests
    WHERE table_number IS NOT NULL AND table_number <> '' AND branch_id IS NOT NULL
  UNION
  SELECT branch_id, table_number FROM group_carts
    WHERE table_number IS NOT NULL AND table_number <> '' AND branch_id IS NOT NULL
) src
JOIN branches b ON b.id = src.branch_id
WHERE trim(src.table_number) <> ''
ON CONFLICT (branch_id, code) DO NOTHING;


-- ── 2. BRANCH SETTINGS COLUMNS ────────────────────────────────────────────────

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  walkin_lock_minutes            integer     NOT NULL DEFAULT 180;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservations_enabled           boolean     NOT NULL DEFAULT false;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_open_time          text        NOT NULL DEFAULT '08:00';

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_close_time         text        NOT NULL DEFAULT '21:00';

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_min_lead_minutes   integer     NOT NULL DEFAULT 120;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_max_days_ahead     integer     NOT NULL DEFAULT 30;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_hold_minutes       integer     NOT NULL DEFAULT 15;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_grace_minutes      integer     NOT NULL DEFAULT 15;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_buffer_minutes     integer     NOT NULL DEFAULT 15;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  reservation_min_preorder       integer     NOT NULL DEFAULT 0;

ALTER TABLE branches ADD COLUMN IF NOT EXISTS
  qris_image_url                 text        NULL;

-- Check constraints (idempotent)
DO $$
BEGIN
  ALTER TABLE branches
    ADD CONSTRAINT branches_walkin_lock_check
    CHECK (walkin_lock_minutes >= 15 AND walkin_lock_minutes <= 720);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 3. TABLE: table_sessions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS table_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         uuid        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  branch_id        uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  session_token    text        NOT NULL,    -- 32-byte hex, lives in httpOnly cookie
  reservation_id   uuid        NULL,        -- linked to reservations in Phase 2
  status           text        NOT NULL     DEFAULT 'active'
                               CHECK (status IN ('active', 'released', 'expired')),
  started_at       timestamptz NOT NULL     DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  released_at      timestamptz NULL,
  released_reason  text        NULL
                   CHECK (
                     released_reason IS NULL
                     OR released_reason IN ('moved', 'staff', 'expired', 'reservation')
                   ),
  created_at       timestamptz NOT NULL     DEFAULT now()
);

-- Partial unique: only one ACTIVE session per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_sessions_active_table
  ON table_sessions(table_id)
  WHERE status = 'active';

-- Partial unique: only one ACTIVE session per token (scanning another table frees the old one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_sessions_active_token
  ON table_sessions(session_token)
  WHERE status = 'active';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_table_sessions_branch_status
  ON table_sessions(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_token
  ON table_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_table_sessions_expires
  ON table_sessions(expires_at)
  WHERE status = 'active';

ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;


-- ── 4. RPC: claim_table ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_table(
  p_branch_id        uuid,
  p_code             text,
  p_token            text,
  p_reservation_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table           tables%ROWTYPE;
  v_branch          branches%ROWTYPE;
  v_existing        table_sessions%ROWTYPE;
  v_next_res_start  timestamptz;
  v_lock_interval   interval;
  v_effective_exp   timestamptz;
  v_new_session_id  uuid;
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
          'started_at',  v_existing.started_at
        )
      );
    ELSE
      -- Someone else owns this table
      RETURN jsonb_build_object('ok', false, 'code', 'TABLE_TAKEN');
    END IF;
  END IF;

  -- 6. Compute lock duration from branch setting (default 180 min)
  v_lock_interval := (COALESCE(v_branch.walkin_lock_minutes, 180) * INTERVAL '1 minute');
  v_effective_exp := now() + v_lock_interval;

  -- 7. Check for upcoming reservations that overlap the new claim window
  --    (Only executed if the reservations table exists — Phase 2 will be live.)
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservations'
  ) THEN
    SELECT r.starts_at
    INTO v_next_res_start
    FROM reservations r
    WHERE
      r.table_id   = v_table.id
      AND r.status IN ('confirmed', 'awaiting_confirmation', 'pending_payment')
      AND r.starts_at > now()
      AND r.starts_at < (now() + v_lock_interval + (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute'))
      -- Allow reservation holder to claim their own table
      AND NOT (
        p_reservation_code IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM reservations rv
          WHERE rv.code = upper(trim(p_reservation_code))
            AND rv.table_id = v_table.id
            AND rv.status IN ('confirmed', 'awaiting_confirmation')
        )
      )
    ORDER BY r.starts_at ASC
    LIMIT 1;

    IF FOUND THEN
      -- Calculate available time before the reservation's buffer zone
      v_effective_exp := LEAST(
        v_effective_exp,
        v_next_res_start - (COALESCE(v_branch.reservation_buffer_minutes, 15) * INTERVAL '1 minute')
      );

      IF v_effective_exp <= now() THEN
        -- No usable time window — table is effectively reserved now
        RETURN jsonb_build_object(
          'ok',        false,
          'code',      'TABLE_RESERVED',
          'starts_at', v_next_res_start
        );
      END IF;

      IF v_effective_exp < now() + INTERVAL '30 minutes' THEN
        -- Less than 30 min would remain — warn customer
        RETURN jsonb_build_object(
          'ok',        false,
          'code',      'TABLE_RESERVED_SOON',
          'starts_at', v_next_res_start,
          'available_until', v_effective_exp
        );
      END IF;
    END IF;
  END IF;

  -- 8. Release caller's active session on any OTHER table (move scenario)
  UPDATE table_sessions
  SET
    status          = 'released',
    released_reason = 'moved',
    released_at     = now()
  WHERE
    session_token = p_token
    AND status    = 'active'
    AND table_id  <> v_table.id;

  -- 9. Insert the new active session
  INSERT INTO table_sessions (
    table_id, branch_id, session_token,
    status, started_at, expires_at
  )
  VALUES (
    v_table.id, p_branch_id, p_token,
    'active', now(), v_effective_exp
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
      'started_at',  now()
    )
  );
END;
$$;

-- Revoke EXECUTE from public/anon/authenticated — only service role may call this
REVOKE EXECUTE ON FUNCTION claim_table(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_table(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_table(uuid, text, text, text) FROM authenticated;


-- ── 5. RLS POLICIES: tables ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "tables_select_authenticated" ON tables;
CREATE POLICY "tables_select_authenticated"
ON tables FOR SELECT
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "tables_insert_authenticated" ON tables;
CREATE POLICY "tables_insert_authenticated"
ON tables FOR INSERT
TO authenticated
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "tables_update_authenticated" ON tables;
CREATE POLICY "tables_update_authenticated"
ON tables FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
)
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "tables_delete_authenticated" ON tables;
CREATE POLICY "tables_delete_authenticated"
ON tables FOR DELETE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);


-- ── 6. RLS POLICIES: table_sessions ──────────────────────────────────────────

DROP POLICY IF EXISTS "table_sessions_select_authenticated" ON table_sessions;
CREATE POLICY "table_sessions_select_authenticated"
ON table_sessions FOR SELECT
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "table_sessions_update_authenticated" ON table_sessions;
CREATE POLICY "table_sessions_update_authenticated"
ON table_sessions FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
)
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);


-- ── 7. REALTIME PUBLICATION ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tables;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'table_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE table_sessions;
  END IF;
END $$;
