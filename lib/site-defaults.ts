/**
 * lib/site-defaults.ts
 *
 * Single source of truth for ALL default copy, theme, brand, and section
 * content used throughout the public-facing homepage and admin editors.
 *
 * Rules:
 *  - All guest-facing copy is in casual Indonesian ("kamu").
 *  - Currency: formatted Rupiah only — no USD.
 *  - No fake stats (rating "4.8", "Happy customers", "100% Quality Sourced",
 *    "5★ Rated by guests"), no hotlinked Pexels/stock images.
 *  - socialProof.enabled defaults to FALSE — the block is hidden until an
 *    admin explicitly turns it on with real data.
 *  - Newsletter enabled defaults to FALSE — hidden until configured.
 *  - Footer link columns contain only working paths (no dead '#' anchors).
 */

// ─── Theme ────────────────────────────────────────────────────────────────────

export const DEFAULT_THEME: Record<string, string> = {
  primary:    '#6b4122',
  secondary:  '#e4c298',
  background: '#faf6f2',
  foreground: '#2a1f17',
  accent:     '#f0dcc0',
  card:       '#ffffff',
  muted:      '#f1e8de',
};

// ─── Brand ────────────────────────────────────────────────────────────────────

export const DEFAULT_BRAND = {
  brandName:     'CAFE',
  brandSubtitle: 'Kopi & Makanan Segar',
};

// ─── SEO ──────────────────────────────────────────────────────────────────────

export const DEFAULT_SEO = {
  title:       'CAFE — Kopi & Makanan Segar',
  description: 'Pesan kopi dan makanan favoritmu langsung dari meja tanpa perlu antre. Scan QR, pilih menu, nikmati.',
  ogImageUrl:  '',
};

// ─── Navbar ───────────────────────────────────────────────────────────────────

export type DefaultNavLink = { label: string; href: string };

export const DEFAULT_NAVBAR = {
  ctaLabel: 'Pesan Sekarang',
  links: [
    { label: 'Beranda',    href: '/#home'   },
    { label: 'Menu',       href: '/menu'   },
    { label: 'Riwayat',   href: '/orders' },
    { label: 'Lokasi',     href: '/#stores' },
    { label: 'Cerita Kami', href: '/#story' },
  ] satisfies DefaultNavLink[],
};

// ─── Hero ─────────────────────────────────────────────────────────────────────

export const DEFAULT_HERO = {
  badge:          'Scan QR di mejamu — pesan tanpa harus antre',
  headline:       'Kopi Nikmat',
  headlineAccent: '& Makanan Segar.',
  subheadline:    'Scan kode QR di mejamu, lihat menu lengkapnya, dan pesan favoritmu — kopi dan makanan lezat langsung diantar ke tempatmu duduk.',
  primaryCta:    { label: 'Lihat Menu',     href: '/menu'         },
  secondaryCta:  { label: 'Cara Pemesanan', href: '#how-it-works' },
  heroImageUrl:  '',      // intentionally empty — renders neutral placeholder
  heroImageAlt:  'Suasana kafe yang nyaman',
  // Social proof is opt-in only; disabled by default so no fake numbers show
  socialProof: {
    enabled:           false,
    customersTitle:    'Pelanggan puas',
    customersSubtitle: 'di setiap kunjungan',
    ratingValue:       '4.8',
    ratingTitle:       'Rating pelanggan',
    ratingSubtitle:    'disukai pelanggan tetap',
  },
};

// ─── Value Proposition ────────────────────────────────────────────────────────

export const DEFAULT_VALUE_PROPOSITION = {
  tag:         'Kenapa Pilih Kami',
  title:       'Kopi enak, mudah dipesan',
  description: 'Kami menggabungkan kopi spesial, makanan lezat, dan kemudahan pemesanan mandiri — setiap kunjungan jadi lebih cepat, simpel, dan menyenangkan.',
  features: [
    {
      title:       'Scan & Pesan',
      description: 'Setiap meja punya kode QR. Scan pakai HP, lihat menu lengkap, dan pesan langsung — tanpa antre, tanpa panggil pelayan.',
    },
    {
      title:       'Tidak Perlu Antre',
      description: 'Pesan dari tempat duduk dan makanan serta minumanmu langsung diantar. Nikmati kunjunganmu tanpa berdiri dalam antrean.',
    },
    {
      title:       'Kopi & Makanan Lengkap',
      description: 'Dari espresso yang diracik dengan teliti hingga makanan yang baru disiapkan. Semua yang kamu suka, tersedia di satu tempat.',
    },
  ],
};

// ─── How It Works ─────────────────────────────────────────────────────────────

