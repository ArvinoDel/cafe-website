'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Download, Coffee } from 'lucide-react';
import { fadeInUp } from '@/lib/animations';

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Menu', href: '#menu' },
  { label: 'Stores', href: '#stores' },
  { label: 'Sustainability', href: '#sustainability' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-xl shadow-soft border-b border-forest-100/60'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <a href="#home" className="flex items-center gap-2 group">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-forest-700 text-white transition-transform group-hover:scale-105">
              <Coffee className="w-5 h-5" />
            </div>
            <span
              className={`text-lg sm:text-xl font-extrabold tracking-tight transition-colors ${
                scrolled ? 'text-forest-800' : 'text-forest-800'
              }`}
            >
              AURA
            </span>
            <span
              className={`text-lg sm:text-xl font-light tracking-wide transition-colors ${
                scrolled ? 'text-forest-500' : 'text-forest-500'
              }`}
            >
              Coffee
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-charcoal/70 hover:text-forest-700 transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-forest-600 transition-all group-hover:w-full rounded-full" />
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:block">
            <a
              href="#download"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-forest-700 text-white text-sm font-semibold hover:bg-forest-800 transition-all hover:shadow-soft-lg active:scale-95"
            >
              <Download className="w-4 h-4" />
              Download App
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-forest-800 hover:bg-forest-50 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-white/95 backdrop-blur-xl border-t border-forest-100 overflow-hidden"
        >
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 rounded-lg text-charcoal/80 hover:bg-forest-50 hover:text-forest-700 font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#download"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 mt-2 px-4 py-3 rounded-xl bg-forest-700 text-white font-semibold"
            >
              <Download className="w-4 h-4" />
              Download App
            </a>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
