'use client';

import { motion } from 'framer-motion';
import { Sprout, HandHeart, Globe2 } from 'lucide-react';
import {
  fadeInUp,
  staggerContainer,
  slideInLeft,
  slideInRight,
} from '@/lib/animations';

const commitments = [
  {
    icon: Sprout,
    title: '100% Biji Indonesia',
    desc: 'Kami pakai biji kopi dari petani lokal Indonesia, masing-masing blended sesuai profil rasanya.',
  },
  {
    icon: HandHeart,
    title: 'Dukung Petani Lokal',
    desc: 'Setiap cangkir kopi mendukung petani kopi Indonesia. Hubungan langsung, harga yang adil.',
  },
  {
    icon: Globe2,
    title: 'Konsep Ramah Lingkungan',
    desc: 'Bangunan kaca dengan pencahayaan alami, mengurangi energi. Packaging yang lebih bijak.',
  },
];

export default function LocalRoots() {
  return (
    <section
      id="story"
      className="py-20 sm:py-28 bg-coffee-900 relative overflow-hidden"
    >
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-coffee-700/50 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-coffee-600/30 rounded-full blur-3xl" />

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
                alt='Biji kopi Indonesia pilihan'
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-coffee-950/40 to-transparent" />
            </div>

            {/* Stats overlay */}
            <div className="absolute -bottom-6 -right-2 sm:right-6 bg-white rounded-2xl shadow-soft-lg p-5 sm:p-6">
              <p className="text-3xl sm:text-4xl font-extrabold text-coffee-700">100%</p>
              <p className="text-sm text-charcoal/60 mt-1">Biji Indonesia</p>
            </div>
            <div className="absolute -top-4 -left-2 sm:left-6 bg-sand-300 rounded-2xl shadow-soft p-4 sm:p-5">
              <p className="text-2xl sm:text-3xl font-extrabold text-coffee-900">50+</p>
              <p className="text-xs sm:text-sm text-coffee-800/70 mt-1">Outlet nasional</p>
            </div>
          </motion.div>

          {/* Right: Copy */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
          >
            <motion.span
              variants={fadeInUp}
              className="text-sm font-semibold text-sand-300 uppercase tracking-wider"
            >
              Cerita Kami
            </motion.span>

            <motion.h2
              variants={fadeInUp}
              className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight text-balance leading-[1.15]"
            >
              Dari warung nasi
              <br />
              <span className="text-sand-300">jadi kedai kopi kekinian.</span>
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-5 text-lg text-white/60 leading-relaxed max-w-lg"
            >
              NaKo singkatan dari Nasi-Kopi. Berawal dari warung nasi kecil
              di Bogor, sekarang kami hadir di 50+ outlet se-Indonesia.
              Tetap pakai biji kopi Indonesia, tetap mendukung petani lokal.
            </motion.p>

            {/* Commitment items */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 space-y-5"
            >
              {commitments.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-4 group">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-coffee-800 border border-coffee-700 text-sand-300 flex-shrink-0 transition-colors group-hover:bg-sand-300 group-hover:text-coffee-900">
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
