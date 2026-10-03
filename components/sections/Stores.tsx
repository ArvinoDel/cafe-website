'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Clock, ExternalLink } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { useBranchInfo } from '@/lib/branch-info';

// ── Types ─────────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  address: string | null;
  opening_hours?: string | null;
  maps_url?: string | null;
};

// ── Client-hydrated live badge ────────────────────────────────────────────────

function BranchLiveBadge({
  branchId,
  className = '',
}: {
  branchId: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { info, loading, error } = useBranchInfo(branchId);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Return null during loading, on error, or before client hydration (no layout jump)
  if (!mounted || loading || error || !info) {
    return null;
  }

  const isAccepting = info.accepting_orders !== false;
  const waitMinutes = info.est_wait_now;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {isAccepting ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Menerima pesanan
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-xs"
          title={info.pause_message || undefined}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Pemesanan dijeda
        </span>
      )}

      {isAccepting && waitMinutes !== null && waitMinutes !== undefined && waitMinutes > 0 ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-coffee-50 text-coffee-700 border border-coffee-200/60">
          <Clock className="w-3 h-3 text-coffee-500" />
          Perkiraan tunggu ±{waitMinutes} menit
        </span>
      ) : null}
    </div>
  );
}

// ── Single-location card (renders when exactly 1 branch exists) ──────────────

function SingleLocationCard({ branch }: { branch: Branch }) {
  return (
    <section id="stores" className="py-20 sm:py-28 bg-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <motion.span
            variants={fadeInUp}
            className="text-sm font-semibold text-coffee-600 uppercase tracking-wider"
          >
            Lokasi Kami
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
          >
            Kunjungi Kami
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            Nikmati kopi nikmat dan makanan segar — pesan langsung dari mejamu.
          </motion.p>
        </motion.div>

        {/* Single location highlight card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-lg mx-auto bg-white rounded-3xl border border-coffee-100/80 shadow-soft-xl p-8 text-center"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-coffee-50 text-coffee-700 mx-auto mb-4">
            <MapPin className="w-8 h-8" />
          </div>

          <BranchLiveBadge branchId={branch.id} className="justify-center mb-3" />

          <h3 className="text-2xl font-extrabold text-coffee-900 text-center mb-2">
            {branch.name}
          </h3>

          {branch.address && (
            <p className="text-charcoal/60 text-center leading-relaxed mb-4">
              {branch.address}
            </p>
          )}

          {branch.opening_hours && (
            <div className="flex items-center justify-center gap-2 text-charcoal/50 text-sm mb-6">
              <Clock className="w-4 h-4" />
              <span>{branch.opening_hours}</span>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <a
              href="/menu"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-coffee-700 text-cream font-semibold text-sm hover:bg-coffee-800 transition-all hover:shadow-soft active:scale-95"
            >
              Pesan Sekarang
            </a>
            {branch.maps_url && (
              <a
                href={branch.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border border-coffee-200 text-coffee-700 font-semibold text-sm hover:bg-coffee-50 transition-all active:scale-95"
              >
                Petunjuk Arah
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Multi-location grid (renders when 2+ branches exist) ────────────────────

function MultiLocationGrid({ branches }: { branches: Branch[] }) {
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
            Lokasi Kami
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
          >
            Temukan Cabang Kami
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            {branches.length} cabang dengan kopi dan makanan segar yang sama.
            Scan QR di mejamu dan pesan tanpa perlu antre.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {branches.map((branch) => (
            <motion.div
              key={branch.id}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="group bg-white rounded-2xl p-6 border border-coffee-100/80 hover:shadow-soft-lg transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-coffee-50 text-coffee-700 group-hover:bg-coffee-700 group-hover:text-cream transition-colors">
                    <MapPin className="w-6 h-6" />
                  </div>
                  {branch.maps_url ? (
                    <a
                      href={branch.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Petunjuk arah ke ${branch.name}`}
                    >
                      <Navigation className="w-5 h-5 text-coffee-300 hover:text-coffee-600 transition-colors" />
                    </a>
                  ) : (
                    <Navigation className="w-5 h-5 text-coffee-200" />
                  )}
                </div>

                <BranchLiveBadge branchId={branch.id} className="mb-2.5" />

                <h3 className="text-lg font-bold text-coffee-900">{branch.name}</h3>
                {branch.address && (
                  <p className="text-sm text-charcoal/50 mt-2 leading-relaxed">
                    {branch.address}
                  </p>
                )}
              </div>

              {branch.opening_hours && (
                <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-coffee-50 text-xs text-charcoal/40">
                  <Clock className="w-3.5 h-3.5 text-coffee-400" />
                  <span>{branch.opening_hours}</span>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Fallback (no branches in DB yet — placeholder skeleton) ──────────────────

function NoLocationsPlaceholder() {
  return (
    <section id="stores" className="py-20 sm:py-28 bg-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <MapPin className="w-12 h-12 text-coffee-200 mx-auto mb-4" />
        <p className="text-charcoal/40 text-lg">Informasi lokasi akan segera hadir.</p>
      </div>
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Stores({ branches }: { branches: Branch[] }) {
  if (branches.length === 0) return <NoLocationsPlaceholder />;
  if (branches.length === 1) return <SingleLocationCard branch={branches[0]} />;
  return <MultiLocationGrid branches={branches} />;
}
