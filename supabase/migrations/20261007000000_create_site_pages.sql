-- Migration: 20261007000000_create_site_pages.sql
--
-- Creates the site_pages table for editable CMS pages linked from the footer:
-- Support, Help Centre, Contact Us, Privacy Policy, Terms of Service.
--
-- Idempotent: safe to run multiple times.

-- 1. Create table
CREATE TABLE IF NOT EXISTS site_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Unique constraint on slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_pages_slug_key'
  ) THEN
    ALTER TABLE site_pages
      ADD CONSTRAINT site_pages_slug_key UNIQUE (slug);
  END IF;
END;
$$;

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION set_site_pages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_pages_updated_at ON site_pages;
CREATE TRIGGER trg_site_pages_updated_at
  BEFORE UPDATE ON site_pages
  FOR EACH ROW EXECUTE FUNCTION set_site_pages_updated_at();

-- 4. Enable Row Level Security
ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

-- Policy: Public (anon and authenticated) can read published pages
DROP POLICY IF EXISTS "site_pages_select_public" ON site_pages;
CREATE POLICY "site_pages_select_public"
ON site_pages FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Policy: Admin and superadmin can read all pages (including drafts)
DROP POLICY IF EXISTS "site_pages_select_admin" ON site_pages;
CREATE POLICY "site_pages_select_admin"
ON site_pages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Policy: Admin and superadmin can insert pages
DROP POLICY IF EXISTS "site_pages_insert_admin" ON site_pages;
CREATE POLICY "site_pages_insert_admin"
ON site_pages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Policy: Admin and superadmin can update pages
DROP POLICY IF EXISTS "site_pages_update_admin" ON site_pages;
CREATE POLICY "site_pages_update_admin"
ON site_pages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
  )
);

-- 5. Seed default rows (ON CONFLICT (slug) DO NOTHING so existing edits are never overwritten)
INSERT INTO site_pages (slug, title, content, is_published)
VALUES
  (
    'support',
    'Support',
    $content$# Support
Need a hand? We're happy to help.

- Questions about an order: tell us your order code and we'll check it right away.
- Something wrong with your drink or food: let the staff know at the counter, or message us.
- Website not working: try refreshing the page first, then contact us.

**Contact:** {{contact_email}} · {{contact_phone}} · WhatsApp {{whatsapp}}
**Hours:** {{opening_hours}}$content$,
    true
  ),
  (
    'help-centre',
    'Help Centre',
    $content$# Help Centre
## How do I order?
Scan the QR code at your table or open our website, choose your items, add any notes (for example less sugar or no ice), and place your order.

## How do I pay?
Payment is made at the counter. Online payment (QRIS) is coming soon.

## Can I change or cancel my order?
Tell our staff as soon as possible. Once an order is being prepared, it may not be possible to cancel.

## How do I track my order?
After ordering you'll get an order code. Use it on the order status page to see when it's ready.

## Do you have Wi-Fi?
Yes. The Wi-Fi details are shown on the website and at the counter.

## I have an allergy or dietary need.
Please tell our staff before ordering so we can advise you.$content$,
    true
  ),
  (
    'contact-us',
    'Contact Us',
    $content$# Contact Us
We'd love to hear from you.

**Address:** {{address}}
**Phone:** {{contact_phone}}
**Email:** {{contact_email}}
**WhatsApp:** {{whatsapp}}
**Instagram:** {{instagram}}
**Opening hours:** {{opening_hours}}$content$,
    true
  ),
  (
    'privacy-policy',
    'Privacy Policy',
    $content$# Privacy Policy
{{cafe_name}} ("we") respects your privacy. This page explains what we collect and why.

## Information we collect
- Order details (items, notes, order code, time).
- Name or table number if you provide it when ordering.
- Optional feedback you submit.
- Basic technical data (device type, browser) to keep the site working.

## How we use it
- To prepare and deliver your order.
- To improve our menu and service.
- To keep the website secure and working.

## Payments
Payments are currently handled in person. When online payment is added, it will be processed by a third-party payment provider and we will not store your card or e-wallet details.

## Sharing
We do not sell your data. We only share it with service providers needed to run the website (for example hosting and database), or when required by law.

## Retention
We keep order records only as long as needed for operations and legal obligations.

## Your rights
You can ask us to access, correct or delete your personal data by contacting {{contact_email}}.

## Changes
We may update this policy. The date below shows the latest version.$content$,
    true
  ),
  (
    'terms-of-service',
    'Terms of Service',
    $content$# Terms of Service
By using this website and ordering from {{cafe_name}}, you agree to these terms.

## Orders
Orders are confirmed when our staff accepts them. We may decline or pause orders when we are closed, busy, or an item is unavailable.

## Prices and menu
Prices and availability may change without notice. The price shown at the time of ordering applies.

## Payment
Payment is due at the counter unless online payment is offered. Taxes or service charges, if any, are shown at checkout.

## Cancellations and issues
Contact our staff immediately if there is a problem with your order. We'll do our best to make it right.

## Acceptable use
Don't misuse the website, place false orders, or attempt to disrupt the service.

## Liability
We prepare food and drinks with care, but we are not liable for indirect losses arising from use of the website, to the extent permitted by law.

## Changes
We may update these terms at any time. Continued use means you accept the changes.

## Contact
Questions? Reach us at {{contact_email}}.$content$,
    true
  )
ON CONFLICT (slug) DO NOTHING;