export const DEFAULT_HOW_IT_WORKS = {
  tag:         'Cara Pemesanan',
  title:       'Tiga langkah,',
  titleAccent: 'kopi tanpa menunggu.',
  description: 'Tidak perlu antre, tidak perlu memanggil staf. Cukup scan kode QR di mejamu, pilih yang kamu suka, dan santai menunggu pesananmu diantar.',
  steps: [
    { num: '01', title: 'Scan Kode QR',    desc: 'Buka kamera HP, scan kode QR di mejamu, dan menu lengkap langsung muncul di layarmu.' },
    { num: '02', title: 'Pilih & Sesuaikan', desc: 'Pilih minuman dan makananmu, sesuaikan selera, dan bayar dengan aman langsung dari HP.' },
    { num: '03', title: 'Santai & Nikmati', desc: 'Tim kami menyiapkan pesananmu dan mengantarnya langsung ke mejamu. Tanpa antre, tanpa repot.' },
  ],
  // Mockup item shown inside the phone illustration — editable via admin
  mockup: {
    appLabel:   'CAFE',
    tableLabel: 'Meja',
    tableValue: 'A-12',
    tableStatus: 'Aktif',
    menuTitle:  'Menu Hari Ini',
    itemName:   'Es Kopi Susu',
    itemPrice:  'Rp 25.000',
    itemNote:   'Less ice',
  },
};

// ─── Featured Menu ────────────────────────────────────────────────────────────

export const DEFAULT_FEATURED_MENU = {
  eyebrow:   'Pilihan Favorit',
  title:     'Menu Paling Disukai',
  linkLabel: 'Lihat semua menu',
};

// ─── Local Roots (Our Story) ──────────────────────────────────────────────────

export const DEFAULT_LOCAL_ROOTS = {
  tag:          'Cerita Kami',
  title:        'Berakar dari kecintaan,',
  titleAccent:  'digerakkan oleh semangat.',
  description:  'Kami mulai dari langkah kecil — sebuah ide sederhana bahwa kopi yang enak dan makanan yang jujur seharusnya bisa dinikmati semua orang. Hari ini kami bangga melayani komunitasmu setiap hari, dengan perhatian dan kualitas yang sama seperti pertama kali kami memulai.',
  // stats is empty by default — render only if admin explicitly sets them
  stats: [] as { value: string; label: string }[],
  commitments: [
    {
      title: 'Biji Kopi Pilihan',
      desc:  'Kami memilih biji kopi langsung dari kebun-kebun terpilih, masing-masing dipilih karena profil rasa uniknya.',
    },
    {
      title: 'Mendukung Petani',
      desc:  'Setiap cangkir yang kamu nikmati mendukung para petani di baliknya. Hubungan langsung, harga adil, dan nilai bersama.',
    },
    {
      title: 'Peduli Lingkungan',
      desc:  'Dari desain pencahayaan alami hingga kemasan yang bijak, kami terus berupaya meninggalkan jejak yang lebih ringan.',
    },
  ],
  storyImageUrl: '', // intentionally empty — renders neutral placeholder
  storyImageAlt: 'Suasana pembuatan kopi kami',
};

// ─── Footer ───────────────────────────────────────────────────────────────────

/** New normalized footer link columns schema */
export type FooterLinkColumn = {
  title: string;
  links: { label: string; href: string }[];
};

export const DEFAULT_FOOTER = {
  tagline:   'Kopi spesial dan makanan lezat, langsung diantar ke mejamu. Scan kode QR dan pesan dalam hitungan detik.',
  copyright: 'CAFE',
  // Only include links that actually work — no dead '#' anchors
  linkColumns: [
    {
      title: 'Jelajahi',
      links: [
        { label: 'Menu',       href: '/menu'    },
        { label: 'Riwayat',   href: '/orders'  },
        { label: 'Lokasi',     href: '/#stores' },
        { label: 'Cerita Kami', href: '/#story' },
      ],
    },
    {
      title: 'Bantuan',
      links: [
        { label: 'Bantuan',            href: '/p/support'          },
        { label: 'Pusat Bantuan',      href: '/p/help-centre'      },
        { label: 'Hubungi Kami',       href: '/p/contact-us'       },
        { label: 'Kebijakan Privasi',  href: '/p/privacy-policy'   },
        { label: 'Syarat & Ketentuan', href: '/p/terms-of-service' },
      ],
    },
  ] satisfies FooterLinkColumn[],
  socials: [] as { platform: string; href: string; label: string }[],
  newsletter: {
    enabled:        false,
    label:          'Dapatkan info terbaru & penawaran',
    placeholder:    'emailmu@contoh.com',
    successMessage: 'Terima kasih! Kamu sudah terdaftar.',
  },
};
