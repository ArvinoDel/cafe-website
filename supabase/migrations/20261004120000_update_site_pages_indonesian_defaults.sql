-- Migration: 20261004120000_update_site_pages_indonesian_defaults.sql
--
-- Updates site_pages with default Indonesian copy ONLY IF the current content
-- still matches the original English seed text (meaning the admin never edited it).
-- Never overwrites edited pages.

UPDATE site_pages
SET
  title = 'Bantuan',
  content = $content$# Bantuan
Butuh bantuan? Kami siap membantu.

- Pertanyaan tentang pesanan: sebutkan kode pesananmu dan kami akan segera mengeceknya.
- Ada masalah dengan minuman atau makananmu: beri tahu staf di kasir atau hubungi kami.
- Website tidak berfungsi: coba muat ulang halaman, lalu hubungi kami jika masih bermasalah.

**Kontak:** {{contact_email}} · {{contact_phone}} · WhatsApp {{whatsapp}}
**Jam buka:** {{opening_hours}}$content$
WHERE slug = 'support'
  AND (
    content = $content$# Support
Need a hand? We're happy to help.

- Questions about an order: tell us your order code and we'll check it right away.
- Something wrong with your drink or food: let the staff know at the counter, or message us.
- Website not working: try refreshing the page first, then contact us.

**Contact:** {{contact_email}} · {{contact_phone}} · WhatsApp {{whatsapp}}
**Hours:** {{opening_hours}}$content$
    OR replace(content, E'\r', '') = replace($content$# Support
Need a hand? We're happy to help.

- Questions about an order: tell us your order code and we'll check it right away.
- Something wrong with your drink or food: let the staff know at the counter, or message us.
- Website not working: try refreshing the page first, then contact us.

**Contact:** {{contact_email}} · {{contact_phone}} · WhatsApp {{whatsapp}}
**Hours:** {{opening_hours}}$content$, E'\r', '')
  );

UPDATE site_pages
SET
  title = 'Pusat Bantuan',
  content = $content$# Pusat Bantuan
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
Mohon beri tahu staf sebelum memesan agar kami bisa membantu.$content$
WHERE slug = 'help-centre'
  AND (
    content = $content$# Help Centre
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
Please tell our staff before ordering so we can advise you.$content$
    OR replace(content, E'\r', '') = replace($content$# Help Centre
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
Please tell our staff before ordering so we can advise you.$content$, E'\r', '')
  );

UPDATE site_pages
SET
  title = 'Hubungi Kami',
  content = $content$# Hubungi Kami
Kami senang mendengar kabar darimu.

**Alamat:** {{address}}
**Telepon:** {{contact_phone}}
**Email:** {{contact_email}}
**WhatsApp:** {{whatsapp}}
**Instagram:** {{instagram}}
**Jam buka:** {{opening_hours}}$content$
WHERE slug = 'contact-us'
  AND (
    content = $content$# Contact Us
We'd love to hear from you.

**Address:** {{address}}
**Phone:** {{contact_phone}}
**Email:** {{contact_email}}
**WhatsApp:** {{whatsapp}}
**Instagram:** {{instagram}}
**Opening hours:** {{opening_hours}}$content$
    OR replace(content, E'\r', '') = replace($content$# Contact Us
We'd love to hear from you.

**Address:** {{address}}
**Phone:** {{contact_phone}}
**Email:** {{contact_email}}
**WhatsApp:** {{whatsapp}}
**Instagram:** {{instagram}}
**Opening hours:** {{opening_hours}}$content$, E'\r', '')
  );

UPDATE site_pages
SET
  title = 'Kebijakan Privasi',
  content = $content$# Kebijakan Privasi
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
Kebijakan ini dapat diperbarui. Tanggal pembaruan terakhir ditampilkan di halaman ini.$content$
WHERE slug = 'privacy-policy'
  AND (
    content = $content$# Privacy Policy
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
We may update this policy. The date below shows the latest version.$content$
    OR replace(content, E'\r', '') = replace($content$# Privacy Policy
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
We may update this policy. The date below shows the latest version.$content$, E'\r', '')
  );

UPDATE site_pages
SET
  title = 'Syarat & Ketentuan',
  content = $content$# Syarat & Ketentuan
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
Ada pertanyaan? Hubungi kami di {{contact_email}}.$content$
WHERE slug = 'terms-of-service'
  AND (
    content = $content$# Terms of Service
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
Questions? Reach us at {{contact_email}}.$content$
    OR replace(content, E'\r', '') = replace($content$# Terms of Service
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
Questions? Reach us at {{contact_email}}.$content$, E'\r', '')
  );
