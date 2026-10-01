/*
 * Migration: Pesan Bareng — Group Order Tables
 * Timestamp: 20261002000000
 *
 * Creates three tables that power the shared group-cart feature:
 *
 *   group_carts          — the live shared cart for a table session.
 *   group_cart_members   — each person who joined; holds the secret token.
 *   group_cart_items     — individual item lines contributed by each member.
 *
 * Security model:
 *   RLS is ENABLED on every table, but NO public/anon policies are added.
 *   All reads and writes go through the service-role admin client inside
 *   Next.js API route handlers.  Client browsers never touch these tables
 *   directly via the Supabase JS client.
 *
 * This migration is fully idempotent (CREATE TABLE IF NOT EXISTS, DO $$ blocks
 * for constraints and indexes, etc.).
 */

-- ─── 1. group_carts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_carts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL,     -- 6-char invite code
  branch_id       uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  table_number    text        NOT NULL,
  host_member_id  uuid        NULL,         -- set after first member is created (circular FK below)
  status          text        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'submitted', 'cancelled')),
  order_code      text        NULL,         -- filled after host submits via /api/orders/create
  version         integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '3 hours'),
  submitted_at    timestamptz NULL
);

-- Unique invite code per cart
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_carts_code_unique'
  ) THEN
    ALTER TABLE group_carts ADD CONSTRAINT group_carts_code_unique UNIQUE (code);
  END IF;
END $$;

-- Enable RLS; no public policies — service role only
ALTER TABLE group_carts ENABLE ROW LEVEL SECURITY;


-- ─── 2. group_cart_members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_cart_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     uuid        NOT NULL REFERENCES group_carts(id) ON DELETE CASCADE,
  token       text        NOT NULL,   -- secret ≥32 chars, never returned to other members
  name        text        NOT NULL,
  is_ready    boolean     NOT NULL DEFAULT false,
  joined_at   timestamptz NOT NULL DEFAULT now()
);

-- Secret token must be unique within a cart (not globally, to keep it short)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_cart_members_cart_token_unique'
  ) THEN
    ALTER TABLE group_cart_members
      ADD CONSTRAINT group_cart_members_cart_token_unique UNIQUE (cart_id, token);
  END IF;
END $$;

-- Name length: 1–30 chars (enforced here AND in API Zod schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_cart_members_name_len'
  ) THEN
    ALTER TABLE group_cart_members
      ADD CONSTRAINT group_cart_members_name_len
      CHECK (char_length(name) >= 1 AND char_length(name) <= 30);
  END IF;
END $$;

ALTER TABLE group_cart_members ENABLE ROW LEVEL SECURITY;


-- ─── 3. Back-fill the FK from group_carts → group_cart_members ───────────────
--    (deferred because group_cart_members didn't exist yet above)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_carts_host_member_id_fkey'
  ) THEN
    ALTER TABLE group_carts
      ADD CONSTRAINT group_carts_host_member_id_fkey
      FOREIGN KEY (host_member_id) REFERENCES group_cart_members(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ─── 4. group_cart_items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_cart_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id       uuid        NOT NULL REFERENCES group_carts(id)         ON DELETE CASCADE,
  member_id     uuid        NOT NULL REFERENCES group_cart_members(id)  ON DELETE CASCADE,
  menu_item_id  uuid        NOT NULL REFERENCES menu_items(id),
  quantity      integer     NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
  note          text        NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Note length: ≤ 100 chars (also validated in API)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_cart_items_note_len'
  ) THEN
    ALTER TABLE group_cart_items
      ADD CONSTRAINT group_cart_items_note_len
      CHECK (note IS NULL OR char_length(note) <= 100);
  END IF;
END $$;

-- One line per (member, menu_item, note) — note null and '' are treated as the same bucket
-- (coalesce to empty string so NULLs don't break uniqueness).
-- This prevents duplicate lines being inserted for the same item+note combo.
CREATE UNIQUE INDEX IF NOT EXISTS group_cart_items_member_item_note_idx
  ON group_cart_items (cart_id, member_id, menu_item_id, coalesce(note, ''));

ALTER TABLE group_cart_items ENABLE ROW LEVEL SECURITY;


-- ─── 5. Performance indexes ───────────────────────────────────────────────────

-- Fast cart lookup by invite code
CREATE INDEX IF NOT EXISTS group_carts_code_idx ON group_carts (code);

-- Expire / cleanup scans
CREATE INDEX IF NOT EXISTS group_carts_expires_at_idx ON group_carts (expires_at);

-- Member lookup by cart (most frequent join path)
CREATE INDEX IF NOT EXISTS group_cart_members_cart_id_idx ON group_cart_members (cart_id);

-- Item lookup by cart
CREATE INDEX IF NOT EXISTS group_cart_items_cart_id_idx ON group_cart_items (cart_id);
