'use client';

import { motion } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

const stores = [
  { city: 'Jakarta', count: '24 stores', area: 'SCBD · Senayan · Kemang' },
  { city: 'Surabaya', count: '12 stores', area: 'Tunjungan · Gubeng · West' },
  { city: 'Bandung', count: '8 stores', area: 'Dago · Riau · Cihampelas' },
  { city: 'Bali', count: '6 stores', area: 'Seminyak · Canggu · Ubud' },
];

export default function Stores() {
  return (
    <section id="stores" className="py-20 sm:py-28 bg-cream">
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
            Find Us
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-forest-900 tracking-tight"
          >
            AURA near you
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            50+ stores and counting. Order ahead and grab your coffee
            on the go — no queue, no wait.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {stores.map((store) => (
            <motion.div
              key={store.city}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="group bg-white rounded-2xl p-6 border border-forest-100/80 hover:shadow-soft-lg transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-forest-50 text-forest-700 group-hover:bg-forest-700 group-hover:text-white transition-colors">
                  <MapPin className="w-6 h-6" />
                </div>
                <Navigation className="w-5 h-5 text-forest-300 group-hover:text-forest-600 transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-forest-900">{store.city}</h3>
              <p className="text-sm text-forest-600 font-medium mt-1">{store.count}</p>
              <p className="text-sm text-charcoal/50 mt-2 leading-relaxed">
                {store.area}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
