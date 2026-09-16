'use client';

import { motion } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

const stores = [
  { city: 'Jakarta', count: '18 outlet', area: 'Ciracas · Tanjung Duren · PGC' },
  { city: 'Bogor', count: '8 outlet', area: 'Pajajaran · Baranangsiang · Sentul' },
  { city: 'Tangerang', count: '10 outlet', area: 'Pondok Aren · Alam Sutera · BSD' },
  { city: 'Bandung', count: '6 outlet', area: 'Dago · Riau · Setiabudi' },
  { city: 'Surabaya', count: '5 outlet', area: 'Tunjungan · Gubeng · Darmo' },
  { city: 'Yogyakarta', count: '4 outlet', area: 'Malioboro · Sleman · Gejayan' },
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
            className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
          >
            Cari Kami
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
          >
            Nako dekat kamu
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            50+ outlet se-Indonesia. Scan barcode di meja, pesan tanpa antri,
            nikmati kesukaanmu.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {stores.map((store) => (
            <motion.div
              key={store.city}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="group bg-white rounded-2xl p-6 border border-coffee-100/80 hover:shadow-soft-lg transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-coffee-50 text-coffee-700 group-hover:bg-coffee-700 group-hover:text-cream transition-colors">
                  <MapPin className="w-6 h-6" />
                </div>
                <Navigation className="w-5 h-5 text-coffee-300 group-hover:text-coffee-600 transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-coffee-900">{store.city}</h3>
              <p className="text-sm text-coffee-600 font-medium mt-1">{store.count}</p>
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
