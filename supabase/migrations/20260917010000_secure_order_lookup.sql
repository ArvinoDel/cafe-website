/*
# Secure order lookup function and remove blanket anon SELECT policy

1. Changes
- Drop the blanket SELECT policy "anon_read_orders_by_code" and "public_read_orders" from `orders`.
- Create a SECURITY DEFINER function `get_order_by_code(p_code text)` that returns the specific order matching the code.
- Grant EXECUTE on `get_order_by_code` to the `anon` role only.
- The anon INSERT policy for checkout remains untouched.
*/

-- 1. Drop the blanket anon SELECT policies
DROP POLICY IF EXISTS "anon_read_orders_by_code" ON orders;
DROP POLICY IF EXISTS "public_read_orders" ON orders;

-- 2. Create the SECURITY DEFINER lookup function
CREATE OR REPLACE FUNCTION get_order_by_code(p_code text)
RETURNS SETOF orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM orders WHERE order_code = p_code LIMIT 1;
$$;

-- 3. Grant execute to anon role only
REVOKE EXECUTE ON FUNCTION get_order_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_order_by_code(text) TO anon;
