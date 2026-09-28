/*
# Harden orders table: unique order_code + remove anon INSERT policy
#
# 1. Pre-check (run this SELECT to surface any duplicate codes in existing data
#    before applying the UNIQUE index — it should return 0 rows on a clean DB):
#
#    SELECT order_code, count(*) AS cnt
#    FROM orders
#    GROUP BY order_code
#    HAVING count(*) > 1;
#
# 2. Changes
#    - CREATE UNIQUE INDEX on orders(order_code) — all inserts now go through
#      the service-role API, which generates codes server-side and retries on
#      collision, so a unique constraint is safe to add.
#    - DROP the "public_insert_orders" policy (anon INSERT WITH CHECK (true)).
#      The new POST /api/orders/create endpoint uses the service-role admin
#      client, so the anon role no longer needs INSERT permission on orders.
#      No other page in the codebase does a browser-side orders INSERT
#      (verified: only app/checkout/page.tsx did, and it is being updated).
#
# 3. Untouched
#    - orders_status_check constraint
#    - authenticated SELECT / UPDATE / DELETE policies (admin dashboard)
#    - branches, profiles, menu_items, branch_menu_items tables
*/

-- ── Unique index on order_code ────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code_unique
  ON orders(order_code);

-- ── Drop the permissive anon INSERT policy ────────────────────────────────────
-- All order inserts now happen through POST /api/orders/create (service role).
DROP POLICY IF EXISTS "public_insert_orders" ON orders;
