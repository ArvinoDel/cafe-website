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
  Company: ['About Us', 'Our Stores', 'Careers', 'Press'],
  Menu: ['Coffee', 'Tea & Matcha', 'Food', 'Seasonal'],
  App: ['Download iOS', 'Download Android', 'Aura Rewards', 'Gift Cards'],
  Support: ['Help Center', 'Contact Us', 'Privacy Policy', 'Terms of Service'],
};

const socials = [
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Facebook, href: '#', label: 'Facebook' },
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
    <footer className="bg-forest-950 text-white pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top section */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid lg:grid-cols-5 gap-12 pb-16 border-b border-forest-800/60"
        >
          {/* Brand + Newsletter */}
          <motion.div variants={fadeInUp} className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-forest-700">
                <Coffee className="w-5 h-5" />
              </div>
              <span className="text-xl font-extrabold">AURA</span>
              <span className="text-xl font-light text-forest-400">Coffee</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed max-w-sm mb-6">
              Specialty coffee, one click away. Order ahead, earn rewards, and
              support sustainable farming — all from the AURA app.
            </p>

            {/* Newsletter */}
            <div>
              <p className="text-sm font-semibold text-white mb-3">
                Get the latest from AURA
              </p>
              <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-forest-900 border border-forest-800 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-sage-400 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="flex items-center justify-center px-4 py-3 rounded-xl bg-forest-600 hover:bg-forest-500 text-white transition-colors active:scale-95"
                  aria-label="Subscribe"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
              {submitted && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-sage-300"
                >
                  Thanks for subscribing!
                </motion.p>
              )}
            </div>
          </motion.div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <motion.div key={category} variants={fadeInUp}>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-white/50 hover:text-sage-300 transition-colors"
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
          <p className="text-sm text-white/40 text-center sm:text-left">
            © {new Date().getFullYear()} AURA Coffee. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {socials.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-forest-900 border border-forest-800 text-white/60 hover:bg-forest-700 hover:text-white hover:border-forest-600 transition-all active:scale-90"
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
