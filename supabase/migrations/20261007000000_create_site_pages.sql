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
    'Bantuan',
    $content$# Bantuan
Butuh bantuan? Kami siap membantu.

- Pertanyaan tentang pesanan: sebutkan kode pesananmu dan kami akan segera mengeceknya.
- Ada masalah dengan minuman atau makananmu: beri tahu staf di kasir atau hubungi kami.
- Website tidak berfungsi: coba muat ulang halaman, lalu hubungi kami jika masih bermasalah.

**Kontak:** {{contact_email}} · {{contact_phone}} · WhatsApp {{whatsapp}}
**Jam buka:** {{opening_hours}}$content$,
    true
  ),
  (
    'help-centre',
    'Pusat Bantuan',
    $content$# Pusat Bantuan
## Bagaimana cara memesan?
Pindai kode QR di mejamu atau buka website kami, pilih menu, tambahkan catatan (misalnya kurang manis atau tanpa es), lalu kirim pesanan.

## Bagaimana cara membayar?
Pembayaran dilakukan di kasir. Pembayaran online (QRIS) akan segera tersedia.

## Bisakah saya mengubah atau membatalkan pesanan?
Beri tahu staf secepatnya. Setelah pesanan mulai disiapkan, pembatalan mungkin tidak bisa dilakukan.

## Bagaimana cara melacak pesanan?
Setelah memesan, kamu akan mendapat kode pesanan. Gunakan kode itu di halaman status pesanan untuk melihat kapan pesananmu siap.

## Apakah ada Wi-Fi?
Ada. Informasi Wi-Fi tersedia di website dan di kasir.

## Saya punya alergi atau pantangan makanan.
Mohon beri tahu staf sebelum memesan agar kami bisa membantu.$content$,
    true
  ),
  (
    'contact-us',
    'Hubungi Kami',
    $content$# Hubungi Kami
Kami senang mendengar kabar darimu.

**Alamat:** {{address}}
**Telepon:** {{contact_phone}}
**Email:** {{contact_email}}
**WhatsApp:** {{whatsapp}}
**Instagram:** {{instagram}}
**Jam buka:** {{opening_hours}}$content$,
    true
  ),
  (
    'privacy-policy',
    'Kebijakan Privasi',
    $content$# Kebijakan Privasi
{{cafe_name}} ("kami") menghargai privasimu. Halaman ini menjelaskan data apa yang kami kumpulkan dan untuk apa.

## Data yang kami kumpulkan
- Detail pesanan (item, catatan, kode pesanan, waktu).
- Nama atau nomor meja jika kamu mengisinya saat memesan.
- Masukan (feedback) yang kamu kirim secara opsional.
- Data teknis dasar (jenis perangkat, browser) agar website berjalan baik.

## Cara kami menggunakan data
- Menyiapkan dan mengantar pesananmu.
- Meningkatkan menu dan layanan kami.
- Menjaga website tetap aman dan berfungsi.

## Pembayaran
Saat ini pembayaran dilakukan langsung di kasir. Saat pembayaran online tersedia, pembayaran diproses oleh penyedia pembayaran pihak ketiga dan kami tidak menyimpan data kartu atau dompet digitalmu.

## Berbagi data
Kami tidak menjual datamu. Data hanya dibagikan kepada penyedia layanan yang diperlukan untuk menjalankan website (misalnya hosting dan database), atau jika diwajibkan oleh hukum.

## Penyimpanan
Kami menyimpan catatan pesanan hanya selama diperlukan untuk operasional dan kewajiban hukum.

## Hakmu
Kamu dapat meminta akses, perbaikan, atau penghapusan data pribadimu dengan menghubungi {{contact_email}}.

## Perubahan
Kebijakan ini dapat diperbarui. Tanggal pembaruan terakhir ditampilkan di halaman ini.$content$,
    true
  ),
  (
    'terms-of-service',
    'Syarat & Ketentuan',
    $content$# Syarat & Ketentuan
Dengan menggunakan website ini dan memesan di {{cafe_name}}, kamu menyetujui ketentuan berikut.

## Pesanan
Pesanan dianggap terkonfirmasi setelah diterima oleh staf kami. Kami dapat menolak atau menunda pesanan saat tutup, sibuk, atau jika menu tidak tersedia.

## Harga dan menu
Harga dan ketersediaan menu dapat berubah sewaktu-waktu tanpa pemberitahuan. Harga yang berlaku adalah yang tertera saat pemesanan.

## Pembayaran
Pembayaran dilakukan di kasir kecuali pembayaran online tersedia. Pajak atau biaya layanan, jika ada, ditampilkan saat checkout.

## Pembatalan dan kendala
Hubungi staf kami secepatnya jika ada masalah dengan pesananmu. Kami akan berusaha sebaik mungkin untuk menyelesaikannya.

## Penggunaan yang wajar
Dilarang menyalahgunakan website, membuat pesanan palsu, atau mencoba mengganggu jalannya layanan.

## Batasan tanggung jawab
Kami menyiapkan makanan dan minuman dengan teliti, namun kami tidak bertanggung jawab atas kerugian tidak langsung akibat penggunaan website, sejauh diizinkan oleh hukum.

## Perubahan
Kami dapat memperbarui ketentuan ini sewaktu-waktu. Penggunaan layanan secara berkelanjutan berarti kamu menyetujui perubahan tersebut.

## Kontak
Ada pertanyaan? Hubungi kami di {{contact_email}}.$content$,
    true
  )
ON CONFLICT (slug) DO NOTHING;
