/**
 * MenuCardSkeleton & MenuPageSkeleton
 *
 * These components replicate the exact geometry of the real menu cards so there
 * is zero layout shift (CLS = 0) when the real data populates.
 *
 * Mobile layout  : flex-row  — text left, 84×84 image right, small add button
 * Desktop layout : flex-col  — aspect-[4/5] image top, text + price + add button bottom
 *
 * The `animate-pulse motion-reduce:animate-none` classes ensure:
 *   - A gentle shimmer by default.
 *   - No animation for users who prefer reduced motion.
 */

import { cn } from '@/lib/utils';

// ─── Single card skeleton ──────────────────────────────────────────────────────

export function MenuCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        // Mobile: row layout matching the real card
        'border-b border-coffee-100 last:border-b-0 py-3.5 pb-4 flex flex-row items-start justify-between gap-3',
        // Desktop: card layout matching the real card
        'sm:border-b-0 sm:p-0 sm:pb-0 sm:gap-0 sm:flex-col sm:bg-white sm:rounded-2xl sm:overflow-hidden sm:border sm:border-coffee-100/80',
        className,
      )}
    >
      {/* LEFT on mobile / BOTTOM on desktop: text stack */}
      <div className="flex-1 min-w-0 space-y-2 sm:order-2 sm:p-5 sm:space-y-3">
        {/* Title line */}
        <div className="h-4 bg-coffee-100/70 rounded animate-pulse motion-reduce:animate-none w-3/4" />
        {/* Description line 1 */}
        <div className="h-3 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none w-full" />
        {/* Description line 2 (mobile only shorter line) */}
        <div className="h-3 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none w-2/3" />
        {/* Price line — mobile */}
        <div className="h-3.5 bg-coffee-100/60 rounded animate-pulse motion-reduce:animate-none w-1/3 sm:hidden mt-2" />
        {/* Desktop: price + plus-button row */}
        <div className="hidden sm:flex items-center justify-between mt-auto pt-1">
          <div className="h-5 bg-coffee-100/70 rounded animate-pulse motion-reduce:animate-none w-24" />
          <div className="w-10 h-10 rounded-xl bg-coffee-100/60 animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      {/* RIGHT on mobile / TOP on desktop: image box */}
      <div className="relative flex-shrink-0 sm:order-1 sm:w-full">
        {/* Mobile: 84×84 rounded image */}
        <div className="w-[84px] h-[84px] rounded-xl bg-coffee-100/70 animate-pulse motion-reduce:animate-none sm:hidden" />
        {/* Desktop: aspect-[4/5] image */}
        <div className="hidden sm:block w-full aspect-[4/5] bg-coffee-100/70 animate-pulse motion-reduce:animate-none" />
        {/* Mobile: small add-button placeholder (-bottom-3 overlapping) */}
        <div className="sm:hidden absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-coffee-100/80 border border-coffee-200 animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}

// ─── Category tab pills skeleton ───────────────────────────────────────────────

export function CategoryTabsSkeleton() {
  const widths = ['w-14', 'w-16', 'w-20', 'w-18', 'w-14'];
  return (
    <div aria-hidden="true" className="flex gap-2 overflow-x-auto scrollbar-hide py-3">
      {widths.map((w, i) => (
        <div
          key={i}
          className={cn(
            'h-9 rounded-xl bg-coffee-100/60 flex-shrink-0 animate-pulse motion-reduce:animate-none',
            w,
          )}
        />
      ))}
    </div>
  );
}

// ─── Grid / list of 8 card skeletons ──────────────────────────────────────────

export function MenuGridSkeleton() {
  return (
    <div
      aria-label="Memuat menu…"
      aria-busy="true"
      className={[
        // Mobile: single-column list in a white card container
        'bg-white rounded-2xl px-4 border border-coffee-100/80 shadow-soft-xs flex flex-col',
        // Desktop: grid layout
        'sm:bg-transparent sm:border-0 sm:shadow-none sm:rounded-none sm:p-0',
        'sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5',
      ].join(' ')}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <MenuCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Full-page skeleton (header + tabs + grid) ─────────────────────────────────

export function MenuPageSkeleton() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Sticky top bar placeholder */}
      <div className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-coffee-100/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="h-8 w-8 rounded-xl bg-coffee-100/60 animate-pulse motion-reduce:animate-none" />
          <div className="flex-1 h-10 rounded-xl bg-coffee-100/50 animate-pulse motion-reduce:animate-none max-w-sm" />
          <div className="h-9 w-20 rounded-xl bg-coffee-100/60 animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      {/* Category tabs */}
      <div className="sticky top-16 z-30 bg-cream/90 backdrop-blur-md border-b border-coffee-100/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CategoryTabsSkeleton />
        </div>
      </div>

      {/* Menu grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-8 pb-32">
        <MenuGridSkeleton />
      </div>
    </div>
  );
}
