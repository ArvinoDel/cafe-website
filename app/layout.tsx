import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kopi Nako — Siang Makan Nasi, Kalau Malam Minum Kopi',
  description:
    'Scan barcode di meja, pesan kopi favoritmu tanpa antri. Kopi susu, latte aren, dan nasi khas Indonesia dalam satu konsep kedai kekinian.',
  openGraph: {
    title: 'Kopi Nako — Siang Makan Nasi, Kalau Malam Minum Kopi',
    description: 'Scan barcode di meja, pesan kopi favoritmu tanpa antri.',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
