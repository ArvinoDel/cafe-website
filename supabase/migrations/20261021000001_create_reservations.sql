/*
 * Migration: 20261021000001_create_reservations
 *
 * Phase 2 — Reservations Engine
 *
 * 1. btree_gist extension — required for EXCLUDE USING gist on tstzrange.
 *
 * 2. New table `reservations`
 *    - Each row is a customer's table reservation for a specific time window.
 *    - `code`        : 8-char uppercase alphanumeric, given to the customer as
 *                      a pick-up reference and used to bypass the walk-in lock.
 *    - `status`      : lifecycle state machine:
 *        pending_payment      → customer filled form, awaiting QRIS proof upload
 *        awaiting_confirmation→ proof uploaded (or no min-preorder required),
 *                               waiting for staff to confirm
 *        confirmed            → staff confirmed; table is hard-reserved
 *        cancelled            → cancelled by staff or auto-expired hold
 *        no_show              → customer did not arrive within grace period
 *        completed            → session was created and later released/ended
 *    - `hold_expires_at`: auto-expiry for pending_payment slots.
 *    - tstzrange EXCLUDE prevents double-booking the same table.
 *
 * 3. RLS enabled, NO anon policies — service-role admin client only.
 *    Authenticated branch-scoped read/write for admin & superadmin.
 *
 * 4. Realtime publication added.
 *
 * Idempotent: IF NOT EXISTS / DO $$ EXCEPTION WHEN duplicate_object $$ blocks.
 */

-- ── 0. btree_gist extension (needed for tstzrange EXCLUDE) ────────────────────

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. TABLE: reservations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL,
  branch_id          uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  table_id           uuid        NOT NULL REFERENCES tables(id)   ON DELETE CASCADE,

  customer_name      text        NOT NULL
                     CHECK (char_length(customer_name) >= 1 AND char_length(customer_name) <= 80),
  customer_phone     text        NOT NULL
                     CHECK (char_length(customer_phone) >= 5 AND char_length(customer_phone) <= 30),
  customer_email     text        NULL
                     CHECK (customer_email IS NULL OR char_length(customer_email) <= 120),

  party_size         integer     NOT NULL DEFAULT 1
                     CHECK (party_size >= 1 AND party_size <= 50),
  notes              text        NULL
                     CHECK (notes IS NULL OR char_length(notes) <= 500),

  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  CHECK (ends_at > starts_at),

  status             text        NOT NULL DEFAULT 'pending_payment'
                     CHECK (status IN (
                       'pending_payment',
                       'awaiting_confirmation',
                       'confirmed',
                       'cancelled',
                       'no_show',
                       'completed'
                     )),
  hold_expires_at    timestamptz NULL,

  preorder_total     integer     NOT NULL DEFAULT 0
                     CHECK (preorder_total >= 0),

  payment_proof_url  text        NULL,

  session_id         uuid        NULL REFERENCES table_sessions(id) ON DELETE SET NULL,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Unique code (customers use this to claim their table at arrival)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_reservations_code'
  ) THEN
    ALTER TABLE reservations ADD CONSTRAINT uq_reservations_code UNIQUE (code);
  END IF;
END $$;

-- Overlap exclusion: same table, active statuses, overlapping time window
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_reservations'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT no_overlapping_reservations
      EXCLUDE USING gist (
        table_id   WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status IN ('pending_payment', 'awaiting_confirmation', 'confirmed'));
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_reservations_branch_status
  ON reservations(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_table_starts
  ON reservations(table_id, starts_at)
  WHERE status IN ('pending_payment', 'awaiting_confirmation', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_reservations_code
  ON reservations(code);
CREATE INDEX IF NOT EXISTS idx_reservations_hold_expires
  ON reservations(hold_expires_at)
  WHERE status = 'pending_payment';

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_reservations_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_updated_at ON reservations;
CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE PROCEDURE set_reservations_updated_at();

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;


-- ── 2. RLS POLICIES: reservations ─────────────────────────────────────────────

DROP POLICY IF EXISTS "reservations_select_authenticated" ON reservations;
CREATE POLICY "reservations_select_authenticated"
ON reservations FOR SELECT
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "reservations_insert_authenticated" ON reservations;
CREATE POLICY "reservations_insert_authenticated"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "reservations_update_authenticated" ON reservations;
CREATE POLICY "reservations_update_authenticated"
ON reservations FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
)
WITH CHECK (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

DROP POLICY IF EXISTS "reservations_delete_authenticated" ON reservations;
CREATE POLICY "reservations_delete_authenticated"
ON reservations FOR DELETE
TO authenticated
USING (
  get_my_role() = 'superadmin'
);


-- ── 3. REALTIME PUBLICATION ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
  END IF;
END $$;
