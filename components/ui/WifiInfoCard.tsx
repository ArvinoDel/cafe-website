'use client';

/**
 * WifiInfoCard
 *
 * A collapsible card displayed on /menu and /status/[code] that shows:
 * - Wi-Fi SSID + a "Salin password" button (uses navigator.clipboard with textarea fallback)
 * - Opening hours
 *
 * Fetches from GET /api/branch-info?branch_id=<uuid>.
 * The component is fully self-contained: pass `branchId` and let it handle
 * loading, null state, and clipboard state.
 *
 * Returns null when:
 *   - branchId is not provided
 *   - the branch has no wifi_name configured (no unnecessary API call in that case)
 *   - the fetch fails silently
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Clock, ChevronDown, Copy, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BranchInfo = {
  wifi_name: string | null;
  wifi_password: string | null;
  opening_hours: string | null;
};

// ─── Clipboard helper (navigator.clipboard + textarea fallback) ───────────────

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older or insecure-context browsers
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WifiInfoCardProps {
  branchId: string | null;
}

export default function WifiInfoCard({ branchId }: WifiInfoCardProps) {
  const [info, setInfo] = useState<BranchInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch branch info only when we have a branchId
  useEffect(() => {
    if (!branchId) return;

    const url = `/api/branch-info?branch_id=${encodeURIComponent(branchId)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BranchInfo | null) => {
        if (data) setInfo(data);
      })
      .catch(() => {
        /* fail silently — card simply won't render */
      });
  }, [branchId]);

  // Auto-dismiss "copied" indicator after 2 seconds
  const handleCopy = useCallback(async () => {
    if (!info?.wifi_password) return;
    try {
      await copyToClipboard(info.wifi_password);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard errors */
    }
  }, [info?.wifi_password]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Only render when there is at least a wifi_name
  if (!info || !info.wifi_name) return null;

  const hasHours = Boolean(info.opening_hours);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.4, 0.25, 1] }}
      className="rounded-2xl border border-blue-100 bg-blue-50/60 overflow-hidden"
    >
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
        aria-controls="wifi-info-body"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-blue-800">
          <Wifi className="w-4 h-4 flex-shrink-0" />
          Wi-Fi &amp; Jam Buka
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-blue-500"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="wifi-info-body"
            key="wifi-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Wi-Fi row */}
              <div className="bg-white rounded-xl px-4 py-3 flex items-center justify-between gap-3 border border-blue-100">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-charcoal/40 uppercase tracking-wide mb-0.5">
                    Nama Jaringan
                  </p>
                  <p className="text-sm font-bold text-charcoal truncate">{info.wifi_name}</p>
                  {info.wifi_password && (
                    <p className="text-xs text-charcoal/50 mt-0.5 font-mono">
                      {info.wifi_password}
                    </p>
                  )}
                </div>
                {info.wifi_password && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                      transition-all duration-200 flex-shrink-0
                      ${copied
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200 active:scale-95'
                      }
                    `}
                    aria-label="Salin password Wi-Fi"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin password</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Opening hours row */}
              {hasHours && (
                <div className="flex items-start gap-2 px-1">
                  <Clock className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-charcoal/70">{info.opening_hours}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
