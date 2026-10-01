/*
 * Migration: add accepting_orders and pause_message to branches
 *
 * accepting_orders (boolean, NOT NULL, default true) — when set to false by an
 *   admin the branch is "paused": new orders are rejected at the API level and
 *   the guest UI shows a calm banner.
 *
 * pause_message (text, nullable, max 120 chars) — optional short message
 *   surfaced to guests when ordering is paused.
 *
 * RLS: Supabase's RLS only allows superadmin to UPDATE branches. Admins flip
 * this via POST /api/admin/branch-accepting-orders (service-role write).
 */

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS accepting_orders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_message text NULL;

-- Idempotent CHECK constraint on pause_message length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'branches_pause_message_len_check'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT branches_pause_message_len_check
      CHECK (pause_message IS NULL OR char_length(pause_message) <= 120);
  END IF;
END $$;
