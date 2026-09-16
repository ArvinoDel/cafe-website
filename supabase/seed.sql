-- ==========================================================
-- 1. Create table `menu_items` (if it does not exist)
-- ==========================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price integer NOT NULL,
  category text NOT NULL CHECK (category IN ('kopi', 'non-kopi', 'makanan', 'snack')),
  image_url text,
  badge text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ==========================================================
-- 2. Row Level Security (RLS) Configuration
-- ==========================================================
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_menu_items" ON menu_items;
CREATE POLICY "public_read_menu_items"
ON menu_items FOR SELECT
TO anon, authenticated
USING (true);

-- ==========================================================
-- 3. Indexes for fast query performance
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_menu_items_sort_order ON menu_items(sort_order);

-- ==========================================================
-- 4. Upsert Data (Idempotent: safe to run multiple times)
-- ==========================================================
INSERT INTO menu_items (id, name, description, price, category, image_url, badge, is_available, sort_order, created_at)
VALUES
(
  '7b2d5d7f-6a37-4ac3-b156-a4d3f1f30788',
  'Es Kopi Susu Nako',
  'Kopi susu creamy dengan gula aren khas Nako. Best seller kami.',
  27000,
  'kopi',
  'https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'Bestseller',
  true,
  1,
  '2026-09-16 03:42:39.223041+00'
),
(
  '3f4427b7-d53d-4d2e-9fbe-4e9a95d7c58c',
  'Latte Aren',
  'Espresso lembut dengan susu dan sirop gula aren asli.',
  29000,
  'kopi',
  'https://images.pexels.com/photos/4913342/pexels-photo-4913342.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  2,
  '2026-09-16 03:42:39.223041+00'
),
(
  '12e63abe-89bf-4e32-8d8d-494afea3dee4',
  'Nakopresso',
  'Espresso susu dengan gula aren, bold dan creamy.',
  23000,
  'kopi',
  'https://images.pexels.com/photos/9052283/pexels-photo-9052283.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  3,
  '2026-09-16 03:42:39.223041+00'
),
(
  '950ee4e8-4d63-4528-9161-d80d2f989bcf',
  'Cappucino ala Nako',
  'Cappucino klasik dengan sentuhan es krim vanilla.',
  29000,
  'kopi',
  'https://images.pexels.com/photos/6747870/pexels-photo-6747870.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  4,
  '2026-09-16 03:42:39.223041+00'
),
(
  'f009f9b3-56bc-485b-b5d1-6364c1e129f4',
  'Es Kopi Nusantara',
  'Kopi susu dengan pandan dan kelapa — rasa Indonesia.',
  27000,
  'kopi',
  'https://images.pexels.com/photos/36456987/pexels-photo-36456987.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'New',
  true,
  5,
  '2026-09-16 03:42:39.223041+00'
),
(
  '8ac22cdb-02d4-4155-8840-552ca01540a4',
  'Chocopresso',
  'Coklat rasa kopi, manis dan pekat untuk pencinta coklat.',
  25000,
  'kopi',
  'https://images.pexels.com/photos/15086185/pexels-photo-15086185.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  6,
  '2026-09-16 03:42:39.223041+00'
),
(
  '263c664e-f79c-4b3a-ab99-65d776621229',
  'Iced Caramel Latte',
  'Latte dingin dengan caramel yang manis dan creamy.',
  27500,
  'kopi',
  'https://images.pexels.com/photos/36572435/pexels-photo-36572435.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  7,
  '2026-09-16 03:42:39.223041+00'
),
(
  '06860f9c-0882-452f-9447-9d06f73e8b53',
  'Es Kopi Susu Daur Baur',
  'Susu oat, almond, gula aren, dan espresso dalam satu gelas.',
  38500,
  'kopi',
  'https://images.pexels.com/photos/19352810/pexels-photo-19352810.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  8,
  '2026-09-16 03:42:39.223041+00'
),
(
  '096e6985-dfb0-484c-8c8d-7c88b1b416b9',
  'Mango Lassi',
  'Yoghurt dengan mango dan bahan rahasia. Manis dan segar.',
  25000,
  'non-kopi',
  'https://images.pexels.com/photos/8330286/pexels-photo-8330286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'Bestseller',
  true,
  1,
  '2026-09-16 03:42:39.223041+00'
),
(
  'ce248464-0028-404b-be9e-d4d411ba8837',
  'Matcha Latte',
  'Matcha ceremonial grade dengan susu segar.',
  30000,
  'non-kopi',
  'https://images.pexels.com/photos/38737533/pexels-photo-38737533.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  2,
  '2026-09-16 03:42:39.223041+00'
),
(
  'a6103181-0815-458d-a383-e7cbfbd1236c',
  'Teh Ella',
  'Teh hangat dengan rasa khas yang menenangkan.',
  18000,
  'non-kopi',
  'https://images.pexels.com/photos/39537967/pexels-photo-39537967.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  3,
  '2026-09-16 03:42:39.223041+00'
),
(
  'e2301e18-0036-475e-a51b-729bcdece78f',
  'Es Kopi Susu Boba',
  'Kopi susu dengan boba chewy — fun dan creamy.',
  32000,
  'non-kopi',
  'https://images.pexels.com/photos/8004558/pexels-photo-8004558.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  4,
  '2026-09-16 03:42:39.223041+00'
),
(
  '8c0b9929-0917-4d6d-ac3b-916c8c91484a',
  'Nasi Campur Nako',
  'Nasi dengan lauk pilihan, tempe, telur, dan sayuran.',
  28000,
  'makanan',
  'https://images.pexels.com/photos/37081060/pexels-photo-37081060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'Bestseller',
  true,
  1,
  '2026-09-16 03:42:39.223041+00'
),
(
  'e25e9b3d-8797-489f-ac69-df201455aff3',
  'Nasi Kuning Spesial',
  'Nasi kuning dengan lauk tradisional Indonesia.',
  30000,
  'makanan',
  'https://images.pexels.com/photos/37106996/pexels-photo-37106996.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  2,
  '2026-09-16 03:42:39.223041+00'
),
(
  '91fd3407-8cc9-45bb-9e2e-1d818de270a1',
  'Nasi Padang',
  'Nasi dengan daging, sayuran, dan kerupuk di atas daun pisang.',
  32000,
  'makanan',
  'https://images.pexels.com/photos/37066472/pexels-photo-37066472.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  3,
  '2026-09-16 03:42:39.223041+00'
),
(
  'a0076216-9eb6-440f-b277-9abddf80570b',
  'Nasi Langgi',
  'Nasi dengan udang dan berbagai lauk di atas daun pisang.',
  35000,
  'makanan',
  'https://images.pexels.com/photos/37211440/pexels-photo-37211440.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  4,
  '2026-09-16 03:42:39.223041+00'
),
(
  'e9f65ca3-2c12-42a8-a248-e73e54ae1e61',
  'Cheese Potato',
  'Potongan kentang dengan saus keju meleleh.',
  22000,
  'snack',
  'https://images.pexels.com/photos/15159416/pexels-photo-15159416.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'Bestseller',
  true,
  1,
  '2026-09-16 03:42:39.223041+00'
),
(
  'cdd6facd-e501-4bc6-9f81-08a58fa90e0c',
  'Potato Wedges',
  'Kentang wedges renyah dengan saus pilihan.',
  20000,
  'snack',
  'https://images.pexels.com/photos/7437931/pexels-photo-7437931.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  2,
  '2026-09-16 03:42:39.223041+00'
),
(
  '9d2addd1-6250-43e3-b1ce-127686e7ea13',
  'Crispy Fries',
  'Kentang goreng dengan saus keju creamy.',
  18000,
  'snack',
  'https://images.pexels.com/photos/30132426/pexels-photo-30132426.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  NULL,
  true,
  3,
  '2026-09-16 03:42:39.223041+00'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  badge = EXCLUDED.badge,
  is_available = EXCLUDED.is_available,
  sort_order = EXCLUDED.sort_order,
  created_at = EXCLUDED.created_at;
