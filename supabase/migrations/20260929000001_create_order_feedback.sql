/*
 * Migration: create order_feedback table
 *
 * 1. New table `order_feedback`
 *    - id           uuid PK
 *    - order_id     uuid UNIQUE, FK -> orders(id) ON DELETE CASCADE
 *                   (one feedback per order, enforced by DB)
 *    - branch_id    uuid, FK -> branches(id) ON DELETE SET NULL
 *                   (denormalised for branch-scoped admin queries)
 *    - rating       smallint CHECK 1..3
 *                   (1 = unhappy / 2 = neutral / 3 = happy)
 *    - comment      text, nullable, max 300 chars enforced by CHECK
 *    - created_at   timestamptz
 *
 * 2. Row Level Security
 *    - Enabled, NO anon policies.
 *    - Guest inserts go through POST /api/orders/feedback (service-role).
 *    - Authenticated SELECT is branch-scoped (same pattern as orders):
 *      superadmin sees all; admin sees their branch only.
 *
 * 3. Indexes
 *    - order_id   (already UNIQUE — implicit index)
 *    - branch_id  (for branch-scoped queries)
 *    - created_at (for the 7-day summary widget)
 */

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_feedback (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  branch_id  uuid        REFERENCES branches(id) ON DELETE SET NULL,
  rating     smallint    NOT NULL CHECK (rating >= 1 AND rating <= 3),
  comment    text        CHECK (char_length(comment) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_order_feedback_branch_id
  ON order_feedback(branch_id);

CREATE INDEX IF NOT EXISTS idx_order_feedback_created_at
  ON order_feedback(created_at);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE order_feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated SELECT: superadmin sees all; admin sees their own branch only.
DROP POLICY IF EXISTS "feedback_select_authenticated" ON order_feedback;
CREATE POLICY "feedback_select_authenticated"
ON order_feedback FOR SELECT
TO authenticated
USING (
  get_my_role() = 'superadmin'
  OR (get_my_role() = 'admin' AND branch_id = get_my_branch_id())
);

-- No anon INSERT policy — guest writes go through POST /api/orders/feedback
-- which uses the service-role admin client.
