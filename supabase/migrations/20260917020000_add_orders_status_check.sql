/*
# Add status CHECK constraint on orders table

Ensure orders.status only accepts valid status values:
'pending', 'preparing', 'ready', 'completed', 'cancelled'.
Uses an idempotent block so it's safe to run whether or not the constraint already exists.
*/

DO $$
BEGIN
  ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
