'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Coffee,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  Mail,
  ArrowRight,
} from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

const footerLinks = {
  Brand: ['About Us', 'Our Stores', 'Careers', 'Press'],
  Menu: ['Kopi', 'Non-Kopi', 'Makanan', 'Snack'],
  'Self Service': ['How It Works', 'Scan Barcode', 'Download App', 'Gift Cards'],
  Support: ['Help Center', 'Contact Us', 'Privacy Policy', 'Terms of Service'],
};

const socials = [
  { icon: Instagram, href: 'https://www.instagram.com/kopinako.id', label: 'Instagram' },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Facebook, href: 'https://www.facebook.com/Kopinako', label: 'Facebook' },
  { icon: Youtube, href: '#', label: 'Youtube' },
];

export default function Footer() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      setEmail('');
      setTimeout(() => setSubmitted(false), 3000);
    }
  };

  return (
    <footer className="bg-coffee-950 text-cream pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top section */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid lg:grid-cols-5 gap-12 pb-16 border-b border-coffee-800/60"
        >
          {/* Brand + Newsletter */}
          <motion.div variants={fadeInUp} className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-700">
                <Coffee className="w-5 h-5" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-extrabold">KOPI</span>
                <span className="text-xs font-medium tracking-[0.2em] text-coffee-400 uppercase">
                  Nako
                </span>
              </div>
            </div>
            <p className="text-cream/50 text-sm leading-relaxed max-w-sm mb-6">
              Siang makan nasi, kalau malam minum kopi. Scan barcode di meja,
              pesan tanpa antri. #sobatnakogariskeras
            </p>

            {/* Newsletter */}
            <div>
              <p className="text-sm font-semibold text-cream mb-3">
                Dapat info terbaru dari Nako
              </p>
              <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@kamu.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-coffee-900 border border-coffee-800 text-cream text-sm placeholder:text-cream/30 focus:outline-none focus:border-sand-300 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="flex items-center justify-center px-4 py-3 rounded-xl bg-coffee-600 hover:bg-coffee-500 text-cream transition-colors active:scale-95"
                  aria-label="Subscribe"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
              {submitted && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-sand-300"
                >
                  Makasih sudah subscribe!
                </motion.p>
              )}
            </div>
          </motion.div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <motion.div key={category} variants={fadeInUp}>
              <h4 className="text-sm font-bold text-cream uppercase tracking-wider mb-4">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-cream/50 hover:text-sand-300 transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-sm text-cream/40 text-center sm:text-left">
            © {new Date().getFullYear()} Kopi Nako. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {socials.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-900 border border-coffee-800 text-cream/60 hover:bg-coffee-700 hover:text-cream hover:border-coffee-600 transition-all active:scale-90"
                >
                  <Icon className="w-5 h-5" />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
