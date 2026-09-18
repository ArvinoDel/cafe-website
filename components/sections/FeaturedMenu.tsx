'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

// Neutral placeholder items — replaced by DB-driven featured items in Phase 2
const menuItems = [
  {
    name: 'Signature Latte',
    description: 'Our house espresso with steamed milk and a touch of house-made syrup.',
    price: '$5.50',
    image:
      'https://images.pexels.com/photos/38523136/pexels-photo-38523136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'Bestseller',
  },
  {
    name: 'Cold Brew Tonic',
    description: 'Smooth cold brew over tonic water with a citrus twist. Refreshingly bold.',
    price: '$6.00',
    image:
      'https://images.pexels.com/photos/4913342/pexels-photo-4913342.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: null,
  },
  {
    name: 'Chicken Rice Bowl',
    description: 'Tender chicken over steamed rice with house sauce, greens, and a soft egg.',
    price: '$8.90',
    image:
      'https://images.pexels.com/photos/37081060/pexels-photo-37081060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'Bestseller',
  },
  {
    name: 'Mango Lassi',
    description: 'Creamy yoghurt blended with real mango. Sweet, tangy, and refreshing.',
    price: '$4.50',
    image:
      'https://images.pexels.com/photos/8330286/pexels-photo-8330286.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    badge: 'New',
  },
];

export default function FeaturedMenu() {
  return (
    <section id="menu-preview" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <motion.span
              variants={fadeInUp}
              className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
            >
              Customer Favourites
            </motion.span>
            <motion.h2
              variants={fadeInUp}
              className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
            >
              Most loved picks
            </motion.h2>
          </div>
          <motion.a
            variants={fadeInUp}
            href="/menu"
            className="text-coffee-700 font-semibold text-sm hover:text-coffee-800 transition-colors inline-flex items-center gap-1 group"
          >
            View full menu
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </motion.a>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {menuItems.map((item) => (
            <motion.div
              key={item.name}
              variants={fadeInUp}
              whileHover={{ y: -8 }}
              className="group bg-white rounded-2xl overflow-hidden border border-coffee-100/80 hover:shadow-soft-lg transition-shadow duration-300 cursor-pointer"
            >
              {/* Image */}
              <div className="relative aspect-[4/5] overflow-hidden bg-coffee-50">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
                {item.badge && (
                  <span
                    className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
                      item.badge === 'Bestseller'
                        ? 'bg-coffee-700 text-cream'
                        : 'bg-sand-300 text-coffee-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-5">
                <h3 className="font-bold text-coffee-900 text-base leading-snug mb-1">
                  {item.name}
                </h3>
                <p className="text-sm text-charcoal/50 leading-relaxed mb-4 line-clamp-2">
                  {item.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold text-coffee-700">
                    {item.price}
                  </span>
                  <button className="flex items-center justify-center w-9 h-9 rounded-xl bg-coffee-50 text-coffee-700 hover:bg-coffee-700 hover:text-cream transition-all active:scale-90 group-hover:bg-coffee-700 group-hover:text-cream">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
