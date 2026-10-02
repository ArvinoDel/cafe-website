-- ==============================================================================
-- Migration: Add public SELECT policy on branches table
-- Timestamp: 20261005000002
--
-- Context:
--   The original migration (20260917000000_create_branches_and_profiles.sql) only
--   granted SELECT on branches to 'authenticated'. This prevented anonymous guests
--   from viewing cafe locations on the homepage and store locator.
--   This migration idempotently adds a public SELECT policy so all visitors can
--   read public branch details.
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branches'
      AND policyname = 'branches_select_public'
  ) THEN
    CREATE POLICY "branches_select_public"
    ON branches FOR SELECT
    USING (true);
  END IF;
END $$;
