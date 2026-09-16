import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local if present
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...values] = trimmed.split('=');
    const val = values.join('=').trim().replace(/^["']|["']$/g, '');
    if (key && val) {
      process.env[key.trim()] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Please provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const items = [
  {
    id: '7b2d5d7f-6a37-4ac3-b156-a4d3f1f30788',
    name: 'Es Kopi Susu Nako',
    description: 'Kopi susu creamy dengan gula aren khas Nako. Best seller kami.',
    price: 27000,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'Bestseller',
    is_available: true,
    sort_order: 1,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '3f4427b7-d53d-4d2e-9fbe-4e9a95d7c58c',
    name: 'Latte Aren',
    description: 'Espresso lembut dengan susu dan sirop gula aren asli.',
    price: 29000,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/4913342/pexels-photo-4913342.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 2,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '12e63abe-89bf-4e32-8d8d-494afea3dee4',
    name: 'Nakopresso',
    description: 'Espresso susu dengan gula aren, bold dan creamy.',
    price: 23000,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/9052283/pexels-photo-9052283.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 3,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '950ee4e8-4d63-4528-9161-d80d2f989bcf',
    name: 'Cappucino ala Nako',
    description: 'Cappucino klasik dengan sentuhan es krim vanilla.',
    price: 29000,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/6747870/pexels-photo-6747870.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 4,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'f009f9b3-56bc-485b-b5d1-6364c1e129f4',
    name: 'Es Kopi Nusantara',
    description: 'Kopi susu dengan pandan dan kelapa — rasa Indonesia.',
    price: 27000,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/36456987/pexels-photo-36456987.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'New',
    is_available: true,
    sort_order: 5,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '8ac22cdb-02d4-4155-8840-552ca01540a4',
    name: 'Chocopresso',
    description: 'Coklat rasa kopi, manis dan pekat untuk pencinta coklat.',
    price: 25000,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/15086185/pexels-photo-15086185.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 6,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '263c664e-f79c-4b3a-ab99-65d776621229',
    name: 'Iced Caramel Latte',
    description: 'Latte dingin dengan caramel yang manis dan creamy.',
    price: 27500,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/36572435/pexels-photo-36572435.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 7,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '06860f9c-0882-452f-9447-9d06f73e8b53',
    name: 'Es Kopi Susu Daur Baur',
    description: 'Susu oat, almond, gula aren, dan espresso dalam satu gelas.',
    price: 38500,
    category: 'kopi',
    image_url: 'https://images.pexels.com/photos/19352810/pexels-photo-19352810.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 8,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '096e6985-dfb0-484c-8c8d-7c88b1b416b9',
    name: 'Mango Lassi',
    description: 'Yoghurt dengan mango dan bahan rahasia. Manis dan segar.',
    price: 25000,
    category: 'non-kopi',
    image_url: 'https://images.pexels.com/photos/8330286/pexels-photo-8330286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'Bestseller',
    is_available: true,
    sort_order: 1,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'ce248464-0028-404b-be9e-d4d411ba8837',
    name: 'Matcha Latte',
    description: 'Matcha ceremonial grade dengan susu segar.',
    price: 30000,
    category: 'non-kopi',
    image_url: 'https://images.pexels.com/photos/38737533/pexels-photo-38737533.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 2,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'a6103181-0815-458d-a383-e7cbfbd1236c',
    name: 'Teh Ella',
    description: 'Teh hangat dengan rasa khas yang menenangkan.',
    price: 18000,
    category: 'non-kopi',
    image_url: 'https://images.pexels.com/photos/39537967/pexels-photo-39537967.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 3,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'e2301e18-0036-475e-a51b-729bcdece78f',
    name: 'Es Kopi Susu Boba',
    description: 'Kopi susu dengan boba chewy — fun dan creamy.',
    price: 32000,
    category: 'non-kopi',
    image_url: 'https://images.pexels.com/photos/8004558/pexels-photo-8004558.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 4,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '8c0b9929-0917-4d6d-ac3b-916c8c91484a',
    name: 'Nasi Campur Nako',
    description: 'Nasi dengan lauk pilihan, tempe, telur, dan sayuran.',
    price: 28000,
    category: 'makanan',
    image_url: 'https://images.pexels.com/photos/37081060/pexels-photo-37081060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'Bestseller',
    is_available: true,
    sort_order: 1,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'e25e9b3d-8797-489f-ac69-df201455aff3',
    name: 'Nasi Kuning Spesial',
    description: 'Nasi kuning dengan lauk tradisional Indonesia.',
    price: 30000,
    category: 'makanan',
    image_url: 'https://images.pexels.com/photos/37106996/pexels-photo-37106996.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 2,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '91fd3407-8cc9-45bb-9e2e-1d818de270a1',
    name: 'Nasi Padang',
    description: 'Nasi dengan daging, sayuran, dan kerupuk di atas daun pisang.',
    price: 32000,
    category: 'makanan',
    image_url: 'https://images.pexels.com/photos/37066472/pexels-photo-37066472.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 3,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'a0076216-9eb6-440f-b277-9abddf80570b',
    name: 'Nasi Langgi',
    description: 'Nasi dengan udang dan berbagai lauk di atas daun pisang.',
    price: 35000,
    category: 'makanan',
    image_url: 'https://images.pexels.com/photos/37211440/pexels-photo-37211440.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 4,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'e9f65ca3-2c12-42a8-a248-e73e54ae1e61',
    name: 'Cheese Potato',
    description: 'Potongan kentang dengan saus keju meleleh.',
    price: 22000,
    category: 'snack',
    image_url: 'https://images.pexels.com/photos/15159416/pexels-photo-15159416.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'Bestseller',
    is_available: true,
    sort_order: 1,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: 'cdd6facd-e501-4bc6-9f81-08a58fa90e0c',
    name: 'Potato Wedges',
    description: 'Kentang wedges renyah dengan saus pilihan.',
    price: 20000,
    category: 'snack',
    image_url: 'https://images.pexels.com/photos/7437931/pexels-photo-7437931.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 2,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
  {
    id: '9d2addd1-6250-43e3-b1ce-127686e7ea13',
    name: 'Crispy Fries',
    description: 'Kentang goreng dengan saus keju creamy.',
    price: 18000,
    category: 'snack',
    image_url: 'https://images.pexels.com/photos/30132426/pexels-photo-30132426.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
    is_available: true,
    sort_order: 3,
    created_at: '2026-09-16 03:42:39.223041+00',
  },
];

async function seed() {
  console.log('Inserting/updating items in Supabase...');
  const { data, error } = await supabase
    .from('menu_items')
    .upsert(items, { onConflict: 'id' });

  if (error) {
    console.error('Error seeding data:', error.message);
    process.exit(1);
  }

  console.log(`Successfully synced ${items.length} menu items!`);
}

seed();
