/*
 * Migration: add opening_hours and maps_url to branches
 *
 * These two optional columns are used by the public Stores section
 * (Phase 4) to show richer single-location and multi-location cards.
 *
 * Both are nullable text columns — admins fill them in via the
 * Branches & Accounts admin page. Existing rows are unaffected.
 */

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS opening_hours text,
  ADD COLUMN IF NOT EXISTS maps_url      text;
