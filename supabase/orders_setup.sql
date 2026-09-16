-- ==========================================================
-- Create orders table for Kopi Nako checkout and status page
-- ==========================================================

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
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

-- ==========================================================
-- Enable Row Level Security (RLS)
-- ==========================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 1. Allow customers to INSERT orders from /checkout
DROP POLICY IF EXISTS "public_insert_orders" ON orders;
CREATE POLICY "public_insert_orders"
ON orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 2. Allow customers to SELECT / read orders from /status/[code]
DROP POLICY IF EXISTS "public_read_orders" ON orders;
CREATE POLICY "public_read_orders"
ON orders FOR SELECT
TO anon, authenticated
USING (true);

-- ==========================================================
-- Indexes for performance
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
