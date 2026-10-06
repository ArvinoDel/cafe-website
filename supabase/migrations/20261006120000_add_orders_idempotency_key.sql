/*
 * Add idempotency_key column to orders table.
 *
 * Purpose: prevents duplicate orders when the customer double-taps the checkout
 * button, retries after a timeout, or the network briefly drops mid-request.
 *
 * How it works:
 *   1. The client generates a UUID per checkout attempt and sends it as
 *      idempotency_key in the POST /api/orders/create body.
 *   2. The server checks for an existing row with that key before inserting.
 *   3. If found, it returns the existing order (HTTP 200 instead of 201).
 *   4. If not found, the new order is inserted with the key stored.
 *   5. A PARTIAL unique index ensures no two rows share the same non-null key.
 *      (NULL values are not unique in PostgreSQL, so un-keyed legacy orders
 *       are not affected.)
 *
 * Run:
 *   supabase db push
 *   — or —
 *   psql $DATABASE_URL -f supabase/migrations/20261006120000_add_orders_idempotency_key.sql
 */

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Partial unique index: only enforces uniqueness among non-null values.
-- This is safe to add without touching existing orders (which will have NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
