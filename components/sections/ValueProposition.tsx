'use client';

import { motion } from 'framer-motion';
import { QrCode, Clock, UtensilsCrossed } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { DEFAULT_VALUE_PROPOSITION } from '@/lib/site-defaults';

export type ValuePropositionContent = {
  tag?: string;
  title?: string;
  description?: string;
  features?: { icon?: string; title: string; description: string }[];
};

const defaultIcons = [QrCode, Clock, UtensilsCrossed];

export default function ValueProposition({ content }: { content?: ValuePropositionContent }) {
  const tag          = content?.tag          || DEFAULT_VALUE_PROPOSITION.tag;
  const title        = content?.title        || DEFAULT_VALUE_PROPOSITION.title;
  const description  = content?.description  || DEFAULT_VALUE_PROPOSITION.description;
  const featureItems = content?.features && content.features.length > 0
    ? content.features
    : DEFAULT_VALUE_PROPOSITION.features;

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <motion.span
            variants={fadeInUp}
            className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
          >
            {tag}
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight text-balance"
          >
            {title}
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            {description}
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid md:grid-cols-3 gap-6 lg:gap-8"
        >
          {featureItems.map((feature, idx) => {
            const Icon = (feature as { icon?: unknown }).icon && typeof (feature as { icon?: unknown }).icon === 'function'
              ? ((feature as unknown as { icon: React.ComponentType<{ className?: string }> }).icon)
              : defaultIcons[idx % defaultIcons.length];
            return (
              <motion.div
                key={feature.title || idx}
                variants={fadeInUp}
                whileHover={{ y: -6 }}
                className="group relative bg-white rounded-2xl p-8 border border-coffee-100/80 hover:border-coffee-200 hover:shadow-soft-lg transition-all duration-300"
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-6 transition-transform group-hover:scale-110 bg-coffee-700 text-cream">
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-coffee-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-charcoal/60 leading-relaxed">
                  {feature.description}
                </p>
                <div className="absolute bottom-0 left-8 right-8 h-0.5 bg-gradient-to-r from-coffee-400 to-sand-300 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
