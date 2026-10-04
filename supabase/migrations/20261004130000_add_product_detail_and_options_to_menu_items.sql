-- Migration: 20261004130000_add_product_detail_and_options_to_menu_items.sql
--
-- Adds optional columns for rich product details, diet/allergen tags, prep time,
-- calories/portion, multi-image carousel, cross-sell pairings, and options/add-ons.
--
-- Idempotent: uses IF NOT EXISTS guards throughout.
-- All fields are optional and default to empty/null so existing menu items remain intact.

DO $$
BEGIN
  -- 1. Multi-photo array (swipeable gallery)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'image_urls'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN image_urls text[] DEFAULT '{}';
  END IF;

  -- 2. Ingredients text
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'ingredients'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN ingredients text;
  END IF;

  -- 3. Diet tags (e.g. Halal, Vegetarian, Spicy)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'diet_tags'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN diet_tags text[] DEFAULT '{}';
  END IF;

  -- 4. Allergen tags (e.g. Contains egg, Contains peanuts)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'allergen_tags'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN allergen_tags text[] DEFAULT '{}';
  END IF;

  -- 5. Estimated prep time in minutes (e.g. 10 -> "~10 min")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'prep_time_minutes'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN prep_time_minutes integer;
  END IF;

  -- 6. Calories or portion size (e.g. "350 kcal" or "1 porsi / 250g")
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'portion_calories'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN portion_calories text;
  END IF;

  -- 7. Cross-sell / pairing items ("Goes well with": 2-4 menu item UUIDs)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'pairing_item_ids'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN pairing_item_ids uuid[] DEFAULT '{}';
  END IF;

  -- 8. Add-ons and options configuration (JSONB)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'options'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN options jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- 9. Explicit is_sold_out column (default false)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'is_sold_out'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN is_sold_out boolean DEFAULT false;
  END IF;
END;
$$;
