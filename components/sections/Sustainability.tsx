'use client';

import { motion } from 'framer-motion';
import { Leaf, HandHeart, Recycle, Sprout } from 'lucide-react';
import {
  fadeInUp,
  staggerContainer,
  slideInLeft,
  slideInRight,
} from '@/lib/animations';

const commitments = [
  {
    icon: HandHeart,
    title: 'Direct Trade',
    desc: 'We pay above fair-trade prices, building lasting partnerships with farmers.',
  },
  {
    icon: Recycle,
    title: 'Eco Packaging',
    desc: '100% compostable cups and lids across every AURA location.',
  },
  {
    icon: Sprout,
    title: 'Carbon Neutral',
    desc: 'Every delivery is offset. We invest in reforestation at origin.',
  },
];

export default function Sustainability() {
  return (
    <section
      id="sustainability"
      className="py-20 sm:py-28 bg-forest-900 relative overflow-hidden"
    >
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-forest-700/50 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-forest-600/30 rounded-full blur-3xl" />
      <div className="absolute top-10 left-10 text-forest-800/40">
        <Leaf className="w-16 h-16" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Image */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={slideInLeft}
            className="relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-soft-xl aspect-[4/3]">
              <img
                src="https://images.pexels.com/photos/9535503/pexels-photo-9535503.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                alt="Sustainably sourced coffee beans"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-950/40 to-transparent" />
            </div>

            {/* Stats overlay */}
            <div className="absolute -bottom-6 -right-2 sm:right-6 bg-white rounded-2xl shadow-soft-lg p-5 sm:p-6">
              <p className="text-3xl sm:text-4xl font-extrabold text-forest-700">100%</p>
              <p className="text-sm text-charcoal/60 mt-1">Direct-trade beans</p>
            </div>
            <div className="absolute -top-4 -left-2 sm:left-6 bg-sage-300 rounded-2xl shadow-soft p-4 sm:p-5">
              <p className="text-2xl sm:text-3xl font-extrabold text-forest-900">12+</p>
              <p className="text-xs sm:text-sm text-forest-800/70 mt-1">Farms partnered</p>
            </div>
          </motion.div>

          {/* Right: Copy */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
          >
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-forest-800 border border-forest-700 text-sage-300 text-sm font-medium mb-5"
            >
              <Leaf className="w-4 h-4" />
              Our Commitment
            </motion.div>

            <motion.h2
              variants={fadeInUp}
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight text-balance leading-[1.15]"
            >
              Coffee that cares
              <br />
              <span className="text-sage-300">for the planet.</span>
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-5 text-lg text-white/60 leading-relaxed max-w-lg"
            >
              From farm to cup, sustainability isn&apos;t an afterthought —
              it&apos;s the foundation of everything we do. We partner directly
              with growers, eliminate waste, and reinvest in the land that
              gives us our craft.
            </motion.p>

            {/* Commitment items */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 space-y-5"
            >
              {commitments.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 group"
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-forest-800 border border-forest-700 text-sage-300 flex-shrink-0 transition-colors group-hover:bg-sage-300 group-hover:text-forest-900">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">{item.title}</p>
                      <p className="text-white/50 text-sm leading-relaxed mt-0.5">
                        {item.desc}
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
