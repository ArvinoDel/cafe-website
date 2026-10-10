'use client';

/**
 * QueueProgressCup.tsx
 *
 * Displays an animated coffee cup whose liquid level reflects the order's
 * position in the preparation queue. Uses framer-motion for smooth transitions
 * and respects `prefers-reduced-motion`.
 */

import { useEffect, useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
  animate,
} from 'framer-motion';
import { roundToFiveMinutes } from '@/lib/wait-time';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveStatus = 'pending' | 'preparing' | 'ready';
type AnyStatus = ActiveStatus | 'completed' | 'cancelled';

interface QueueProgressCupProps {
  status: AnyStatus;
  ordersAhead: number | null;
  waitMinutesRemaining: number | null;
  /** Pass true when the amber wait-time pill is already shown to avoid duplicate text */
  hideWaitTimeBadge?: boolean;
}

// ─── Fill levels per status ───────────────────────────────────────────────────

const FILL_PERCENT: Record<ActiveStatus, number> = {
  pending: 15,
  preparing: 60,
  ready: 100,
};

// ─── Cup geometry (viewBox 0 0 80 100) ───────────────────────────────────────
// Interior runs from y=8 (top rim) to y=88 (base inner), total height = 80.

const CUP_INNER_TOP = 8;
const CUP_INNER_HEIGHT = 80;

/** Convert a fill percentage [0–100] to a clip-rect y (top of the liquid) */
function fillToY(pct: number): number {
  return CUP_INNER_TOP + CUP_INNER_HEIGHT * (1 - pct / 100);
}

// ─── Indonesian copy per state ────────────────────────────────────────────────

function getCopy(status: ActiveStatus, ordersAhead: number | null) {
  if (status === 'preparing') {
    return {
      headline: 'Barista sedang membuat pesananmu',
      subtext: 'Hampir jadi, tunggu sebentar.',
    };
  }
  if (status === 'ready') {
    return {
      headline: 'Pesananmu siap! ☕',
      subtext: 'Selamat menikmati.',
    };
  }
  // pending
  if (ordersAhead === null || ordersAhead === 0) {
    return {
      headline: 'Kamu berikutnya!',
      subtext: 'Pesananmu segera dibuat.',
    };
  }
  if (ordersAhead === 1) {
    return {
      headline: '1 pesanan di depanmu',
      subtext: 'Sebentar lagi giliranmu.',
    };
  }
  return {
    headline: `${ordersAhead} pesanan di depanmu`,
    subtext: 'Kami kerjakan satu per satu, ya.',
  };
}

// ─── Step dots ────────────────────────────────────────────────────────────────

const STEPS: { key: ActiveStatus; label: string }[] = [
  { key: 'pending', label: 'Diterima' },
  { key: 'preparing', label: 'Dibuat' },
  { key: 'ready', label: 'Siap' },
];

const STATUS_ORDER: ActiveStatus[] = ['pending', 'preparing', 'ready'];

// ─── Public component (guards terminal statuses) ──────────────────────────────

export default function QueueProgressCup({
  status,
  ordersAhead,
  waitMinutesRemaining,
  hideWaitTimeBadge = false,
}: QueueProgressCupProps) {
  const shouldReduceMotion = useReducedMotion();

  // Return null for terminal statuses — no cup card shown
  if (status === 'completed' || status === 'cancelled') return null;

  return (
    <QueueProgressCupInner
      status={status}
      ordersAhead={ordersAhead}
      waitMinutesRemaining={waitMinutesRemaining}
      hideWaitTimeBadge={hideWaitTimeBadge}
      reduceMotion={!!shouldReduceMotion}
    />
  );
}

// ─── Inner component (hooks always run — no conditional returns above them) ───

