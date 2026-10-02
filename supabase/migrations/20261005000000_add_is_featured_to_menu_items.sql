-- Migration: 20261005000000_add_is_featured_to_menu_items.sql
--
-- Adds an `is_featured` boolean column to `menu_items` so admins can flag
-- up to 8 items to appear in the FeaturedMenu section on the homepage.
--
-- Idempotent: uses IF NOT EXISTS / DO $$ … $$ guards throughout.

-- 1. Add column (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'menu_items'
      AND column_name = 'is_featured'
  ) THEN
    ALTER TABLE menu_items
      ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END;
$$;

-- 2. Add a partial index to make the homepage query fast
CREATE INDEX IF NOT EXISTS idx_menu_items_featured
  ON menu_items (sort_order)
  WHERE is_featured = TRUE AND is_available = TRUE;

-- 3. Ensure superadmin can write is_featured (already covered by existing
--    superadmin UPDATE policy on menu_items, but make it explicit).
-- No extra RLS needed — existing UPDATE policy for superadmin covers all cols.
