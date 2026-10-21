/*
 * Migration: 20261022000004_fix_released_reasons
 *
 * Expands chk_table_sessions_released_reason to allow all lifecycle release reasons:
 * 'moved', 'staff', 'expired', 'reservation', 'reservation_checkin', 'cancelled', 'no_show', 'completed'.
 */

DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE table_sessions
    DROP CONSTRAINT IF EXISTS chk_table_sessions_released_reason;
  ALTER TABLE table_sessions
    DROP CONSTRAINT IF EXISTS table_sessions_released_reason_check;

  -- Re-add with complete set of allowed reasons
  ALTER TABLE table_sessions
    ADD CONSTRAINT table_sessions_released_reason_check
    CHECK (
      released_reason IS NULL
      OR released_reason IN (
        'moved',
        'staff',
        'expired',
        'reservation',
        'reservation_checkin',
        'cancelled',
        'no_show',
        'completed'
      )
    );
END $$;
