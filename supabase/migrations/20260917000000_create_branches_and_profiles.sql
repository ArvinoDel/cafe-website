/*
# Admin authentication schema for Kopi Nako
#
# 1. New Tables
#    - `branches`: coffee shop branch locations
#    - `profiles`: admin/superadmin user profiles tied to auth.users
#
# 2. Modified Tables
#    - `orders`: add branch_id (uuid, NOT NULL, references branches(id))
#                seed a default branch and backfill existing orders first.
#
# 3. Security Definer Helpers
#    - get_my_role()      - returns the caller's role from profiles
#    - get_my_branch_id() - returns the caller's branch_id from profiles
#    Used in RLS policies to avoid recursive lookups on profiles.
#
# 4. RLS Policies (all tables)
#    - branches: authenticated SELECT; superadmin-only INSERT/UPDATE/DELETE
#    - profiles: self-select or superadmin-select; service-role manages inserts
#    - orders:
#        anon INSERT (existing dine-in flow, unchanged)
#        anon SELECT by order_code (customer status page, unchanged)
#        authenticated SELECT scoped by role+branch
#        authenticated UPDATE scoped by role+branch (status changes)
#
# Run order: execute this entire file once in the Supabase SQL editor.
*/

-- ============================================================
-- 1. BRANCHES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  address    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text  NOT NULL CHECK (role IN ('superadmin', 'admin')),
  branch_id  uuid  REFERENCES branches(id) ON DELETE SET NULL,
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_branch_check CHECK (
    (role = 'superadmin' AND branch_id IS NULL) OR
    (role = 'admin'      AND branch_id IS NOT NULL)
  )
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. DEFAULT BRANCH SEED + BACKFILL orders.branch_id
-- ============================================================

INSERT INTO branches (id, name, address)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Kopi Nako Pusat',
  null
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

UPDATE orders
SET branch_id = 'a0000000-0000-0000-0000-000000000001'
WHERE branch_id IS NULL;

ALTER TABLE orders ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);

-- ============================================================
-- 4. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 5. RLS POLICIES -- BRANCHES
-- ============================================================

DROP POLICY IF EXISTS "branches_select_authenticated" ON branches;
CREATE POLICY "branches_select_authenticated"
ON branches FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "branches_insert_superadmin" ON branches;
CREATE POLICY "branches_insert_superadmin"
ON branches FOR INSERT
TO authenticated
WITH CHECK (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "branches_update_superadmin" ON branches;
CREATE POLICY "branches_update_superadmin"
ON branches FOR UPDATE
TO authenticated
USING (get_my_role() = 'superadmin')
WITH CHECK (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "branches_delete_superadmin" ON branches;
CREATE POLICY "branches_delete_superadmin"
ON branches FOR DELETE
TO authenticated
USING (get_my_role() = 'superadmin');

-- ============================================================
-- 6. RLS POLICIES -- PROFILES
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_self_or_superadmin" ON profiles;
CREATE POLICY "profiles_select_self_or_superadmin"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR get_my_role() = 'superadmin'
);

-- ============================================================
-- 7. RLS POLICIES -- ORDERS
-- ============================================================

DROP POLICY IF EXISTS "public_read_orders" ON orders;

DROP POLICY IF EXISTS "anon_read_orders_by_code" ON orders;
CREATE POLICY "anon_read_orders_by_code"
ON orders FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS "authenticated_read_orders" ON orders;
CREATE POLICY "authenticated_read_orders"
ON orders FOR SELECT
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "authenticated_update_orders" ON orders;
CREATE POLICY "authenticated_update_orders"
ON orders FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
)
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

/*
BOOTSTRAP SNIPPET - run once after creating your first Supabase user:

  INSERT INTO profiles (id, role, branch_id, full_name)
  VALUES ('<your-auth-user-uuid>', 'superadmin', NULL, 'Super Admin')
  ON CONFLICT (id) DO UPDATE SET role = 'superadmin', branch_id = NULL;
*/
