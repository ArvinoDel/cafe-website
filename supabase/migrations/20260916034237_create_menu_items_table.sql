/*
# Create menu_items table for Kopi Nako menu

1. New Tables
- `menu_items`: stores all food and drink items for the Kopi Nako menu
  - `id` (uuid, primary key)
  - `name` (text, not null) — item name
  - `description` (text) — short description
  - `price` (integer, not null) — price in IDR (Rupiah, no decimals)
  - `category` (text, not null) — one of: 'kopi', 'non-kopi', 'makanan', 'snack'
  - `image_url` (text) — URL to product image
  - `badge` (text, nullable) — optional badge like 'Bestseller', 'New'
  - `is_available` (boolean, default true)
  - `sort_order` (integer, default 0) — for ordering within category
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `menu_items`.
- This is a no-auth public menu — all items are intentionally shared/public.
- Allow anon + authenticated to read (SELECT) menu items.
- No writes from the client (managed via migrations/admin).

3. Notes
- Prices stored as integers in IDR (e.g., 27000 = Rp 27.000)
- Categories: kopi (coffee), non-kopi (non-coffee drinks), makanan (rice meals), snack (snacks)
- Seed data includes real Kopi Nako menu items with images
*/

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

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_menu_items" ON menu_items;
CREATE POLICY "public_read_menu_items"
ON menu_items FOR SELECT
TO anon, authenticated
USING (true);

-- Seed data: Kopi Nako menu items
-- Kopi (Coffee)
INSERT INTO menu_items (name, description, price, category, image_url, badge, sort_order) VALUES
('Es Kopi Susu Nako', 'Kopi susu creamy dengan gula aren khas Nako. Best seller kami.', 27000, 'kopi', 'https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'Bestseller', 1),
('Latte Aren', 'Espresso lembut dengan susu dan sirop gula aren asli.', 29000, 'kopi', 'https://images.pexels.com/photos/4913342/pexels-photo-4913342.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 2),
('Nakopresso', 'Espresso susu dengan gula aren, bold dan creamy.', 23000, 'kopi', 'https://images.pexels.com/photos/9052283/pexels-photo-9052283.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 3),
('Cappucino ala Nako', 'Cappucino klasik dengan sentuhan es krim vanilla.', 29000, 'kopi', 'https://images.pexels.com/photos/6747870/pexels-photo-6747870.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 4),
('Es Kopi Nusantara', 'Kopi susu dengan pandan dan kelapa — rasa Indonesia.', 27000, 'kopi', 'https://images.pexels.com/photos/36456987/pexels-photo-36456987.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'New', 5),
('Chocopresso', 'Coklat rasa kopi, manis dan pekat untuk pencinta coklat.', 25000, 'kopi', 'https://images.pexels.com/photos/15086185/pexels-photo-15086185.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 6),
('Iced Caramel Latte', 'Latte dingin dengan caramel yang manis dan creamy.', 27500, 'kopi', 'https://images.pexels.com/photos/36572435/pexels-photo-36572435.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 7),
('Es Kopi Susu Daur Baur', 'Susu oat, almond, gula aren, dan espresso dalam satu gelas.', 38500, 'kopi', 'https://images.pexels.com/photos/19352810/pexels-photo-19352810.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 8)
ON CONFLICT DO NOTHING;

-- Non-Kopi (Non-Coffee Drinks)
INSERT INTO menu_items (name, description, price, category, image_url, badge, sort_order) VALUES
('Mango Lassi', 'Yoghurt dengan mango dan bahan rahasia. Manis dan segar.', 25000, 'non-kopi', 'https://images.pexels.com/photos/8330286/pexels-photo-8330286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'Bestseller', 1),
('Matcha Latte', 'Matcha ceremonial grade dengan susu segar.', 30000, 'non-kopi', 'https://images.pexels.com/photos/38737533/pexels-photo-38737533.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 2),
('Teh Ella', 'Teh hangat dengan rasa khas yang menenangkan.', 18000, 'non-kopi', 'https://images.pexels.com/photos/39537967/pexels-photo-39537967.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 3),
('Es Kopi Susu Boba', 'Kopi susu dengan boba chewy — fun dan creamy.', 32000, 'non-kopi', 'https://images.pexels.com/photos/8004558/pexels-photo-8004558.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 4)
ON CONFLICT DO NOTHING;

-- Makanan (Rice Meals)
INSERT INTO menu_items (name, description, price, category, image_url, badge, sort_order) VALUES
('Nasi Campur Nako', 'Nasi dengan lauk pilihan, tempe, telur, dan sayuran.', 28000, 'makanan', 'https://images.pexels.com/photos/37081060/pexels-photo-37081060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'Bestseller', 1),
('Nasi Kuning Spesial', 'Nasi kuning dengan lauk tradisional Indonesia.', 30000, 'makanan', 'https://images.pexels.com/photos/37106996/pexels-photo-37106996.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 2),
('Nasi Padang', 'Nasi dengan daging, sayuran, dan kerupuk di atas daun pisang.', 32000, 'makanan', 'https://images.pexels.com/photos/37066472/pexels-photo-37066472.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 3),
('Nasi Langgi', 'Nasi dengan udang dan berbagai lauk di atas daun pisang.', 35000, 'makanan', 'https://images.pexels.com/photos/37211440/pexels-photo-37211440.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 4)
ON CONFLICT DO NOTHING;

-- Snack
INSERT INTO menu_items (name, description, price, category, image_url, badge, sort_order) VALUES
('Cheese Potato', 'Potongan kentang dengan saus keju meleleh.', 22000, 'snack', 'https://images.pexels.com/photos/15159416/pexels-photo-15159416.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'Bestseller', 1),
('Potato Wedges', 'Kentang wedges renyah dengan saus pilihan.', 20000, 'snack', 'https://images.pexels.com/photos/7437931/pexels-photo-7437931.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 2),
('Crispy Fries', 'Kentang goreng dengan saus keju creamy.', 18000, 'snack', 'https://images.pexels.com/photos/30132426/pexels-photo-30132426.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', null, 3)
ON CONFLICT DO NOTHING;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_menu_items_sort_order ON menu_items(sort_order);
