'use client';

import { motion } from 'framer-motion';
import { QrCode, ArrowRight, Star, Clock } from 'lucide-react';
import { fadeInUp, staggerContainer, slideInRight, scaleIn } from '@/lib/animations';

export type HeroContent = {
  badge?: string;
  headline?: string;
  headlineAccent?: string;
  subheadline?: string;
  primaryCta?: { label: string; href?: string };
  secondaryCta?: { label: string; href?: string };
  stats?: { label: string; sub: string }[];
  floatingCards?: { icon: string; title: string; sub: string }[];
  heroImageUrl?: string;
  heroImageAlt?: string;
};

export default function Hero({ content }: { content?: HeroContent }) {
  const badge = content?.badge || 'Scan the QR at your table — order without the queue';
  const headline = content?.headline || 'Artisan Coffee';
  const headlineAccent = content?.headlineAccent || '& Fresh Kitchen.';
  const subheadline = content?.subheadline || 'Scan the QR code at your table, browse our full menu, and order your favourites — great coffee and fresh food delivered right to your seat.';
  const primaryCta = content?.primaryCta || { label: 'View Menu', href: '/menu' };
  const secondaryCta = content?.secondaryCta || { label: 'How It Works', href: '#how-it-works' };
  const heroImageUrl = content?.heroImageUrl || 'https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
  const heroImageAlt = content?.heroImageAlt || 'Freshly brewed specialty coffee';

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center pt-20 pb-16 overflow-hidden bg-gradient-to-b from-sand-100/50 via-cream to-cream"
    >
      {/* Decorative background blobs */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-coffee-200/30 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-sand-200/40 rounded-full blur-3xl -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-start text-left order-2 lg:order-1"
          >
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-coffee-50 border border-coffee-200 text-coffee-700 text-sm font-medium mb-6"
            >
              <QrCode className="w-4 h-4" />
              {badge}
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-coffee-900 leading-[1.1] text-balance"
            >
              {headline}
              <br />
              <span className="text-coffee-600">{headlineAccent}</span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="mt-6 text-lg sm:text-xl text-charcoal/60 max-w-xl leading-relaxed"
            >
              {subheadline}
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="mt-8 flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <a
                href={primaryCta.href || '/menu'}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-coffee-700 text-cream font-semibold text-base hover:bg-coffee-800 transition-all hover:shadow-soft-lg active:scale-95"
              >
                <QrCode className="w-5 h-5" />
                {primaryCta.label || 'View Menu'}
              </a>
              <a
                href={secondaryCta.href || '#how-it-works'}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white border-2 border-coffee-200 text-coffee-700 font-semibold text-base hover:border-coffee-400 hover:bg-coffee-50 transition-all active:scale-95"
              >
                {secondaryCta.label || 'How It Works'}
                <ArrowRight className="w-5 h-5" />
              </a>
            </motion.div>

            {/* Social proof */}
            <motion.div
              variants={fadeInUp}
              className="mt-10 flex flex-wrap items-center gap-6 sm:gap-8"
            >
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-9 h-9 rounded-full border-2 border-cream bg-gradient-to-br from-coffee-300 to-coffee-500 flex items-center justify-center text-cream text-xs font-bold"
                    >
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-charcoal">Happy customers</p>
                  <p className="text-charcoal/50">at every table</p>
                </div>
              </div>
              <div className="h-10 w-px bg-coffee-100" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-coffee-500 text-coffee-500" />
                  ))}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-charcoal">4.8 rating</p>
                  <p className="text-charcoal/50">loved by regulars</p>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right: Visual */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={slideInRight}
            className="relative order-1 lg:order-2 flex justify-center"
          >
            <div className="relative w-full max-w-md lg:max-w-lg">
              {/* Main image */}
              <motion.div
                variants={scaleIn}
                className="relative rounded-[2rem] overflow-hidden shadow-soft-xl aspect-[4/5]"
              >
                <img
                  src={heroImageUrl}
                  alt={heroImageAlt}
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-coffee-950/20 to-transparent" />
              </motion.div>

              {/* Floating card 1: Scan to order */}
              <motion.div
                initial={{ opacity: 0, x: -30, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="absolute -left-2 sm:-left-6 top-1/4 bg-white/90 backdrop-blur-md rounded-2xl shadow-soft-lg p-4 border border-coffee-100/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-100">
                    <QrCode className="w-5 h-5 text-coffee-700" />
                  </div>
                  <div>
                    <p className="text-xs text-charcoal/50 font-medium">Scan</p>
                    <p className="text-base font-bold text-coffee-800">Table QR code</p>
                  </div>
                </div>
              </motion.div>

              {/* Floating card 2: Ready time */}
              <motion.div
                initial={{ opacity: 0, x: 30, y: -20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="absolute -right-2 sm:-right-6 bottom-1/4 bg-white/90 backdrop-blur-md rounded-2xl shadow-soft-lg p-4 border border-coffee-100/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sand-100">
                    <Clock className="w-5 h-5 text-coffee-600" />
                  </div>
                  <div>
                    <p className="text-xs text-charcoal/50 font-medium">Ready in</p>
                    <p className="text-base font-bold text-coffee-800">5 minutes</p>
                  </div>
                </div>
              </motion.div>

              {/* Decorative ring */}
              <div className="absolute -bottom-8 -left-8 w-32 h-32 border-2 border-coffee-200/50 rounded-full -z-10" />
              <div className="absolute -top-6 -right-6 w-20 h-20 bg-sand-200/40 rounded-full blur-2xl -z-10" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
