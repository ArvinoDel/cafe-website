'use client';

/**
 * WifiInfoCard
 *
 * Direct, clean Wi-Fi credentials display shown directly under table information.
 * Erased all dropdowns / accordions.
 * Shows:
 * - Username : wifi_name (copyable)
 * - Password : wifi_password (with copy button)
 * - Opening hours (if available)
 *
 * Fetches from GET /api/branch-info?branch_id=<uuid>.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Clock, Copy, Check } from 'lucide-react';

type BranchInfo = {
  wifi_name: string | null;
  wifi_password: string | null;
  opening_hours: string | null;
};

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

interface WifiInfoCardProps {
  branchId?: string | null;
  className?: string;
  variant?: string; // Kept for backwards compatibility if callers pass it
}

export default function WifiInfoCard({ branchId, className = '' }: WifiInfoCardProps) {
  const [info, setInfo] = useState<BranchInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<'name' | 'password' | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let effectiveBranchId = branchId;
    if (!effectiveBranchId && typeof window !== 'undefined') {
      effectiveBranchId = localStorage.getItem('kopi-nako-branch');
    }

    if (!effectiveBranchId) {
      setInfo(null);
      return;
    }

    fetch(`/api/branch-info?branch_id=${encodeURIComponent(effectiveBranchId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BranchInfo | null) => {
        if (data && (data.wifi_name || data.wifi_password)) {
          setInfo(data);
        }
      })
      .catch(() => {
        /* fail silently */
      });
  }, [branchId]);

  const handleCopy = useCallback(async (text: string | null, key: 'name' | 'password') => {
    if (!text) return;
    try {
      await copyToClipboard(text);
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      /* ignore clipboard errors */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (!info || (!info.wifi_name && !info.wifi_password)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`w-full max-w-xs sm:max-w-sm mx-auto mt-3.5 p-3 rounded-2xl bg-coffee-50/70 border border-coffee-200/70 text-left shadow-2xs ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-coffee-200/50">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-coffee-900">
          <span className="p-1 rounded-md bg-coffee-100 text-coffee-800">
            <Wifi className="w-3.5 h-3.5" />
          </span>
          <span>Wi-Fi Cafe</span>
        </div>
        {info.opening_hours && (
          <div className="inline-flex items-center gap-1 text-[11px] text-charcoal/50 font-medium">
            <Clock className="w-3 h-3 text-charcoal/40" />
            <span>{info.opening_hours}</span>
          </div>
        )}
      </div>

      {/* Credentials list */}
      <div className="space-y-1.5 text-xs">
        {/* Username / SSID */}
        {info.wifi_name && (
          <div className="flex items-center justify-between gap-2 bg-white/90 px-2.5 py-1.5 rounded-xl border border-coffee-100/80">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-charcoal/50 uppercase tracking-wide flex-shrink-0">
                Username :
              </span>
              <span className="font-bold font-mono text-coffee-950 truncate select-all">
                {info.wifi_name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(info.wifi_name, 'name')}
              className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                copiedKey === 'name'
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-charcoal/40 hover:text-coffee-800 hover:bg-coffee-100/60'
              }`}
              title="Salin username Wi-Fi"
              aria-label="Salin username Wi-Fi"
            >
              {copiedKey === 'name' ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Password */}
        {info.wifi_password && (
          <div className="flex items-center justify-between gap-2 bg-white/90 px-2.5 py-1.5 rounded-xl border border-coffee-100/80">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-charcoal/50 uppercase tracking-wide flex-shrink-0">
                Password :
              </span>
              <span className="font-bold font-mono text-coffee-950 px-1.5 py-0.5 rounded bg-coffee-50 border border-coffee-200/50 select-all tracking-wide">
                {info.wifi_password}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(info.wifi_password, 'password')}
              className={`
                inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold
                transition-all duration-150 flex-shrink-0 active:scale-95
                ${
                  copiedKey === 'password'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-coffee-700 hover:bg-coffee-800 text-cream shadow-2xs'
                }
              `}
              title="Salin password Wi-Fi"
              aria-label="Salin password Wi-Fi"
            >
              {copiedKey === 'password' ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Salin</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
