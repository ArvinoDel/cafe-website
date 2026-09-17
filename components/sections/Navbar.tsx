'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Menu, X, QrCode, Coffee, Camera } from 'lucide-react';
import QrScannerModal from '@/components/ui/QrScannerModal';

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Menu', href: '/menu' },
  { label: 'Stores', href: '#stores' },
  { label: 'Our Story', href: '#story' },
];

export default function Navbar() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScanSuccess = (table: string, branchId: string | null) => {
    localStorage.setItem('kopi-nako-table', table);
    if (branchId) localStorage.setItem('kopi-nako-branch', branchId);
    const url = branchId ? `/menu?table=${table}&branch=${branchId}` : `/menu?table=${table}`;
    router.push(url);
  };

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-cream/80 backdrop-blur-xl shadow-soft border-b border-coffee-100/60'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <a href="#home" className="flex items-center gap-2 group">
              <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-coffee-700 text-cream transition-transform group-hover:scale-105">
                <Coffee className="w-5 h-5" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-lg sm:text-xl font-extrabold tracking-tight text-coffee-900">
                  KOPI
                </span>
                <span className="text-[10px] sm:text-xs font-medium tracking-[0.2em] text-coffee-500 uppercase">
                  Nako
                </span>
              </div>
            </a>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-charcoal/70 hover:text-coffee-700 transition-colors relative group"
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-coffee-600 transition-all group-hover:w-full rounded-full" />
                </a>
              ))}
            </div>

            {/* CTA */}
            <div className="hidden md:block">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coffee-700 text-cream text-sm font-semibold hover:bg-coffee-800 transition-all hover:shadow-soft-lg active:scale-95"
              >
                <Camera className="w-4 h-4" />
                Scan to Order
              </button>
            </div>

            {/* Mobile toggle */}
            <button
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-coffee-800 hover:bg-coffee-50 transition-colors"
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
            className="md:hidden bg-cream/95 backdrop-blur-xl border-t border-coffee-100 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 rounded-lg text-charcoal/80 hover:bg-coffee-50 hover:text-coffee-700 font-medium transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setScannerOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 mt-2 px-4 py-3 rounded-xl bg-coffee-700 text-cream font-semibold"
              >
                <Camera className="w-4 h-4" />
                Scan to Order
              </button>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
