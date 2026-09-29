/*
 * Migration: add est_wait_minutes to branches
 *
 * Optional integer column allowing branch admins to configure an estimated
 * wait / preparation time in minutes for dine-in orders.
 *
 * Shown on the customer /status/[code] tracking page and /checkout page
 * when configured. NULL hides the wait time estimate.
 */

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS est_wait_minutes integer;
