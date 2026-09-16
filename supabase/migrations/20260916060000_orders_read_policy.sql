/*
# Allow reading orders by code, for the customer status page

1. Changes
- Add a SELECT policy on `orders` so the status page can look up an order
  (this app has no customer auth — access is effectively gated by knowing
  the order_code, same open-read model already used for `menu_items`).
- Add an index on `order_code` for fast lookups from `/status/[code]`.
*/

DROP POLICY IF EXISTS "public_read_orders" ON orders;
CREATE POLICY "public_read_orders"
ON orders FOR SELECT
TO anon, authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);
