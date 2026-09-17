/*
# Menu items write policies for superadmin
#
# 1. Security
#    - Enable INSERT, UPDATE, DELETE on menu_items for authenticated superadmin users.
#    - Reuses the existing get_my_role() security definer function from 20260917000000_create_branches_and_profiles.sql.
#    - Preserves existing public SELECT policy for customers and admins.
*/

-- INSERT policy for superadmin
DROP POLICY IF EXISTS "menu_items_insert_superadmin" ON menu_items;
CREATE POLICY "menu_items_insert_superadmin"
ON menu_items FOR INSERT
TO authenticated
WITH CHECK (get_my_role() = 'superadmin');

-- UPDATE policy for superadmin
DROP POLICY IF EXISTS "menu_items_update_superadmin" ON menu_items;
CREATE POLICY "menu_items_update_superadmin"
ON menu_items FOR UPDATE
TO authenticated
USING (get_my_role() = 'superadmin')
WITH CHECK (get_my_role() = 'superadmin');

-- DELETE policy for superadmin
DROP POLICY IF EXISTS "menu_items_delete_superadmin" ON menu_items;
CREATE POLICY "menu_items_delete_superadmin"
ON menu_items FOR DELETE
TO authenticated
USING (get_my_role() = 'superadmin');
