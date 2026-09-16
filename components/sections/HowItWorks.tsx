'use client';

import { motion } from 'framer-motion';
import { QrCode, ListOrdered, Coffee } from 'lucide-react';
import {
  fadeInUp,
  staggerContainer,
  slideInLeft,
  slideInRight,
} from '@/lib/animations';

const steps = [
  {
    icon: QrCode,
    num: '01',
    title: 'Scan Barcode',
    desc: 'Buka kamera HP, scan barcode yang ada di setiap meja. Menu lengkap langsung muncul di layar-mu.',
  },
  {
    icon: ListOrdered,
    num: '02',
    title: 'Pilih & Pesan',
    desc: 'Pilih kopi, nasi, atau snack favoritmu. Custom sesuai selera, bayar langsung dari HP — gampang.',
  },
  {
    icon: Coffee,
    num: '03',
    title: 'Nikmati',
    desc: 'Pesananmu langsung dibuat barista. Tinggal tunggu di meja, kopi dan makanan datang sendiri.',
  },
];

export default function HowItWorks() {
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
                    <span>NAKO</span>
                  </div>

                  {/* Table indicator */}
                  <div className="mx-4 mt-4 bg-cream/10 backdrop-blur-md rounded-2xl p-4 border border-cream/15 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sand-300/30 flex items-center justify-center">
                      <QrCode className="w-5 h-5 text-sand-200" />
                    </div>
                    <div>
                      <p className="text-cream/60 text-xs">Meja</p>
                      <p className="text-cream text-lg font-bold">A-12</p>
                    </div>
                    <div className="ml-auto px-3 py-1 rounded-lg bg-green-400/20 text-green-300 text-xs font-medium">
                      Aktif
                    </div>
                  </div>

                  {/* Menu preview */}
                  <div className="mx-4 mt-3 bg-cream rounded-2xl p-4 flex-1 flex flex-col">
                    <p className="text-coffee-800 text-sm font-bold mb-3">
                      Menu Pilihan
                    </p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-coffee-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          src="https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                          alt="Es Kopi Susu"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-charcoal truncate">
                          Es Kopi Susu Nako
                        </p>
                        <p className="text-xs text-charcoal/50">Iced · Less Ice</p>
                      </div>
                      <p className="text-sm font-bold text-coffee-700">27K</p>
                    </div>
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-coffee-50">
                      <div className="w-12 h-12 rounded-xl bg-sand-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          src="https://images.pexels.com/photos/37081060/pexels-photo-37081060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                          alt="Nasi Campur"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-charcoal truncate">
                          Nasi Campur Nako
                        </p>
                        <p className="text-xs text-charcoal/50">Pedas Sedang</p>
                      </div>
                      <p className="text-sm font-bold text-coffee-700">28K</p>
                    </div>
                    <div className="mt-auto">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-charcoal/50">Total</span>
                        <span className="text-lg font-extrabold text-coffee-800">
                          Rp 55.000
                        </span>
                      </div>
                      <button className="w-full py-3 rounded-xl bg-coffee-700 text-cream text-sm font-bold">
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
              Cara Pesan
            </motion.span>

            <motion.h2
              variants={fadeInUp}
              className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight text-balance leading-[1.15]"
            >
              Tiga langkah,
              <br />
              <span className="text-coffee-600">kopi tanpa antri.</span>
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-5 text-lg text-charcoal/60 leading-relaxed max-w-lg"
            >
              Gak perlu antri, gak perlu panggil waiter. Cukup scan barcode
              di meja, pilih menu, dan duduk manis sambil nunggu pesanan
              datang.
            </motion.p>

            {/* Steps */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 space-y-6"
            >
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.num} className="flex items-start gap-5 group">
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
