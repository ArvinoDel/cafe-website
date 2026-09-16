/*
# Create orders table for Kopi Nako checkout

1. New Tables
- `orders`: stores dine-in orders placed from the checkout page
  - `id` (uuid, primary key)
  - `order_code` (text, not null) — short human-readable order code shown to the customer
  - `customer_name` (text, not null)
  - `table_number` (text, not null)
  - `items` (jsonb, not null) — snapshot of cart items at checkout time
  - `subtotal` (integer, not null) — in IDR
  - `total` (integer, not null) — in IDR
  - `payment_method` (text, not null) — 'cash' or 'qris'
  - `notes` (text, nullable) — optional note for the barista
  - `status` (text, default 'pending') — order lifecycle status
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `orders`.
- This is a no-auth ordering flow — allow anon to INSERT their own order.
- No public SELECT/UPDATE/DELETE from the client; orders are managed via admin/staff tooling.
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code text NOT NULL,
  customer_name text NOT NULL,
  table_number text NOT NULL,
  items jsonb NOT NULL,
  subtotal integer NOT NULL,
  total integer NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'qris')),
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_orders" ON orders;
CREATE POLICY "public_insert_orders"
ON orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
