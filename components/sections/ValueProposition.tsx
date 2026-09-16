'use client';

import { motion } from 'framer-motion';
import { Clock, Bike, Leaf } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

const features = [
  {
    icon: Clock,
    title: 'Order Ahead',
    description:
      'Skip the line. Place your order on the app and pick it up freshly brewed — no waiting, no stress.',
    color: 'forest',
  },
  {
    icon: Bike,
    title: 'Fast Delivery',
    description:
      'Craving coffee at home or the office? Get your favorite drinks delivered hot in under 30 minutes.',
    color: 'sage',
  },
  {
    icon: Leaf,
    title: 'Sustainable',
    description:
      'Every cup supports direct-trade farmers and eco-friendly packaging. Great coffee that gives back.',
    color: 'forest',
  },
];

export default function ValueProposition() {
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
            className="text-sm font-semibold text-forest-600 uppercase tracking-wider"
          >
            Why AURA
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-forest-900 tracking-tight text-balance"
          >
            Built for the way you coffee
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            We blend technology and craft to bring you a seamless,
            sustainable coffee experience — every single day.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid md:grid-cols-3 gap-6 lg:gap-8"
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={fadeInUp}
                whileHover={{ y: -6 }}
                className="group relative bg-white rounded-2xl p-8 border border-forest-100/80 hover:border-forest-200 hover:shadow-soft-lg transition-all duration-300"
              >
                <div
                  className={`flex items-center justify-center w-14 h-14 rounded-2xl mb-6 transition-transform group-hover:scale-110 ${
                    feature.color === 'forest'
                      ? 'bg-forest-700 text-white'
                      : 'bg-sage-100 text-sage-500'
                  }`}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-forest-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-charcoal/60 leading-relaxed">
                  {feature.description}
                </p>
                <div className="absolute bottom-0 left-8 right-8 h-0.5 bg-gradient-to-r from-forest-400 to-sage-300 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
