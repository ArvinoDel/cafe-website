'use client';

import { motion } from 'framer-motion';
import { Download, ArrowRight, Star, Clock } from 'lucide-react';
import { fadeInUp, staggerContainer, slideInRight, scaleIn } from '@/lib/animations';

export default function Hero() {
  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center pt-20 pb-16 overflow-hidden bg-gradient-to-b from-forest-50/50 via-white to-white"
    >
      {/* Decorative background blobs */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-forest-200/30 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-sage-200/40 rounded-full blur-3xl -z-10" />

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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-forest-50 border border-forest-200 text-forest-700 text-sm font-medium mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-forest-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-forest-600" />
              </span>
              App-first coffee experience
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-forest-900 leading-[1.1] text-balance"
            >
              Specialty Coffee,
              <br />
              <span className="text-forest-600">One Click Away.</span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="mt-6 text-lg sm:text-xl text-charcoal/60 max-w-xl leading-relaxed"
            >
              Order ahead on our app. Grab your coffee without the queue.
              Farm-fresh, expertly brewed, ready when you arrive.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="mt-8 flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <a
                href="#download"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-forest-700 text-white font-semibold text-base hover:bg-forest-800 transition-all hover:shadow-soft-lg active:scale-95"
              >
                <Download className="w-5 h-5" />
                Download App
              </a>
              <a
                href="#menu"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white border-2 border-forest-200 text-forest-700 font-semibold text-base hover:border-forest-400 hover:bg-forest-50 transition-all active:scale-95"
              >
                Explore Menu
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
                      className="w-9 h-9 rounded-full border-2 border-white bg-gradient-to-br from-forest-300 to-forest-500 flex items-center justify-center text-white text-xs font-bold"
                    >
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-charcoal">200K+ downloads</p>
                  <p className="text-charcoal/50">Join the community</p>
                </div>
              </div>
              <div className="h-10 w-px bg-forest-100" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-forest-500 text-forest-500" />
                  ))}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-charcoal">4.9 rating</p>
                  <p className="text-charcoal/50">on App Store</p>
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
                  src="https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
                  alt="Premium specialty coffee latte"
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-900/20 to-transparent" />
              </motion.div>

              {/* Floating card 1: Order ahead */}
              <motion.div
                initial={{ opacity: 0, x: -30, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="absolute -left-2 sm:-left-6 top-1/4 bg-white/90 backdrop-blur-md rounded-2xl shadow-soft-lg p-4 border border-forest-100/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-forest-100">
                    <Clock className="w-5 h-5 text-forest-700" />
                  </div>
                  <div>
                    <p className="text-xs text-charcoal/50 font-medium">Ready in</p>
                    <p className="text-base font-bold text-forest-800">3 minutes</p>
                  </div>
                </div>
              </motion.div>

              {/* Floating card 2: Points */}
              <motion.div
                initial={{ opacity: 0, x: 30, y: -20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="absolute -right-2 sm:-right-6 bottom-1/4 bg-white/90 backdrop-blur-md rounded-2xl shadow-soft-lg p-4 border border-forest-100/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sage-100">
                    <Star className="w-5 h-5 text-sage-500 fill-sage-500" />
                  </div>
                  <div>
                    <p className="text-xs text-charcoal/50 font-medium">You earned</p>
                    <p className="text-base font-bold text-forest-800">+120 points</p>
                  </div>
                </div>
              </motion.div>

              {/* Decorative ring */}
              <div className="absolute -bottom-8 -left-8 w-32 h-32 border-2 border-forest-200/50 rounded-full -z-10" />
              <div className="absolute -top-6 -right-6 w-20 h-20 bg-sage-200/40 rounded-full blur-2xl -z-10" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
