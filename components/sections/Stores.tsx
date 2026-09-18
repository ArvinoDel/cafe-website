'use client';

import { motion } from 'framer-motion';
import { MapPin, Navigation, Clock, ExternalLink } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

// ── Types ─────────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  address: string | null;
  opening_hours?: string | null;
  maps_url?: string | null;
};

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
            Find Us
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
          >
            Visit Us
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            Come in and experience great coffee and fresh food — order straight from your table.
          </motion.p>
        </motion.div>

        {/* Single location highlight card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-lg mx-auto bg-white rounded-3xl border border-coffee-100/80 shadow-soft-xl p-8"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-coffee-50 text-coffee-700 mx-auto mb-6">
            <MapPin className="w-8 h-8" />
          </div>

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
              Order Now
            </a>
            {branch.maps_url && (
              <a
                href={branch.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border border-coffee-200 text-coffee-700 font-semibold text-sm hover:bg-coffee-50 transition-all active:scale-95"
              >
                Get Directions
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
            Find Us
          </motion.span>
          <motion.h2
            variants={fadeInUp}
            className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight"
          >
            A location near you
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="mt-4 text-lg text-charcoal/60"
          >
            {branches.length} locations, all with the same great coffee and food.
            Scan the QR at your table and order without the wait.
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
              className="group bg-white rounded-2xl p-6 border border-coffee-100/80 hover:shadow-soft-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-coffee-50 text-coffee-700 group-hover:bg-coffee-700 group-hover:text-cream transition-colors">
                  <MapPin className="w-6 h-6" />
                </div>
                {branch.maps_url ? (
                  <a
                    href={branch.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Directions to ${branch.name}`}
                  >
                    <Navigation className="w-5 h-5 text-coffee-300 hover:text-coffee-600 transition-colors" />
                  </a>
                ) : (
                  <Navigation className="w-5 h-5 text-coffee-200" />
                )}
              </div>
              <h3 className="text-lg font-bold text-coffee-900">{branch.name}</h3>
              {branch.address && (
                <p className="text-sm text-charcoal/50 mt-2 leading-relaxed">
                  {branch.address}
                </p>
              )}
              {branch.opening_hours && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-charcoal/40">
                  <Clock className="w-3.5 h-3.5" />
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
        <p className="text-charcoal/40 text-lg">Location information coming soon.</p>
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
