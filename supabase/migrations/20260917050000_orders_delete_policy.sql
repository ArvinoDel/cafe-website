/*
# Add DELETE policy on orders table
#
# 1. Security
#    - Allows superadmin to DELETE any order.
#    - Allows branch admin to DELETE orders belonging to their own branch (get_my_branch_id()).
*/

DROP POLICY IF EXISTS "authenticated_delete_orders" ON orders;
CREATE POLICY "authenticated_delete_orders"
ON orders FOR DELETE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);
