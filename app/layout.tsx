import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { createClient } from '@supabase/supabase-js';
import { BrandProvider } from '@/components/providers/BrandProvider';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

// ── Default theme (applied before DB row is fetched or if fetch fails) ─────────
const DEFAULT_THEME: Record<string, string> = {
  primary:    '#6b4122',
  secondary:  '#e4c298',
  background: '#faf6f2',
  foreground: '#2a1f17',
  accent:     '#f0dcc0',
  card:       '#ffffff',
  muted:      '#f1e8de',
};

const DEFAULT_BRAND = {
  brandName: 'CAFE',
  brandSubtitle: 'Specialty Coffee & Fresh Kitchen',
};

async function getSiteConfig(): Promise<{
  theme: Record<string, string>;
  brand: { brandName: string; brandSubtitle: string };
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { theme: DEFAULT_THEME, brand: DEFAULT_BRAND };
  }

  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('site_content')
      .select('section, content')
      .in('section', ['theme', 'navbar']);

    const map = (data || []).reduce((acc, row) => {
      acc[row.section] = row.content;
      return acc;
    }, {} as Record<string, any>);

    const theme = { ...DEFAULT_THEME, ...(map.theme as Record<string, string>) };
    const navbarContent = (map.navbar as Record<string, string>) || {};
    const brand = {
      brandName: navbarContent.brandName || DEFAULT_BRAND.brandName,
      brandSubtitle: navbarContent.brandSubtitle || DEFAULT_BRAND.brandSubtitle,
    };

    return { theme, brand };
  } catch {
    return { theme: DEFAULT_THEME, brand: DEFAULT_BRAND };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getSiteConfig();
  const name = brand.brandName || 'CAFE';
  const subtitle = brand.brandSubtitle || 'Specialty Coffee & Fresh Kitchen';

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
    title: `${name} — ${subtitle}`,
    description: `Scan the QR code at your table, browse the menu, and order without the wait. Great coffee and fresh food served right to your seat at ${name}.`,
    openGraph: {
      title: `${name} — ${subtitle}`,
      description: `Scan the QR code at your table and order without the wait at ${name}.`,
      images: [{ url: 'https://bolt.new/static/og_default.png' }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [{ url: 'https://bolt.new/static/og_default.png' }],
    },
  };
}

/** Build an inline <style> string that overrides CSS custom properties. */
function buildThemeStyle(theme: Record<string, string>): string {
  const vars = Object.entries(theme)
    .map(([k, v]) => `  --color-${k}: ${v};`)
    .join('\n');
  return `:root {\n${vars}\n}`;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, brand } = await getSiteConfig();
  const themeStyle = buildThemeStyle(theme);

  return (
    <html lang="en" className={jakarta.variable}>
      <head>
        {/* Inline theme so first paint already has the correct palette */}
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      </head>
      <body className="font-sans antialiased">
        <BrandProvider initialBrand={brand}>{children}</BrandProvider>
      </body>
    </html>
  );
}
