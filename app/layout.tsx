import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AURA Coffee — Specialty Coffee, One Click Away',
  description:
    'Order ahead on the AURA Coffee app. Grab your specialty coffee without the queue. Sustainable, direct-trade coffee delivered fast.',
  openGraph: {
    title: 'AURA Coffee — Specialty Coffee, One Click Away',
    description: 'Order ahead on our app. Grab your coffee without the queue.',
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
