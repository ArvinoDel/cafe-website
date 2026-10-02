'use client';

import { motion } from 'framer-motion';
import { QrCode, ArrowRight, Coffee, User } from 'lucide-react';
import { fadeInUp, staggerContainer, slideInRight, scaleIn } from '@/lib/animations';
import { DEFAULT_HERO } from '@/lib/site-defaults';

export type SocialProofContent = {
  enabled?: boolean;
  customersTitle?: string;
  customersSubtitle?: string;
  ratingValue?: string;
  ratingTitle?: string;
  ratingSubtitle?: string;
};

export type HeroContent = {
  badge?: string;
  headline?: string;
  headlineAccent?: string;
  subheadline?: string;
  primaryCta?: { label: string; href?: string };
  secondaryCta?: { label: string; href?: string };
  heroImageUrl?: string;
  heroImageAlt?: string;
  socialProof?: SocialProofContent;
};

export default function Hero({ content }: { content?: HeroContent }) {
  const badge          = content?.badge          || DEFAULT_HERO.badge;
  const headline       = content?.headline       || DEFAULT_HERO.headline;
  const headlineAccent = content?.headlineAccent || DEFAULT_HERO.headlineAccent;
  const subheadline    = content?.subheadline    || DEFAULT_HERO.subheadline;
  const primaryCta     = content?.primaryCta     || DEFAULT_HERO.primaryCta;
  const secondaryCta   = content?.secondaryCta   || DEFAULT_HERO.secondaryCta;
  const heroImageUrl   = content?.heroImageUrl   ?? DEFAULT_HERO.heroImageUrl;
  const heroImageAlt   = content?.heroImageAlt   || DEFAULT_HERO.heroImageAlt;

  // Social proof — only render when explicitly enabled with real data
  const sp = content?.socialProof ?? DEFAULT_HERO.socialProof;
  const showSocialProof = sp?.enabled === true;

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
                {primaryCta.label}
              </a>
              <a
                href={secondaryCta.href || '#how-it-works'}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white border-2 border-coffee-200 text-coffee-700 font-semibold text-base hover:border-coffee-400 hover:bg-coffee-50 transition-all active:scale-95"
              >
                {secondaryCta.label}
                <ArrowRight className="w-5 h-5" />
              </a>
            </motion.div>

            {/* Social proof — only shown when admin explicitly enables it */}
            {showSocialProof && (
              <motion.div
                variants={fadeInUp}
                className="mt-10 flex flex-wrap items-center gap-6 sm:gap-8"
              >
                <div className="flex items-center gap-2">
                  {/* Generic user-icon bubbles — no fake letter avatars */}
                  <div className="flex -space-x-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-9 h-9 rounded-full border-2 border-cream bg-gradient-to-br from-coffee-300 to-coffee-500 flex items-center justify-center text-cream"
                      >
                        <User className="w-4 h-4" />
                      </div>
                    ))}
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-charcoal">{sp?.customersTitle}</p>
                    <p className="text-charcoal/50">{sp?.customersSubtitle}</p>
                  </div>
                </div>
                {sp?.ratingValue && (
                  <>
                    <div className="h-10 w-px bg-coffee-100" />
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-extrabold text-coffee-700">{sp.ratingValue}</p>
                      <div className="text-sm">
                        <p className="font-semibold text-charcoal">{sp?.ratingTitle}</p>
                        <p className="text-charcoal/50">{sp?.ratingSubtitle}</p>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* Right: Visual */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={slideInRight}
            className="relative order-1 lg:order-2 flex justify-center"
          >
            <div className="relative w-full max-w-md lg:max-w-lg">
              {/* Hero image or neutral placeholder */}
              <motion.div
                variants={scaleIn}
                className="relative rounded-[2rem] overflow-hidden shadow-soft-xl aspect-[4/5]"
              >
                {heroImageUrl ? (
                  <>
                    <img
                      src={heroImageUrl}
                      alt={heroImageAlt}
                      className="w-full h-full object-cover"
                      loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-coffee-950/20 to-transparent" />
                  </>
                ) : (
                  /* Neutral placeholder — no stock images */
                  <div className="w-full h-full bg-gradient-to-br from-coffee-100 via-sand-100 to-coffee-200 flex flex-col items-center justify-center gap-4">
                    <div className="flex items-center justify-center w-24 h-24 rounded-3xl bg-coffee-700/20 text-coffee-600">
                      <Coffee className="w-12 h-12" />
                    </div>
                    <p className="text-coffee-500 text-sm font-medium text-center px-8 leading-relaxed">
                      Tambahkan foto utama di pengaturan konten
                    </p>
                  </div>
                )}
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
                    <p className="text-base font-bold text-coffee-800">QR Code Meja</p>
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
                    <QrCode className="w-5 h-5 text-coffee-600" />
                  </div>
                  <div>
                    <p className="text-xs text-charcoal/50 font-medium">Pesan langsung</p>
                    <p className="text-base font-bold text-coffee-800">Dari mejamu</p>
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
