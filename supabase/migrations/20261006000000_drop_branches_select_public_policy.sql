-- ==============================================================================
-- Migration: Drop public SELECT policy on branches table
-- Timestamp: 20261006000000
--
-- Context:
--   Public branch data is loaded server-side in lib/site-data.ts with the
--   SUPABASE_SECRET_KEY client selecting only safe columns.
--   Dropping branches_select_public ensures anonymous clients cannot read
--   the branches table directly via public RLS.
-- ==============================================================================

DROP POLICY IF EXISTS "branches_select_public" ON branches;
