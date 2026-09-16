'use client';

import { motion } from 'framer-motion';
import { QrCode, Clock, UtensilsCrossed } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

const features = [
  {
    icon: QrCode,
    title: 'Scan Barcode',
    description:
      'Setiap meja punya barcode. Scan dengan HP-mu, lihat menu lengkap, dan pesan langsung tanpa panggil waiter.',
  },
  {
    icon: Clock,
    title: 'Tanpa Antri',
    description:
      'Pesan dari meja, kopi datang ke meja. Ngopi tanpa antrian, tanpa ribet — #sobatnakogariskeras.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Nasi & Kopi',
    description:
      'Dari nasi campur khas Indonesia sampai es kopi susu creamy. Semua dalam satu konsep kedai kekinian.',
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
            className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
          >
            Kenapa Nako
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight text-balance"
          >
            Ngopi kekinian, cara kekinian
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            Kami gabungkan kopi specialty, makanan Indonesia, dan teknologi
            self-service — bikin ngopi jadi lebih gampang dan lebih asyik.
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
