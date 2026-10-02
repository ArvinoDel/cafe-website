'use client';

import { motion } from 'framer-motion';
import { QrCode, ListOrdered, Coffee, ShoppingCart } from 'lucide-react';
import {
  fadeInUp,
  staggerContainer,
  slideInLeft,
} from '@/lib/animations';
import { useBrand } from '@/components/providers/BrandProvider';
import { DEFAULT_HOW_IT_WORKS, DEFAULT_BRAND } from '@/lib/site-defaults';

export type HowItWorksContent = {
  tag?: string;
  title?: string;
  titleAccent?: string;
  description?: string;
  steps?: { num: string; title: string; desc: string }[];
  mockup?: {
    appLabel?: string;
    tableLabel?: string;
    tableValue?: string;
    tableStatus?: string;
    menuTitle?: string;
    /** Editable featured item name */
    itemName?: string;
    /** Editable featured item price (pre-formatted string, e.g. "Rp 25.000") */
    itemPrice?: string;
    /** Editable featured item note / modifier */
    itemNote?: string;
  };
};

const defaultStepIcons = [QrCode, ListOrdered, Coffee];

export default function HowItWorks({ content }: { content?: HowItWorksContent }) {
  const brand       = useBrand();
  const tag         = content?.tag         || DEFAULT_HOW_IT_WORKS.tag;
  const title       = content?.title       || DEFAULT_HOW_IT_WORKS.title;
  const titleAccent = content?.titleAccent || DEFAULT_HOW_IT_WORKS.titleAccent;
  const description = content?.description || DEFAULT_HOW_IT_WORKS.description;
  const stepItems   = content?.steps && content.steps.length > 0 ? content.steps : DEFAULT_HOW_IT_WORKS.steps;
  const mockup      = { ...DEFAULT_HOW_IT_WORKS.mockup, ...(content?.mockup ?? {}) };

  // Use brand name from CMS/brand provider for the phone status bar
  const appLabel = mockup.appLabel || brand.brandName || DEFAULT_BRAND.brandName;

  return (
    <section id="how-it-works" className="py-20 sm:py-28 bg-cream relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-coffee-50 rounded-full blur-3xl -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Phone mockup */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={slideInLeft}
            className="flex justify-center order-2 lg:order-1"
          >
            <div className="relative">
              {/* Phone frame */}
              <div className="relative w-[280px] sm:w-[320px] h-[560px] sm:h-[640px] bg-coffee-900 rounded-[3rem] p-3 shadow-soft-xl">
                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-coffee-900 rounded-b-2xl z-20" />

                {/* Screen */}
                <div className="w-full h-full bg-gradient-to-b from-coffee-700 to-coffee-900 rounded-[2.5rem] overflow-hidden relative flex flex-col">
                  {/* Status bar */}
                  <div className="flex justify-between items-center px-6 pt-8 pb-2 text-cream/80 text-xs">
                    <span className="font-semibold">9:41</span>
                    <span>{appLabel}</span>
                  </div>

                  {/* Table indicator */}
                  <div className="mx-4 mt-4 bg-cream/10 backdrop-blur-md rounded-2xl p-4 border border-cream/15 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sand-300/30 flex items-center justify-center">
                      <QrCode className="w-5 h-5 text-sand-200" />
                    </div>
                    <div>
                      <p className="text-cream/60 text-xs">{mockup.tableLabel}</p>
                      <p className="text-cream text-lg font-bold">{mockup.tableValue}</p>
                    </div>
                    <div className="ml-auto px-3 py-1 rounded-lg bg-green-400/20 text-green-300 text-xs font-medium">
                      {mockup.tableStatus}
                    </div>
                  </div>

                  {/* Menu preview */}
                  <div className="mx-4 mt-3 bg-cream rounded-2xl p-4 flex-1 flex flex-col">
                    <p className="text-coffee-800 text-sm font-bold mb-3">
                      {mockup.menuTitle}
                    </p>

                    {/* Single featured item — all text, no stock images */}
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-coffee-50">
                      {/* Coffee icon placeholder instead of hotlinked image */}
                      <div className="w-12 h-12 rounded-xl bg-coffee-100 flex items-center justify-center flex-shrink-0">
                        <Coffee className="w-6 h-6 text-coffee-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-charcoal truncate">
                          {mockup.itemName}
                        </p>
                        <p className="text-xs text-charcoal/50">{mockup.itemNote}</p>
                      </div>
                      <p className="text-sm font-bold text-coffee-700 flex-shrink-0">
                        {mockup.itemPrice}
                      </p>
                    </div>

                    <div className="mt-auto">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-charcoal/50">Total</span>
                        <span className="text-lg font-extrabold text-coffee-800">
                          {mockup.itemPrice}
                        </span>
                      </div>
                      <button
                        className="w-full py-3 rounded-xl bg-coffee-700 text-cream text-sm font-bold flex items-center justify-center gap-2"
                        aria-hidden="true"
                        tabIndex={-1}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Pesan Sekarang
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating glow */}
              <div className="absolute -inset-4 bg-coffee-400/10 rounded-[3.5rem] -z-10 blur-2xl" />
              <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-sand-200/50 rounded-full blur-xl -z-10" />
            </div>
          </motion.div>

          {/* Right: Steps */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="order-1 lg:order-2"
          >
            <motion.span
              variants={fadeInUp}
              className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
            >
              {tag}
            </motion.span>

            <motion.h2
              variants={fadeInUp}
              className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight text-balance leading-[1.15]"
            >
              {title}
              <br />
              <span className="text-coffee-600">{titleAccent}</span>
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-5 text-lg text-charcoal/60 leading-relaxed max-w-lg"
            >
              {description}
            </motion.p>

            {/* Steps */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 space-y-6"
            >
              {stepItems.map((step, idx) => {
                const Icon = defaultStepIcons[idx % defaultStepIcons.length];
                return (
                  <div key={step.num || idx} className="flex items-start gap-5 group">
                    <div className="relative flex-shrink-0">
                      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-coffee-100 text-coffee-700 transition-colors group-hover:bg-coffee-700 group-hover:text-cream">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-coffee-700 text-cream text-[10px] font-bold flex items-center justify-center">
                        {step.num}
                      </span>
                    </div>
                    <div className="pt-1">
                      <p className="font-bold text-coffee-900 text-lg">{step.title}</p>
                      <p className="text-charcoal/50 text-sm leading-relaxed mt-1">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
