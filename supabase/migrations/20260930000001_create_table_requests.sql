/*
 * Migration: create table_requests table + RLS + Realtime
 *
 * 1. New table `table_requests`
 *    - id           uuid PK DEFAULT gen_random_uuid()
 *    - branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE
 *    - table_number text NOT NULL
 *    - type         text NOT NULL CHECK ('water', 'tissue', 'waiter', 'bill')
 *    - order_code   text NULL
 *    - status       text NOT NULL DEFAULT 'open' CHECK ('open', 'done')
 *    - created_at   timestamptz NOT NULL DEFAULT now()
 *    - done_at      timestamptz NULL
 *
 * 2. Indexes
 *    - branch_id + status (for quick open requests filtering on dashboard)
 *    - created_at
 *
 * 3. Row Level Security
 *    - RLS enabled, NO anon policies. Guest writes go through service-role API.
 *    - Authenticated SELECT & UPDATE scoped: superadmin sees all, branch admin sees their branch.
 *
 * 4. Realtime publication
 *    - Idempotently added to supabase_realtime publication.
 */

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS table_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  table_number text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('water', 'tissue', 'waiter', 'bill')),
  order_code   text,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  done_at      timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_table_requests_branch_status
  ON table_requests(branch_id, status);

CREATE INDEX IF NOT EXISTS idx_table_requests_created_at
  ON table_requests(created_at);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE table_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "table_requests_select_authenticated" ON table_requests;
CREATE POLICY "table_requests_select_authenticated"
ON table_requests FOR SELECT
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "table_requests_update_authenticated" ON table_requests;
CREATE POLICY "table_requests_update_authenticated"
ON table_requests FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
)
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

-- ── Realtime Publication ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'table_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE table_requests;
  END IF;
END $$;
