import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { createClient } from '@supabase/supabase-js';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Your Cafe — Specialty Coffee & Fresh Kitchen',
  description:
    'Scan the QR code at your table, browse the menu, and order without the wait. Great coffee and fresh food served right to your seat.',
  openGraph: {
    title: 'Your Cafe — Specialty Coffee & Fresh Kitchen',
    description: 'Scan the QR code at your table and order without the wait.',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
};

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

/**
 * Fetch the `theme` row from site_content using a direct anon-key request.
 * We intentionally bypass cookie auth here (public content) and fall back
 * gracefully to DEFAULT_THEME when the table doesn't exist yet.
 */
async function getSiteTheme(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return DEFAULT_THEME;

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('site_content')
      .select('content')
      .eq('section', 'theme')
      .maybeSingle();

    if (error || !data?.content) return DEFAULT_THEME;

    // Merge DB values with defaults (so missing keys fall back safely)
    return { ...DEFAULT_THEME, ...(data.content as Record<string, string>) };
  } catch {
    return DEFAULT_THEME;
  }
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
  const theme = await getSiteTheme();
  const themeStyle = buildThemeStyle(theme);

  return (
    <html lang="en" className={jakarta.variable}>
      <head>
        {/* Inline theme so first paint already has the correct palette */}
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
