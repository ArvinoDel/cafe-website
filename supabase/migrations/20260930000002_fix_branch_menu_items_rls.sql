-- Migration: 20260930000002_fix_branch_menu_items_rls.sql
-- Description: Allow branch admins to INSERT into branch_menu_items for their own branch.
-- This prevents 403 Forbidden errors when PostgREST evaluates upsert requests
-- (INSERT ... ON CONFLICT DO UPDATE) from branch admin users.

DROP POLICY IF EXISTS "branch_menu_items_insert_admin" ON branch_menu_items;

CREATE POLICY "branch_menu_items_insert_admin"
ON branch_menu_items FOR INSERT
TO authenticated
WITH CHECK (
  get_my_role() = 'admin' AND branch_id = get_my_branch_id()
);
