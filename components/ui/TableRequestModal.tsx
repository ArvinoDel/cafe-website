'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellRing,
  Droplets,
  Sparkles,
  Receipt,
  X,
  Loader2,
  CheckCircle2,
  HelpCircle,
  Clock,
} from 'lucide-react';

export type RequestType = 'water' | 'tissue' | 'waiter' | 'bill';

interface TableRequestOption {
  type: RequestType;
  title: string;
  desc: string;
  icon: typeof Droplets;
  accentBg: string;
  accentColor: string;
}

const REQUEST_OPTIONS: TableRequestOption[] = [
  {
    type: 'water',
    title: 'Minta air putih',
    desc: 'Air mineral dingin/hangat',
    icon: Droplets,
    accentBg: 'bg-blue-50 hover:bg-blue-100/70 border-blue-200/70',
    accentColor: 'text-blue-700',
  },
  {
    type: 'tissue',
    title: 'Minta tisu',
    desc: 'Tisu tambahan ke meja',
    icon: Sparkles,
    accentBg: 'bg-amber-50 hover:bg-amber-100/70 border-amber-200/70',
    accentColor: 'text-amber-800',
  },
  {
    type: 'waiter',
    title: 'Panggil pelayan',
    desc: 'Bantuan barista di mejamu',
    icon: BellRing,
    accentBg: 'bg-coffee-50 hover:bg-coffee-100/70 border-coffee-200/70',
    accentColor: 'text-coffee-800',
  },
  {
    type: 'bill',
    title: 'Minta bill',
    desc: 'Cetak tagihan pembayaran',
    icon: Receipt,
    accentBg: 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-200/70',
    accentColor: 'text-emerald-800',
  },
];

const COOLDOWN_DURATION_MS = 120_000; // 2 minutes cooldown per request type

interface TableRequestModalProps {
  tableNumber: string | null;
  branchId?: string | null;
  orderCode?: string | null;
  positionClassName?: string;
}

export default function TableRequestModal({
  tableNumber,
  branchId,
  orderCode,
  positionClassName = 'bottom-6 left-4 sm:left-6',
}: TableRequestModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<RequestType | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<RequestType, number>>({
    water: 0,
    tissue: 0,
    waiter: 0,
    bill: 0,
  });
  const [, setTick] = useState(0);

  // Sync cooldowns from localStorage on mount
  useEffect(() => {
    const loaded: Record<RequestType, number> = { water: 0, tissue: 0, waiter: 0, bill: 0 };
    const types: RequestType[] = ['water', 'tissue', 'waiter', 'bill'];
    const now = Date.now();

    types.forEach((t) => {
      try {
        const raw = localStorage.getItem(`cafe-table-req-cooldown-${t}`);
        if (raw) {
          const val = parseInt(raw, 10);
          if (val > now) loaded[t] = val;
        }
      } catch {}
    });

    setCooldowns(loaded);
  }, []);

  // Timer to update remaining seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSendRequest = useCallback(
    async (type: RequestType) => {
      if (!tableNumber) return;
      const now = Date.now();
      if (cooldowns[type] > now) return;

      setLoadingType(type);
      try {
        const res = await fetch('/api/table-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: branchId || undefined,
            table_number: tableNumber,
            type,
            order_code: orderCode || undefined,
          }),
        });

        const data = await res.json();
        const expiresAt = Date.now() + COOLDOWN_DURATION_MS;

        // Set cooldown for 2 minutes
        setCooldowns((prev) => ({ ...prev, [type]: expiresAt }));
        try {
          localStorage.setItem(`cafe-table-req-cooldown-${type}`, String(expiresAt));
        } catch {}

        if (res.ok) {
          setToastMessage(data.message || 'Terkirim! Barista segera datang 🙌');
        } else {
          setToastMessage(data.error || 'Gagal mengirim permintaan. Coba lagi.');
        }
      } catch {
        setToastMessage('Koneksi bermasalah. Coba lagi.');
      } finally {
        setLoadingType(null);
      }
    },
    [tableNumber, branchId, orderCode, cooldowns],
  );

  // If table number is unknown, don't show the button
  if (!tableNumber) {
    return null;
  }

  const now = Date.now();

  return (
    <>
      {/* Floating Button "Butuh sesuatu?" */}
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className={`fixed z-30 flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 min-h-[40px] rounded-full bg-white/95 backdrop-blur-md text-coffee-900 border border-coffee-200/90 shadow-soft-lg hover:bg-coffee-50/90 transition-all text-xs font-extrabold ${positionClassName}`}
        title="Panggil barista atau minta air/tisu"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
        <HelpCircle className="w-4 h-4 text-coffee-700 flex-shrink-0" />
        <span className="truncate">Butuh sesuatu?</span>
      </motion.button>

      {/* Bottom Sheet Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />

            {/* Sheet content */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-soft-xl border border-coffee-100/80 z-10 max-h-[90vh] overflow-y-auto"
            >
              {/* Sheet handle bar (mobile) */}
              <div className="w-12 h-1.5 bg-coffee-200/60 rounded-full mx-auto mb-4 sm:hidden" />

              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-extrabold text-lg text-coffee-900 leading-tight">
                    Butuh Sesuatu di Meja {tableNumber}?
                  </h3>
                  <p className="text-xs text-charcoal/60 mt-1">
                    Pilih bantuan di bawah ini, barista kami akan segera melayani mejamu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-xl text-charcoal/40 hover:text-charcoal/80 hover:bg-coffee-50 transition-colors flex-shrink-0"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Notification Toast */}
              <AnimatePresence>
                {toastMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>{toastMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setToastMessage(null)}
                      className="text-emerald-700/60 hover:text-emerald-900"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 4 Big Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {REQUEST_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const cooldownUntil = cooldowns[opt.type];
                  const isCoolingDown = cooldownUntil > now;
                  const remainingSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
                  const isLoading = loadingType === opt.type;

                  return (
                    <button
                      key={opt.type}
                      type="button"
                      disabled={isCoolingDown || isLoading}
                      onClick={() => handleSendRequest(opt.type)}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${
                        opt.accentBg
                      } ${isCoolingDown ? 'bg-coffee-50/50 border-coffee-200/50' : 'shadow-2xs'}`}
                    >
                      <div className="w-11 h-11 rounded-2xl bg-white/90 shadow-2xs flex items-center justify-center mb-2.5">
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 text-coffee-700 animate-spin" />
                        ) : (
                          <Icon className={`w-5 h-5 ${opt.accentColor}`} />
                        )}
                      </div>
                      <span className="font-extrabold text-xs text-coffee-950 block leading-tight">
                        {opt.title}
                      </span>
                      <span className="text-[10px] text-charcoal/50 mt-1 block">
                        {isCoolingDown ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                            <Clock className="w-2.5 h-2.5" />
                            {remainingSec} dtk
                          </span>
                        ) : (
                          opt.desc
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Footer info */}
              <p className="text-[11px] text-charcoal/40 text-center mt-5">
                Barista menerima notifikasi langsung di sistem kasir.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
