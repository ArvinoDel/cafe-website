'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Coffee,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  Mail,
  ArrowRight,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { useBrand } from '@/components/providers/BrandProvider';
import {
  DEFAULT_FOOTER,
  DEFAULT_BRAND,
  type FooterLinkColumn,
} from '@/lib/site-defaults';

// ─── Shape normalisation & route resolution ──────────────────────────────────

const KNOWN_FOOTER_HREFS: Record<string, string> = {
  // Support & policies
  'support': '/p/support',
  'bantuan': '/p/support',
  'help centre': '/p/help-centre',
  'help center': '/p/help-centre',
  'pusat bantuan': '/p/help-centre',
  'contact us': '/p/contact-us',
  'contact': '/p/contact-us',
  'kontak': '/p/contact-us',
  'hubungi kami': '/p/contact-us',
  'privacy policy': '/p/privacy-policy',
  'kebijakan privasi': '/p/privacy-policy',
  'privasi': '/p/privacy-policy',
  'terms of service': '/p/terms-of-service',
  'terms & conditions': '/p/terms-of-service',
  'terms': '/p/terms-of-service',
  'syarat & ketentuan': '/p/terms-of-service',
  'syarat dan ketentuan': '/p/terms-of-service',
  // Navigation
  'menu': '/menu',
  'coffee': '/menu',
  'non-coffee': '/menu',
  'food': '/menu',
  'snacks': '/menu',
  'riwayat': '/orders',
  'orders': '/orders',
  'about us': '/#story',
  'cerita kami': '/#story',
  'our locations': '/#stores',
  'lokasi': '/#stores',
  'how it works': '/#how-it-works',
  'scan & order': '/#how-it-works',
};

function resolveFooterHref(label: string, existingHref?: string): string {
  if (existingHref && existingHref.trim() !== '' && existingHref !== '#') {
    return existingHref;
  }
  const normalized = label.trim().toLowerCase();
  return KNOWN_FOOTER_HREFS[normalized] || '';
}

/**
 * Normalize old footer link columns shape (Record<string, string[]>) to the new
 * structured shape ([{ title, links: [{ label, href }] }]).
 * Automatically resolves missing hrefs for known pages and ensures all 5 footer pages are accessible.
 */
function normalizeLinkColumns(raw: unknown): FooterLinkColumn[] {
  if (!raw) return DEFAULT_FOOTER.linkColumns;

  // New shape: array of { title, links }
  if (Array.isArray(raw)) {
    const cols = (raw as FooterLinkColumn[])
      .filter((col) => col && typeof col.title === 'string' && Array.isArray(col.links))
      .map((col) => ({
        ...col,
        links: col.links.map((link) => ({
          ...link,
          href: resolveFooterHref(link.label, link.href),
        })),
      }));

    const hasSupport = cols.some((c) =>
      ['support', 'bantuan', 'kebijakan', 'legal'].includes(c.title.toLowerCase().trim()),
    );
    if (!hasSupport) {
      const defaultSupportCol = DEFAULT_FOOTER.linkColumns.find(
        (c) => c.title.toLowerCase() === 'support',
      );
      if (defaultSupportCol) {
        cols.push(defaultSupportCol);
      }
    } else {
      // Ensure all 5 pages are present in Support column
      const supportCol = cols.find((c) =>
        ['support', 'bantuan', 'kebijakan', 'legal'].includes(c.title.toLowerCase().trim()),
      );
      if (supportCol) {
        const existingHrefs = new Set(supportCol.links.map((l) => l.href));
        const requiredPages = [
          { label: 'Support', href: '/p/support' },
          { label: 'Help Centre', href: '/p/help-centre' },
          { label: 'Contact Us', href: '/p/contact-us' },
          { label: 'Privacy Policy', href: '/p/privacy-policy' },
          { label: 'Terms of Service', href: '/p/terms-of-service' },
        ];
        for (const req of requiredPages) {
          if (!existingHrefs.has(req.href)) {
            supportCol.links.push(req);
            existingHrefs.add(req.href);
          }
        }
      }
    }

    return cols;
  }

  // Old shape: Record<string, string[]>
  if (typeof raw === 'object') {
    const cols = Object.entries(raw as Record<string, unknown>).map(([category, links]) => ({
      title: category,
      links: Array.isArray(links)
        ? (links as string[]).map((label) => ({
            label,
            href: resolveFooterHref(label),
          }))
        : [],
    }));

    // Ensure Support column has all 5 pages
    const supportCol = cols.find((c) =>
      ['support', 'bantuan', 'kebijakan', 'legal'].includes(c.title.toLowerCase().trim()),
    );
    if (supportCol) {
      const existingHrefs = new Set(supportCol.links.map((l) => l.href));
      const requiredPages = [
        { label: 'Support', href: '/p/support' },
        { label: 'Help Centre', href: '/p/help-centre' },
        { label: 'Contact Us', href: '/p/contact-us' },
        { label: 'Privacy Policy', href: '/p/privacy-policy' },
        { label: 'Terms of Service', href: '/p/terms-of-service' },
      ];
      for (const req of requiredPages) {
        if (!existingHrefs.has(req.href)) {
          supportCol.links.push(req);
          existingHrefs.add(req.href);
        }
      }
    }

    return cols;
  }

  return DEFAULT_FOOTER.linkColumns;
}

