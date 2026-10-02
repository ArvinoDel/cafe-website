'use client';

import { motion } from 'framer-motion';
import { Plus, Coffee, UtensilsCrossed } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { formatRupiah } from '@/lib/format';
import { DEFAULT_FEATURED_MENU } from '@/lib/site-defaults';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeaturedMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  badge: string | null;
};

type FeaturedMenuContent = {
  eyebrow?: string;
  title?: string;
  linkLabel?: string;
};

type Props = {
  /** Items fetched from the DB (is_featured = true, is_available = true, max 8). */
  items: FeaturedMenuItem[];
  /** Optional admin-configured section copy (overrides defaults). */
  content?: FeaturedMenuContent | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeaturedMenu({ items, content }: Props) {
  // If there are no featured items, hide the section completely.
  if (!items || items.length === 0) return null;

  const eyebrow   = content?.eyebrow   || DEFAULT_FEATURED_MENU.eyebrow;
  const title     = content?.title     || DEFAULT_FEATURED_MENU.title;
  const linkLabel = content?.linkLabel || DEFAULT_FEATURED_MENU.linkLabel;

  return (
    <section id="menu-preview" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <motion.span
              variants={fadeInUp}
              className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
            >
              {eyebrow}
            </motion.span>
            <motion.h2
              variants={fadeInUp}
              className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
            >
              {title}
            </motion.h2>
          </div>
          <motion.a
            variants={fadeInUp}
            href="/menu"
            className="text-coffee-700 font-semibold text-sm hover:text-coffee-800 transition-colors inline-flex items-center gap-1 group"
          >
            {linkLabel}
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </motion.a>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {items.map((item) => (
            <motion.div
              key={item.id}
              variants={fadeInUp}
              whileHover={{ y: -8 }}
              className="group bg-white rounded-2xl overflow-hidden border border-coffee-100/80 hover:shadow-soft-lg transition-shadow duration-300 cursor-pointer"
            >
              {/* Image or placeholder */}
              <div className="relative aspect-[4/5] overflow-hidden bg-coffee-50">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                ) : (
                  /* Neutral placeholder when no image is configured */
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-coffee-50 to-sand-100">
                    {item.badge === 'makanan' ? (
                      <UtensilsCrossed className="w-10 h-10 text-coffee-300" />
                    ) : (
                      <Coffee className="w-10 h-10 text-coffee-300" />
                    )}
                  </div>
                )}

                {item.badge && (
                  <span
                    className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
                      item.badge === 'Bestseller'
                        ? 'bg-coffee-700 text-cream'
                        : 'bg-sand-300 text-coffee-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-5">
                <h3 className="font-bold text-coffee-900 text-base leading-snug mb-1">
                  {item.name}
                </h3>
                {item.description && (
                  <p className="text-sm text-charcoal/50 leading-relaxed mb-4 line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-lg font-extrabold text-coffee-700">
                    {formatRupiah(item.price)}
                  </span>
                  <a
                    href="/menu"
                    aria-label={`Pesan ${item.name}`}
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-coffee-50 text-coffee-700 hover:bg-coffee-700 hover:text-cream transition-all active:scale-90 group-hover:bg-coffee-700 group-hover:text-cream"
                  >
                    <Plus className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
