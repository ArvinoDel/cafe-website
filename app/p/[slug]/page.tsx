import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Calendar, ArrowLeft, ChevronRight } from 'lucide-react';
import Navbar from '@/components/sections/Navbar';
import Footer from '@/components/sections/Footer';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { getSitePage, getSiteContent, getBranches } from '@/lib/site-data';
import { extractSitePlaceholders, resolvePlaceholders } from '@/lib/page-content';
import { DEFAULT_BRAND, DEFAULT_SEO } from '@/lib/site-defaults';

// 300s cache TTL with on-demand tag revalidation
export const revalidate = 300;

export async function generateStaticParams() {
  return [
    { slug: 'support' },
    { slug: 'help-centre' },
    { slug: 'contact-us' },
    { slug: 'privacy-policy' },
    { slug: 'terms-of-service' },
  ];
}

function extractExcerpt(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*')) continue;
    const clean = trimmed
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
    if (clean.length > 20) {
      return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
    }
  }
  return DEFAULT_SEO.description;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [page, siteContent] = await Promise.all([
    getSitePage(params.slug),
    getSiteContent(),
  ]);

  if (!page || !page.is_published) {
    return {
      title: 'Halaman Tidak Ditemukan',
    };
  }

  const brandName =
    siteContent.navbar?.brandName ||
    siteContent.theme?.brandName ||
    DEFAULT_BRAND.brandName;

  const description = extractExcerpt(page.content);
  const title = `${page.title} — ${brandName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
    },
  };
}

export default async function SiteSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const [page, siteContent, branches] = await Promise.all([
    getSitePage(params.slug),
    getSiteContent(),
    getBranches(),
  ]);

  // Non-existent or unpublished draft pages return 404
  if (!page || !page.is_published) {
    notFound();
  }

  const placeholders = extractSitePlaceholders(siteContent, branches);
  const resolvedContent = resolvePlaceholders(page.content, placeholders);

  const showLastUpdated =
    page.slug === 'privacy-policy' || page.slug === 'terms-of-service';
  const formattedDate = page.updated_at ? formatDate(page.updated_at) : '';

  return (
    <>
      <Navbar content={siteContent.navbar} />
      <main className="min-h-screen bg-cream pt-24 sm:pt-28 pb-16 lg:pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs sm:text-sm text-charcoal/60">
              <li>
                <a
                  href="/"
                  className="hover:text-coffee-800 transition-colors"
                >
                  Beranda
                </a>
              </li>
              <li>
                <ChevronRight className="w-3.5 h-3.5 text-coffee-300" />
              </li>
              <li className="font-semibold text-coffee-900 truncate">
                {page.title}
              </li>
            </ol>
          </nav>

          {/* Article card */}
          <article className="bg-white/90 backdrop-blur-md rounded-2xl sm:rounded-3xl p-6 sm:p-10 lg:p-14 shadow-soft border border-coffee-100/70">
            {/* Header */}
            <header className="mb-8">
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-950 tracking-tight leading-tight">
                {page.title}
              </h1>
              {showLastUpdated && formattedDate && (
                <p className="mt-3 text-xs sm:text-sm font-medium text-charcoal/60 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-coffee-600 inline-block" />
                  <span>Terakhir diperbarui: {formattedDate}</span>
                </p>
              )}
            </header>

            <div className="h-px bg-coffee-100/80 mb-8 sm:mb-10" />

            {/* Markdown Body */}
            <MarkdownRenderer
              content={resolvedContent}
              skipFirstH1={true}
            />

            {/* Bottom Actions & Metadata */}
            <footer className="mt-12 pt-6 border-t border-coffee-100/80 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm text-charcoal/60">
              <a
                href="/"
                className="inline-flex items-center gap-1.5 font-semibold text-coffee-700 hover:text-coffee-900 transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                Kembali ke Beranda
              </a>
              {showLastUpdated && formattedDate && (
                <span>Dokumen resmi per {formattedDate}</span>
              )}
            </footer>
          </article>
        </div>
      </main>
      <Footer content={siteContent.footer} />
    </>
  );
}
