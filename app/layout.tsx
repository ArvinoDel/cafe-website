import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { BrandProvider } from '@/components/providers/BrandProvider';
import { Toaster } from '@/components/ui/sonner';
import { DEFAULT_THEME, DEFAULT_BRAND, DEFAULT_SEO } from '@/lib/site-defaults';
import { getSiteContent } from '@/lib/site-data';
import { SpeedInsights } from '@vercel/speed-insights/next';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

async function getSiteConfig(): Promise<{
  theme: Record<string, string>;
  brand: { brandName: string; brandSubtitle: string };
  seo: { title: string; description: string; ogImageUrl: string };
}> {
  try {
    const map = await getSiteContent();

    const theme = { ...DEFAULT_THEME, ...(map.theme as Record<string, string>) };

    const navbarContent = (map.navbar as Record<string, string>) || {};
    const brand = {
      brandName:     navbarContent.brandName     || DEFAULT_BRAND.brandName,
      brandSubtitle: navbarContent.brandSubtitle || DEFAULT_BRAND.brandSubtitle,
    };

    const seoContent = (map.seo as Record<string, string>) || {};
    const seo = {
      title:       seoContent.title       || DEFAULT_SEO.title,
      description: seoContent.description || DEFAULT_SEO.description,
      ogImageUrl:  seoContent.ogImageUrl  || DEFAULT_SEO.ogImageUrl,
    };

    return { theme, brand, seo };
  } catch {
    return { theme: DEFAULT_THEME, brand: DEFAULT_BRAND, seo: DEFAULT_SEO };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { brand, seo } = await getSiteConfig();

  // Prefer the dedicated seo section; fall back to brand-based copy
  const title       = seo.title       || `${brand.brandName} — ${brand.brandSubtitle}`;
  const description = seo.description || DEFAULT_SEO.description;

  const metaObj: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
    },
  };

  // Only attach OG image when one is actually configured
  if (seo.ogImageUrl) {
    (metaObj.openGraph as Record<string, unknown>).images = [{ url: seo.ogImageUrl }];
    (metaObj.twitter  as Record<string, unknown>).images = [{ url: seo.ogImageUrl }];
  }

  return metaObj;
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
    <html lang="id" className={jakarta.variable}>
      <head>
        {/* Inline theme so first paint already has the correct palette */}
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      </head>
      <body className="font-sans antialiased">
        <BrandProvider initialBrand={brand}>
          {children}
          <Toaster richColors position="top-right" />
        </BrandProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
