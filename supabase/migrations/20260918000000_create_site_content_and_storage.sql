/*
 * Migration: site_content table, menu_items.is_featured column,
 *            and site-images Storage bucket + RLS policies
 *
 * Tables created / modified
 * ─────────────────────────
 * NEW  site_content   – key-value CMS for all homepage sections + theme
 * MOD  menu_items     – add is_featured boolean for homepage FeaturedMenu section
 *
 * Storage
 * ───────
 * NEW  site-images    – public-read, superadmin-only write bucket for
 *                       logo, hero image, and story image uploads
 *
 * RLS pattern mirrors 20260917000000_create_branches_and_profiles.sql:
 *   SELECT  → anon + authenticated (true — public content)
 *   INSERT / UPDATE / DELETE → get_my_role() = 'superadmin' only
 */

-- ============================================================
-- 1. site_content TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS site_content (
  section    text        PRIMARY KEY,
  content    jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION set_site_content_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_content_updated_at ON site_content;
CREATE TRIGGER trg_site_content_updated_at
  BEFORE UPDATE ON site_content
  FOR EACH ROW EXECUTE FUNCTION set_site_content_updated_at();

-- RLS policies — site_content

DROP POLICY IF EXISTS "site_content_select_public" ON site_content;
CREATE POLICY "site_content_select_public"
ON site_content FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "site_content_insert_superadmin" ON site_content;
CREATE POLICY "site_content_insert_superadmin"
ON site_content FOR INSERT
TO authenticated
WITH CHECK (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "site_content_update_superadmin" ON site_content;
CREATE POLICY "site_content_update_superadmin"
ON site_content FOR UPDATE
TO authenticated
USING (get_my_role() = 'superadmin')
WITH CHECK (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "site_content_delete_superadmin" ON site_content;
CREATE POLICY "site_content_delete_superadmin"
ON site_content FOR DELETE
TO authenticated
USING (get_my_role() = 'superadmin');

-- ============================================================
-- 2. menu_items — add is_featured column
-- ============================================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_menu_items_is_featured
  ON menu_items (is_featured)
  WHERE is_featured = true;

-- ============================================================
-- 3. site-images Storage bucket + policies
-- ============================================================

-- Create the public bucket (idempotent via DO block)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('site-images', 'site-images', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
END;
$$;

-- Public read: anyone can download from site-images
DROP POLICY IF EXISTS "site_images_select_public" ON storage.objects;
CREATE POLICY "site_images_select_public"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-images');

-- Superadmin-only write: upload
DROP POLICY IF EXISTS "site_images_insert_superadmin" ON storage.objects;
CREATE POLICY "site_images_insert_superadmin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-images'
  AND get_my_role() = 'superadmin'
);

-- Superadmin-only write: replace / update
DROP POLICY IF EXISTS "site_images_update_superadmin" ON storage.objects;
CREATE POLICY "site_images_update_superadmin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'site-images'
  AND get_my_role() = 'superadmin'
)
WITH CHECK (
  bucket_id = 'site-images'
  AND get_my_role() = 'superadmin'
);

-- Superadmin-only write: delete
DROP POLICY IF EXISTS "site_images_delete_superadmin" ON storage.objects;
CREATE POLICY "site_images_delete_superadmin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-images'
  AND get_my_role() = 'superadmin'
);

-- ============================================================
-- 4. Seed default neutral content rows
-- ============================================================

INSERT INTO site_content (section, content) VALUES

-- ── navbar ──────────────────────────────────────────────────
('navbar', $${
  "brandName": "CAFE",
  "brandSubtitle": "Specialty Coffee",
  "ctaLabel": "Scan to Order",
  "links": [
    { "label": "Home",     "href": "#home"      },
    { "label": "Menu",     "href": "/menu"      },
    { "label": "Stores",   "href": "#stores"    },
    { "label": "Our Story","href": "#story"     }
  ]
}$$::jsonb),

-- ── hero ────────────────────────────────────────────────────
('hero', $${
  "badge": "Scan the QR at your table — order without the queue",
  "headline": "Artisan Coffee",
  "headlineAccent": "& Fresh Kitchen.",
  "subheadline": "Scan the QR code at your table, browse our full menu, and order your favourites — great coffee and fresh food delivered right to your seat.",
  "primaryCta": { "label": "View Menu", "href": "/menu" },
  "secondaryCta": { "label": "How It Works", "href": "#how-it-works" },
  "stats": [
    { "label": "Happy customers", "sub": "at every table" },
    { "label": "4.8 rating", "sub": "loved by regulars" }
  ],
  "floatingCards": [
    { "icon": "qr",    "title": "Table QR code", "sub": "Scan" },
    { "icon": "clock", "title": "5 minutes",      "sub": "Ready in" }
  ],
  "heroImageUrl": "https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
  "heroImageAlt": "Freshly brewed specialty coffee"
}$$::jsonb),

-- ── value_proposition ───────────────────────────────────────
('value_proposition', $${
  "tag": "Why Choose Us",
  "title": "Great coffee, made easy",
  "description": "We combine specialty coffee, great food, and self-service technology — making every visit simpler, faster, and more enjoyable.",
  "features": [
    {
      "icon": "qrcode",
      "title": "Scan & Order",
      "description": "Every table has a QR code. Scan with your phone, browse the full menu, and place your order — no waiting, no waiter required."
    },
    {
      "icon": "clock",
      "title": "Skip the Queue",
      "description": "Order from your seat and your food and drinks come to you. Enjoy your visit without standing in line."
    },
    {
      "icon": "utensils",
      "title": "Coffee & Kitchen",
      "description": "From expertly crafted espresso drinks to freshly prepared food. Everything you love, all in one place."
    }
  ]
}$$::jsonb),

-- ── how_it_works ────────────────────────────────────────────
('how_it_works', $${
  "tag": "How It Works",
  "title": "Three steps,",
  "titleAccent": "coffee without the wait.",
  "description": "No queuing, no flagging down staff. Simply scan the QR code at your table, choose what you love, and settle back while we bring your order to you.",
  "steps": [
    {
      "num": "01",
      "icon": "qrcode",
      "title": "Scan the QR Code",
      "desc": "Open your camera, scan the QR code on your table, and the full menu appears instantly on your screen."
    },
    {
      "num": "02",
      "icon": "list",
      "title": "Choose & Customise",
      "desc": "Pick your drinks and food, customise to your preference, and pay securely right from your phone."
    },
    {
      "num": "03",
      "icon": "coffee",
      "title": "Sit Back & Enjoy",
      "desc": "Our team prepares your order and brings it straight to your table. No queuing, no hassle."
    }
  ],
  "mockup": {
    "appLabel": "CAFE",
    "tableLabel": "Table",
    "tableValue": "A-12",
    "tableStatus": "Active",
    "menuTitle": "Today's Menu"
  }
}$$::jsonb),

-- ── local_roots (story / about) ─────────────────────────────
('local_roots', $${
  "tag": "Our Story",
  "title": "Rooted in craft,",
  "titleAccent": "driven by passion.",
  "description": "We started small — a simple idea that great coffee and honest food should be easy for everyone to enjoy. Today we are proud to serve our community every day, with the same care and quality we started with.",
  "stats": [
    { "value": "100%", "label": "Quality Sourced" },
    { "value": "5★",   "label": "Rated by guests"  }
  ],
  "commitments": [
    {
      "icon": "sprout",
      "title": "Quality Sourced Beans",
      "desc": "We source our coffee beans directly from carefully selected farms, each chosen for their unique flavour profile."
    },
    {
      "icon": "heart",
      "title": "Supporting Farmers",
      "desc": "Every cup you enjoy supports the farmers behind it. Direct relationships, fair prices, and shared values."
    },
    {
      "icon": "globe",
      "title": "Eco-Conscious Approach",
      "desc": "From natural lighting design to thoughtful packaging, we work toward a lighter footprint with every decision."
    }
  ],
  "storyImageUrl": "https://images.pexels.com/photos/9535503/pexels-photo-9535503.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
  "storyImageAlt": "Freshly sourced coffee beans"
}$$::jsonb),

-- ── footer ──────────────────────────────────────────────────
('footer', $${
  "brandName": "CAFE",
  "brandSubtitle": "Specialty Coffee",
  "tagline": "Freshly brewed specialty coffee and great food, served right to your table. Scan the QR code and order in seconds.",
  "newsletter": {
    "label": "Get the latest news & offers",
    "placeholder": "your@email.com",
    "successMessage": "Thanks for subscribing!"
  },
  "linkColumns": {
    "Brand":        ["About Us", "Our Locations", "Careers", "Press"],
    "Menu":         ["Coffee", "Non-Coffee", "Food", "Snacks"],
    "Self Service": ["How It Works", "Scan & Order", "Gift Cards", "Loyalty"],
    "Support":      ["Help Centre", "Contact Us", "Privacy Policy", "Terms of Service"]
  },
  "socials": [
    { "platform": "instagram", "href": "#", "label": "Instagram" },
    { "platform": "twitter",   "href": "#", "label": "Twitter"   },
    { "platform": "facebook",  "href": "#", "label": "Facebook"  },
    { "platform": "youtube",   "href": "#", "label": "YouTube"   }
  ],
  "copyright": "Your Cafe"
}$$::jsonb),

-- ── theme ────────────────────────────────────────────────────
('theme', $${
  "primary":    "#6b4122",
  "secondary":  "#e4c298",
  "background": "#faf6f2",
  "foreground": "#2a1f17",
  "accent":     "#f0dcc0",
  "card":       "#ffffff",
  "muted":      "#f1e8de"
}$$::jsonb)

ON CONFLICT (section) DO NOTHING;
