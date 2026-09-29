/*
 * Migration: add wifi_name and wifi_password to branches
 *
 * These two optional columns allow branch admins to configure Wi-Fi
 * credentials that guests can view on the /menu and /status pages via
 * the collapsible "Wi-Fi & Jam Buka" card.
 *
 * Both columns are nullable text — leave them NULL to hide the Wi-Fi
 * card entirely for that branch.  Existing rows are unaffected.
 *
 * The columns are intentionally excluded from the public homepage query
 * (app/page.tsx) to avoid leaking credentials to unauthenticated users;
 * guests access them only through GET /api/branch-info, which is scoped
 * to the current table's branch.
 */

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS wifi_name     text,
  ADD COLUMN IF NOT EXISTS wifi_password text;
