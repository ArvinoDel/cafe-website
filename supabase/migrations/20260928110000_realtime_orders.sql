/*
# Add orders table to Supabase Realtime publication
#
# 1. Changes
#    - Idempotently adds `orders` to the `supabase_realtime` publication so
#      authenticated admin clients can subscribe to INSERT / UPDATE / DELETE
#      events via Supabase Realtime channels.
#
# 2. Security
#    - RLS on `orders` is already in place. Realtime respects RLS, so:
#        - superadmin receives all order events.
#        - branch admin (get_my_branch_id()) only receives events for orders
#          belonging to their branch.
#    - Anon users cannot SELECT orders (policy was dropped in
#      20260917010000_secure_order_lookup.sql), so they cannot subscribe to
#      realtime events either. The customer status page continues to use
#      polling via POST /api/orders/lookup.
#
# 3. Untouched
#    - All existing RLS policies, indexes, and constraints.
*/

DO $$
BEGIN
  -- Only add if not already in the publication
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;
