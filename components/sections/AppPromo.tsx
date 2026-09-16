'use client';

import { motion } from 'framer-motion';
import { Smartphone, Star, Gift, Zap } from 'lucide-react';
import {
  fadeInUp,
  staggerContainer,
  slideInLeft,
  slideInRight,
} from '@/lib/animations';

const perks = [
  {
    icon: Zap,
    title: 'One-tap ordering',
    desc: 'Reorder your favorites in seconds',
  },
  {
    icon: Star,
    title: 'Earn Aura Points',
    desc: 'Every purchase brings rewards',
  },
  {
    icon: Gift,
    title: 'Exclusive drops',
    desc: 'App-only menus and seasonal drinks',
  },
];

export default function AppPromo() {
  return (
    <section id="download" className="py-20 sm:py-28 bg-cream relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-forest-50 rounded-full blur-3xl -z-10" />

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
              <div className="relative w-[280px] sm:w-[320px] h-[560px] sm:h-[640px] bg-forest-900 rounded-[3rem] p-3 shadow-soft-xl">
                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-forest-900 rounded-b-2xl z-20" />

                {/* Screen */}
                <div className="w-full h-full bg-gradient-to-b from-forest-700 to-forest-900 rounded-[2.5rem] overflow-hidden relative flex flex-col">
                  {/* Status bar */}
                  <div className="flex justify-between items-center px-6 pt-8 pb-2 text-white/80 text-xs">
                    <span className="font-semibold">9:41</span>
                    <span>AURA</span>
                  </div>

                  {/* Greeting */}
                  <div className="px-6 pt-4">
                    <p className="text-white/60 text-sm">Good morning,</p>
                    <p className="text-white text-xl font-bold">Alex</p>
                  </div>

                  {/* Balance card */}
                  <div className="mx-4 mt-4 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/60 text-xs">Aura Points</p>
                        <p className="text-white text-2xl font-extrabold">1,240</p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-sage-400/30 flex items-center justify-center">
                        <Star className="w-5 h-5 text-sage-300 fill-sage-300" />
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full w-3/4 bg-sage-300 rounded-full" />
                    </div>
                  </div>

                  {/* Order card */}
                  <div className="mx-4 mt-3 bg-white rounded-2xl p-4 flex-1 flex flex-col">
                    <p className="text-forest-800 text-sm font-bold mb-3">
                      Your Order
                    </p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-forest-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          src="https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                          alt="Latte"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-charcoal truncate">
                          Palm Sugar Latte
                        </p>
                        <p className="text-xs text-charcoal/50">Iced · Large</p>
                      </div>
                      <p className="text-sm font-bold text-forest-700">$4.50</p>
                    </div>
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-forest-50">
                      <div className="w-12 h-12 rounded-xl bg-sage-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          src="https://images.pexels.com/photos/8330286/pexels-photo-8330286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                          alt="Matcha"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-charcoal truncate">
                          Matcha Espresso
                        </p>
                        <p className="text-xs text-charcoal/50">Hot · Medium</p>
                      </div>
                      <p className="text-sm font-bold text-forest-700">$5.00</p>
                    </div>
                    <div className="mt-auto">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-charcoal/50">Total</span>
                        <span className="text-lg font-extrabold text-forest-800">
                          $9.50
                        </span>
                      </div>
                      <button className="w-full py-3 rounded-xl bg-forest-700 text-white text-sm font-bold">
                        Place Order
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating glow */}
              <div className="absolute -inset-4 bg-forest-400/10 rounded-[3.5rem] -z-10 blur-2xl" />
              <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-sage-200/50 rounded-full blur-xl -z-10" />
            </div>
          </motion.div>

          {/* Right: Copy + badges */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="order-1 lg:order-2"
          >
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-forest-50 border border-forest-100 text-forest-700 text-sm font-medium mb-5"
            >
              <Smartphone className="w-4 h-4" />
              The AURA App
            </motion.div>

            <motion.h2
              variants={fadeInUp}
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-forest-900 tracking-tight text-balance leading-[1.15]"
            >
              Your daily coffee,
              <br />
              <span className="text-forest-600">smarter than ever.</span>
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-5 text-lg text-charcoal/60 leading-relaxed max-w-lg"
            >
              Order ahead, earn rewards, and unlock exclusive drinks — all from
              your pocket. The AURA app makes every cup effortless.
            </motion.p>

            {/* Perks list */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 space-y-4"
            >
              {perks.map((perk) => {
                const Icon = perk.icon;
                return (
                  <div key={perk.title} className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-forest-100 text-forest-700 flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-forest-900">{perk.title}</p>
                      <p className="text-charcoal/50 text-sm">{perk.desc}</p>
                    </div>
                  </div>
                );
              })}
            </motion.div>

            {/* App badges */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 flex flex-wrap gap-4"
            >
              <a
                href="#"
                className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-forest-900 text-white hover:bg-forest-800 transition-colors group"
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <div className="text-left">
                  <p className="text-xs text-white/60 leading-none">Download on the</p>
                  <p className="text-base font-bold leading-tight">App Store</p>
                </div>
              </a>
              <a
                href="#"
                className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-forest-900 text-white hover:bg-forest-800 transition-colors"
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.628L15.392 12l2.306-2.491zM5.864 2.658L16.802 8.99l-2.302 2.301-8.636-8.633z" />
                </svg>
                <div className="text-left">
                  <p className="text-xs text-white/60 leading-none">Get it on</p>
                  <p className="text-base font-bold leading-tight">Google Play</p>
                </div>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
