/*
 * Migration: add wait_per_order_minutes to branches
 *
 * wait_per_order_minutes (integer, NOT NULL, default 0, check 0-30) —
 *   Additional estimated preparation time added per active order ahead in queue.
 *   0 keeps the fixed base time (est_wait_minutes) behavior.
 */

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS wait_per_order_minutes integer NOT NULL DEFAULT 0;

-- Idempotent CHECK constraint on wait_per_order_minutes (0 to 30)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'branches_wait_per_order_check'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT branches_wait_per_order_check
      CHECK (wait_per_order_minutes BETWEEN 0 AND 30);
  END IF;
END $$;
