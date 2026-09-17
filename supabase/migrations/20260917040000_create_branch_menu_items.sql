/*
# Branch Menu Items (Master Menu + Branch Availability)
#
# 1. New Tables
#    - `branch_menu_items`: stores branch-specific availability, enablement, and price overrides
#        - `id` (uuid, primary key)
#        - `branch_id` (uuid, references branches(id) on delete cascade)
#        - `menu_item_id` (uuid, references menu_items(id) on delete cascade)
#        - `is_available` (boolean, default true - whether in stock at this branch)
#        - `is_enabled` (boolean, default true - whether served/offered at this branch)
#        - `custom_price` (integer, nullable - optional branch-specific price override)
#        - `created_at` (timestamptz, default now())
#        - `updated_at` (timestamptz, default now())
#        - UNIQUE(branch_id, menu_item_id)
#
# 2. Automation Triggers
#    - Automatically seed branch_menu_items when a new menu_item is created.
#    - Automatically seed branch_menu_items when a new branch is created.
#
# 3. Security (RLS)
#    - SELECT: anon and authenticated can read.
#    - INSERT / DELETE: superadmin only.
#    - UPDATE:
#        - superadmin can update any branch_menu_items.
#        - branch admin can update is_available / is_enabled for their own branch.
*/

-- ============================================================
-- 1. TABLE CREATION
-- ============================================================

CREATE TABLE IF NOT EXISTS branch_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT true,
  custom_price integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_menu_items_branch_menu_unique UNIQUE (branch_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_menu_items_branch_id ON branch_menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_menu_items_menu_item_id ON branch_menu_items(menu_item_id);

-- ============================================================
-- 2. BACKFILL EXISTING BRANCHES & MENU ITEMS
-- ============================================================

INSERT INTO branch_menu_items (branch_id, menu_item_id, is_available, is_enabled)
SELECT b.id, m.id, m.is_available, true
FROM branches b
CROSS JOIN menu_items m
ON CONFLICT (branch_id, menu_item_id) DO NOTHING;

-- ============================================================
-- 3. SYNC TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION sync_new_menu_item_to_branches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO branch_menu_items (branch_id, menu_item_id, is_available, is_enabled)
  SELECT b.id, NEW.id, NEW.is_available, true
  FROM branches b
  ON CONFLICT (branch_id, menu_item_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_new_menu_item ON menu_items;
CREATE TRIGGER tr_sync_new_menu_item
AFTER INSERT ON menu_items
FOR EACH ROW
EXECUTE FUNCTION sync_new_menu_item_to_branches();

CREATE OR REPLACE FUNCTION sync_new_branch_to_menu_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO branch_menu_items (branch_id, menu_item_id, is_available, is_enabled)
  SELECT NEW.id, m.id, m.is_available, true
  FROM menu_items m
  ON CONFLICT (branch_id, menu_item_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_new_branch ON branches;
CREATE TRIGGER tr_sync_new_branch
AFTER INSERT ON branches
FOR EACH ROW
EXECUTE FUNCTION sync_new_branch_to_menu_items();

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE branch_menu_items ENABLE ROW LEVEL SECURITY;

-- SELECT: Public and authenticated read
DROP POLICY IF EXISTS "branch_menu_items_select" ON branch_menu_items;
CREATE POLICY "branch_menu_items_select"
ON branch_menu_items FOR SELECT
TO anon, authenticated
USING (true);

-- INSERT: Superadmin only
DROP POLICY IF EXISTS "branch_menu_items_insert_superadmin" ON branch_menu_items;
CREATE POLICY "branch_menu_items_insert_superadmin"
ON branch_menu_items FOR INSERT
TO authenticated
WITH CHECK (get_my_role() = 'superadmin');

-- DELETE: Superadmin only
DROP POLICY IF EXISTS "branch_menu_items_delete_superadmin" ON branch_menu_items;
CREATE POLICY "branch_menu_items_delete_superadmin"
ON branch_menu_items FOR DELETE
TO authenticated
USING (get_my_role() = 'superadmin');

-- UPDATE: Superadmin (full access)
DROP POLICY IF EXISTS "branch_menu_items_update_superadmin" ON branch_menu_items;
CREATE POLICY "branch_menu_items_update_superadmin"
ON branch_menu_items FOR UPDATE
TO authenticated
USING (get_my_role() = 'superadmin')
WITH CHECK (get_my_role() = 'superadmin');

-- UPDATE: Branch admin (can update is_available / is_enabled for their own branch)
DROP POLICY IF EXISTS "branch_menu_items_update_admin" ON branch_menu_items;
CREATE POLICY "branch_menu_items_update_admin"
ON branch_menu_items FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'admin' AND branch_id = get_my_branch_id()
)
WITH CHECK (
  get_my_role() = 'admin' AND branch_id = get_my_branch_id()
);
