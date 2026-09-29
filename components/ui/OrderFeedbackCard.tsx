'use client';

/**
 * OrderFeedbackCard
 *
 * Shown on /status/[code] when order.status === 'completed'.
 * Displays a 3-emoji rating prompt. After a tap it expands into an optional
 * comment field + submit button, then shows a warm thank-you message.
 *
 * Persistence: writes to localStorage key `cafe-feedback-<code>` so the
 * prompt is never shown again for the same order on the same device.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Heart } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedbackState = 'idle' | 'rating-selected' | 'submitting' | 'done' | 'already-done';

const EMOJI_OPTIONS: { rating: 1 | 2 | 3; label: string; emoji: string }[] = [
  { rating: 1, emoji: '🙁', label: 'Kurang puas' },
  { rating: 2, emoji: '😐', label: 'Biasa saja' },
  { rating: 3, emoji: '😊', label: 'Puas banget!' },
];

const MAX_COMMENT = 300;

// ─── localStorage helper ──────────────────────────────────────────────────────

function getFeedbackKey(orderCode: string) {
  return `cafe-feedback-${orderCode}`;
}

function hasSubmittedFeedback(orderCode: string): boolean {
  try {
    return Boolean(localStorage.getItem(getFeedbackKey(orderCode)));
  } catch {
    return false;
  }
}

function markFeedbackSubmitted(orderCode: string) {
  try {
    localStorage.setItem(getFeedbackKey(orderCode), '1');
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OrderFeedbackCardProps {
  orderCode: string;
}

export default function OrderFeedbackCard({ orderCode }: OrderFeedbackCardProps) {
  const [stage, setStage] = useState<FeedbackState>('idle');
  const [selectedRating, setSelectedRating] = useState<1 | 2 | 3 | null>(null);
  const [comment, setComment] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Restore already-submitted state from localStorage on mount
  useEffect(() => {
    if (hasSubmittedFeedback(orderCode)) {
      setStage('already-done');
    }
  }, [orderCode]);

  // Auto-focus comment box after rating tap
  useEffect(() => {
    if (stage === 'rating-selected') {
      setTimeout(() => commentRef.current?.focus(), 200);
    }
  }, [stage]);

  async function handleEmojiSelect(rating: 1 | 2 | 3) {
    setSelectedRating(rating);
    setErrorMsg(null);
    setStage('rating-selected');

    try {
      const res = await fetch('/api/orders/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_code: orderCode,
          rating,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || 'Gagal menyimpan rating.');
      } else {
        markFeedbackSubmitted(orderCode);
      }
    } catch {
      setErrorMsg('Koneksi bermasalah saat mengirim rating.');
    }
  }

  async function handleSubmit() {
    if (!selectedRating || stage === 'submitting') return;
    setStage('submitting');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/orders/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_code: orderCode,
          rating:     selectedRating,
          comment:    comment.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data?.error || 'Gagal mengirim catatan ulasan.');
        setStage('rating-selected');
        return;
      }

      markFeedbackSubmitted(orderCode);
      setStage('done');
    } catch {
      setErrorMsg('Koneksi bermasalah. Coba lagi.');
      setStage('rating-selected');
    }
  }

  // ── Already-done state: warm thank-you ────────────────────────────────────
  if (stage === 'already-done' || stage === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-coffee-50 to-amber-50/60 rounded-2xl border border-coffee-100/80 p-5 text-center"
      >
        <div className="text-3xl mb-2">☕</div>
        <p className="font-bold text-coffee-900 text-sm">Terima kasih atas ulasanmu!</p>
        <p className="text-xs text-charcoal/50 mt-1">
          Kami senang bisa melayani kamu.{' '}
          <Heart className="inline w-3 h-3 text-red-400 fill-red-400" />
        </p>
      </motion.div>
    );
  }

  // ── Idle state: 3-emoji prompt ────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-coffee-100/80 p-5 shadow-soft"
    >
      <p className="font-bold text-coffee-900 text-sm mb-0.5">Gimana pesananmu?</p>
      <p className="text-xs text-charcoal/50 mb-4">
        Kasih tahu kami pengalamanmu hari ini.
      </p>

      {/* Emoji rating buttons */}
      <div className="flex items-center justify-around gap-2 mb-4">
        {EMOJI_OPTIONS.map(({ rating, emoji, label }) => (
          <button
            key={rating}
            type="button"
            onClick={() => handleEmojiSelect(rating)}
            className={`
              flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl
              transition-all duration-150 active:scale-95
              ${selectedRating === rating
                ? 'bg-coffee-100 border-2 border-coffee-400 shadow-sm'
                : 'bg-coffee-50/60 border border-coffee-100 hover:bg-coffee-100/70'
              }
            `}
            aria-label={label}
            aria-pressed={selectedRating === rating}
          >
            <span className="text-2xl leading-none">{emoji}</span>
            <span className="text-[10px] font-semibold text-charcoal/60">{label}</span>
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-3 mb-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Comment + send — revealed after a rating is tapped */}
      <AnimatePresence>
        {(stage === 'rating-selected' || stage === 'submitting') && (
          <motion.div
            key="comment-section"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-3 pt-1">
              <div className="relative">
                <textarea
                  ref={commentRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
                  placeholder="Ceritain lebih lanjut (opsional)…"
                  rows={3}
                  className="w-full resize-none px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/35 focus:outline-none focus:border-coffee-400 transition-colors"
                />
                <span className="absolute bottom-2.5 right-3 text-[10px] text-charcoal/30 font-mono">
                  {comment.length}/{MAX_COMMENT}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={stage === 'submitting'}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60"
                >
                  {stage === 'submitting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{comment.trim() ? 'Kirim Catatan' : 'Simpan'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStage('done')}
                  className="px-4 py-3 rounded-xl bg-coffee-50 text-coffee-800 font-semibold text-xs hover:bg-coffee-100 transition-colors"
                >
                  Selesai
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
