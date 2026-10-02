-- Migration: 20261005000001_create_newsletter_subscribers.sql
--
-- Creates the newsletter_subscribers table for opt-in email collection
-- from the Footer newsletter form.
--
-- Idempotent: safe to run multiple times.

-- 1. Create table
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash     TEXT,          -- SHA-256 of subscriber IP for rate-limit dedup (no PII stored)
  source      TEXT DEFAULT 'footer_form'
);

-- 2. Unique constraint on email (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'newsletter_subscribers_email_key'
  ) THEN
    ALTER TABLE newsletter_subscribers
      ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email);
  END IF;
END;
$$;

-- 3. Index on subscribed_at for CSV export ordering
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed_at
  ON newsletter_subscribers (subscribed_at DESC);

-- 4. RLS — table is write-only for anon (submit form), read-only for service role
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Superadmin / service-role reads (no anon select)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'newsletter_subscribers' AND policyname = 'superadmin_select'
  ) THEN
    CREATE POLICY superadmin_select ON newsletter_subscribers
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'superadmin'
        )
      );
  END IF;
END;
$$;

-- Anyone can insert (rate-limiting handled in the API route)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'newsletter_subscribers' AND policyname = 'anon_insert'
  ) THEN
    CREATE POLICY anon_insert ON newsletter_subscribers
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
END;
$$;