function QueueProgressCupInner({
  status,
  ordersAhead,
  waitMinutesRemaining,
  hideWaitTimeBadge,
  reduceMotion,
}: {
  status: ActiveStatus;
  ordersAhead: number | null;
  waitMinutesRemaining: number | null;
  hideWaitTimeBadge: boolean;
  reduceMotion: boolean;
}) {
  const targetY = fillToY(FILL_PERCENT[status]);

  // Motion value representing the top-Y of the liquid fill
  const liquidY = useMotionValue(targetY);
  // Spring makes the level change feel natural (~0.8 s effective)
  const springY = useSpring(liquidY, { stiffness: 120, damping: 20, mass: 0.8 });

  // Animate liquid whenever status (and therefore targetY) changes
  useEffect(() => {
    if (reduceMotion) {
      liquidY.set(targetY);
    } else {
      animate(liquidY, targetY, { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] });
    }
  }, [targetY, liquidY, reduceMotion]);

  // Detect first transition into 'ready' for entrance bounce
  const prevStatusRef = useRef<ActiveStatus>(status);
  const isNewReady = status === 'ready' && prevStatusRef.current !== 'ready';
  useEffect(() => {
    prevStatusRef.current = status;
  }, [status]);

  const { headline, subtext } = getCopy(status, ordersAhead);
  const stepIdx = STATUS_ORDER.indexOf(status);

  // Show ±X menit lagi only when the amber pill is NOT already shown externally
  const showWaitLine =
    !hideWaitTimeBadge &&
    (status === 'pending' || status === 'preparing') &&
    typeof waitMinutesRemaining === 'number' &&
    waitMinutesRemaining > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 py-3 select-none"
    >
      {/* ── Animated coffee cup SVG ──────────────────────────────────── */}
      <motion.div
        className="relative"
        /* Subtle entrance bounce when transitioning to 'ready' */
        animate={
          !reduceMotion && isNewReady
            ? { scale: [1, 1.06, 0.97, 1.02, 1] }
            : { scale: 1 }
        }
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <svg
          viewBox="0 0 80 110"
          width="110"
          height="110"
          aria-hidden="true"
          style={{ overflow: 'visible' }}
        >
          <defs>
            {/* Clip path cuts the liquid rendering to the cup interior shape */}
            <clipPath id="cup-liquid-clip">
              <path d="M10 8 L70 8 L64 88 L16 88 Z" />
            </clipPath>
          </defs>

          {/* ── Cup structure ─────────────────────────────────────── */}
          {/* Main body outline */}
          <path
            d="M8 6 L72 6 L66 90 L14 90 Z"
            fill="none"
            stroke="#cdaa8b"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Rim */}
          <rect x="6" y="4" width="68" height="6" rx="3" fill="#e3d0bf" />
          {/* Base */}
          <rect x="12" y="88" width="56" height="5" rx="2.5" fill="#cdaa8b" />
          {/* Saucer */}
          <ellipse cx="40" cy="95" rx="30" ry="4" fill="#e3d0bf" />
          {/* Handle */}
          <path
            d="M72 28 Q88 28 88 48 Q88 68 72 68"
            fill="none"
            stroke="#cdaa8b"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* ── Liquid fill, clipped to cup interior ───────────────── */}
          <g clipPath="url(#cup-liquid-clip)">
            {/* The liquid body — rect top Y is spring-animated */}
            <motion.rect
              x="0"
              y={springY}
              width="80"
              height="100"
              fill="#9c6638"
              opacity="0.85"
            />

            {/* Wave on liquid surface during 'preparing' (disabled with reduced motion) */}
            {status === 'preparing' && !reduceMotion && (
              <motion.path
                fill="#b5845e"
                opacity="0.6"
                style={{ translateY: springY }}
                animate={{
                  d: [
                    'M0 0 Q20 -5 40 0 Q60 5 80 0 L80 10 L0 10 Z',
                    'M0 0 Q20 5 40 0 Q60 -5 80 0 L80 10 L0 10 Z',
                    'M0 0 Q20 -5 40 0 Q60 5 80 0 L80 10 L0 10 Z',
                  ],
                }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            )}

            {/* Crema layer on top of the liquid for preparing / ready */}
            {(status === 'preparing' || status === 'ready') && (
              <motion.ellipse
                cx="40"
                cy={0}
                rx="28"
                ry="4"
                fill="#cdaa8b"
                opacity="0.65"
                style={{ translateY: springY }}
              />
            )}
          </g>

          {/* ── Rising steam lines (ready state, reduced-motion off) ── */}
          {status === 'ready' && !reduceMotion && (
            <g>
              {([20, 40, 60] as const).map((x, i) => (
                <motion.path
                  key={x}
                  d={`M${x} 4 Q${x - 5} -4 ${x} -12 Q${x + 5} -20 ${x} -28`}
                  fill="none"
                  stroke="#9c6638"
                  strokeWidth="2"
                  strokeLinecap="round"
                  animate={{
                    opacity: [0, 0.55, 0],
                    y: [0, -8, -18],
                  }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: i * 0.45,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </g>
          )}
        </svg>
      </motion.div>

      {/* ── Headline and subtext ─────────────────────────────────────── */}
      <div className="text-center space-y-0.5 px-4">
        <p className="text-sm font-bold text-coffee-900 leading-snug">{headline}</p>
        <p className="text-xs text-charcoal/50">{subtext}</p>
        {showWaitLine && (
          <p className="text-xs text-amber-700 font-semibold mt-1">
            ±{roundToFiveMinutes(waitMinutesRemaining!)} menit lagi
          </p>
        )}
      </div>

      {/* ── 3-step progress dots (Diterima • Dibuat • Siap) ──────────── */}
      {/* aria-hidden: the accessible text lives in the headline above */}
      <div className="flex items-center gap-0" aria-hidden="true">
        {STEPS.map((step, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                    done || active ? 'bg-coffee-600' : 'bg-coffee-200'
                  }`}
                />
                <span
                  className={`text-[9px] font-semibold leading-none transition-colors duration-300 ${
                    done || active ? 'text-coffee-700' : 'text-coffee-300'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-6 h-px mb-3 mx-1 transition-colors duration-300 ${
                    done ? 'bg-coffee-500' : 'bg-coffee-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