// ─── Social icon map ──────────────────────────────────────────────────────────

const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  twitter:   Twitter,
  facebook:  Facebook,
  youtube:   Youtube,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type FooterContent = {
  brandName?: string;
  brandSubtitle?: string;
  tagline?: string;
  newsletter?: {
    enabled?: boolean;
    label?: string;
    placeholder?: string;
    successMessage?: string;
  };
  /** New shape: array. Old shape (Record<string,string[]>) normalised on read. */
  linkColumns?: FooterLinkColumn[] | Record<string, string[]>;
  socials?: { platform: string; href: string; label: string }[];
  copyright?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Footer({ content }: { content?: FooterContent }) {
  const brand = useBrand();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');

  const brandName     = content?.brandName     || brand.brandName     || DEFAULT_BRAND.brandName;
  const brandSubtitle = content?.brandSubtitle || brand.brandSubtitle || DEFAULT_BRAND.brandSubtitle;
  const tagline       = content?.tagline       || DEFAULT_FOOTER.tagline;
  const copyright     = content?.copyright     || brand.brandName     || DEFAULT_BRAND.brandName;

  // Newsletter — hidden by default, only shown when enabled
  const newsletter = content?.newsletter ?? DEFAULT_FOOTER.newsletter;
  const showNewsletter = newsletter?.enabled === true;

  // Link columns — normalise old shapes on read
  const columns = normalizeLinkColumns(content?.linkColumns);

  // Socials — only render entries with a real non-empty href
  const socials = (content?.socials ?? DEFAULT_FOOTER.socials).filter(
    (s) => s.href && s.href.trim() !== '' && s.href !== '#',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot }),
      });
      if (res.ok) {
        setSubmitted(true);
        setEmail('');
        setTimeout(() => setSubmitted(false), 4000);
      } else {
        const json = await res.json().catch(() => ({}));
        setSubmitError(json.error || 'Gagal mendaftar. Coba lagi.');
      }
    } catch {
      setSubmitError('Tidak dapat terhubung. Periksa koneksimu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="bg-coffee-950 text-cream pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top section */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid lg:grid-cols-5 gap-12 pb-16 border-b border-coffee-800/60"
        >
          {/* Brand + Newsletter */}
          <motion.div variants={fadeInUp} className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-700">
                <Coffee className="w-5 h-5" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-extrabold">{brandName}</span>
                <span className="text-xs font-medium tracking-[0.2em] text-coffee-400 uppercase">
                  {brandSubtitle}
                </span>
              </div>
            </div>
            <p className="text-cream/50 text-sm leading-relaxed max-w-sm mb-6">
              {tagline}
            </p>

            {/* Newsletter — only rendered when admin enables it */}
            {showNewsletter && (
              <div>
                <p className="text-sm font-semibold text-cream mb-3">
                  {newsletter?.label || DEFAULT_FOOTER.newsletter.label}
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-2 max-w-sm">
                  {/* Honeypot — hidden from real users, filled by bots */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    aria-hidden="true"
                    autoComplete="off"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                  />
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/40" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={newsletter?.placeholder || DEFAULT_FOOTER.newsletter.placeholder}
                        required
                        disabled={submitting}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-coffee-900 border border-coffee-800 text-cream text-sm placeholder:text-cream/30 focus:outline-none focus:border-sand-300 transition-colors disabled:opacity-60"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center justify-center px-4 py-3 rounded-xl bg-coffee-600 hover:bg-coffee-500 text-cream transition-colors active:scale-95 disabled:opacity-60"
                      aria-label="Daftar"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                  {submitError && (
                    <p className="text-xs text-red-400">{submitError}</p>
                  )}
                </form>
                {submitted && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-sand-300"
                  >
                    {newsletter?.successMessage || DEFAULT_FOOTER.newsletter.successMessage}
                  </motion.p>
                )}
              </div>
            )}
          </motion.div>

          {/* Link columns — only render links with real hrefs */}
          {columns.map((col) => {
            const validLinks = col.links.filter(
              (link) => link.href && link.href.trim() !== '' && link.href !== '#',
            );
            if (!validLinks.length) return null;
            return (
              <motion.div key={col.title} variants={fadeInUp}>
                <h4 className="text-sm font-bold text-cream uppercase tracking-wider mb-4">
                  {col.title}
                </h4>
                <ul className="space-y-3">
                  {validLinks.map((link) => (
                    <li key={`${link.href}-${link.label}`}>
                      <a
                        href={link.href}
                        className="text-sm text-cream/50 hover:text-sand-300 transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-sm text-cream/40 text-center sm:text-left">
            © {new Date().getFullYear()} {copyright}. Semua hak dilindungi.
          </p>
          {socials.length > 0 && (
            <div className="flex items-center gap-3">
              {socials.map((social) => {
                const Icon = SOCIAL_ICONS[social.platform?.toLowerCase()] ?? Coffee;
                return (
                  <a
                    key={social.label || social.platform}
                    href={social.href}
                    aria-label={social.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-900 border border-coffee-800 text-cream/60 hover:bg-coffee-700 hover:text-cream hover:border-coffee-600 transition-all active:scale-90"
                  >
                    <Icon className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
