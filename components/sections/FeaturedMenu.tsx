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
    <section id="menu-preview" className="py-12 sm:py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="flex items-end justify-between gap-4 mb-6 sm:mb-12"
        >
          <div>
            <motion.span
              variants={fadeInUp}
              className="text-xs sm:text-sm font-semibold text-coffee-600 uppercase tracking-wider"
            >
              {eyebrow}
            </motion.span>
            <motion.h2
              variants={fadeInUp}
              className="mt-1 sm:mt-3 text-2xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
            >
              {title}
            </motion.h2>
          </div>
          <motion.a
            variants={fadeInUp}
            href="/menu"
            className="text-coffee-700 font-semibold text-xs sm:text-sm hover:text-coffee-800 transition-colors inline-flex items-center gap-1 group whitespace-nowrap pb-1"
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
          className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6"
        >
          {items.map((item) => (
            <motion.div
              key={item.id}
              variants={fadeInUp}
              whileHover={{ y: -8 }}
              className="group bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-coffee-100/80 hover:shadow-soft-lg transition-shadow duration-300 cursor-pointer flex flex-col"
            >
              {/* Image or placeholder */}
              <div className="relative aspect-square sm:aspect-[4/5] overflow-hidden bg-coffee-50">
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
                      <UtensilsCrossed className="w-8 h-8 sm:w-10 sm:h-10 text-coffee-300" />
                    ) : (
                      <Coffee className="w-8 h-8 sm:w-10 sm:h-10 text-coffee-300" />
                    )}
                  </div>
                )}

                {item.badge && (
                  <span
                    className={`absolute top-2 left-2 sm:top-3 sm:left-3 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold ${
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
              <div className="p-3 sm:p-5 flex flex-col flex-1">
                <h3 className="font-bold text-coffee-900 text-xs sm:text-base leading-snug mb-1 line-clamp-1 sm:line-clamp-none">
                  {item.name}
                </h3>
                {item.description && (
                  <p className="text-[11px] sm:text-sm text-charcoal/50 leading-relaxed mb-2 sm:mb-4 line-clamp-1 sm:line-clamp-2">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-2 sm:pt-3">
                  <span className="text-xs sm:text-base lg:text-lg font-bold sm:font-extrabold text-coffee-700">
                    {formatRupiah(item.price)}
                  </span>
                  <a
                    href="/menu"
                    aria-label={`Pesan ${item.name}`}
                    className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-coffee-50 text-coffee-700 hover:bg-coffee-700 hover:text-cream transition-all active:scale-90 group-hover:bg-coffee-700 group-hover:text-cream shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
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
