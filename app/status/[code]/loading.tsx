/**
 * Route-level loading skeleton for /status/[code].
 * Mirrors the real status page layout: sticky top bar → order header card →
 * 4-step progress tracker → order items summary.
 *
 * The existing StatusSkeleton inside status/[code]/page.tsx handles in-component
 * loading (after JS lands). This loading.tsx covers the pre-JS phase on Slow 3G.
 *
 * Each skeleton div uses `animate-pulse motion-reduce:animate-none`.
 */
export default function StatusLoading() {
  return (
    <div className="min-h-screen bg-cream pb-12">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="w-16 h-4 bg-coffee-200/50 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-28 h-5 bg-coffee-200/60 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-16 h-7 bg-coffee-200/50 rounded-xl animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Order header card */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 text-center shadow-soft space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-coffee-100/60 mx-auto animate-pulse motion-reduce:animate-none" />
          <div className="w-24 h-3 bg-coffee-200/50 rounded mx-auto animate-pulse motion-reduce:animate-none" />
          <div className="w-36 h-7 bg-coffee-200/70 rounded-lg mx-auto animate-pulse motion-reduce:animate-none" />
          <div className="w-28 h-4 bg-coffee-100/70 rounded mx-auto animate-pulse motion-reduce:animate-none" />
          <div className="w-32 h-6 bg-coffee-100/60 rounded-xl mx-auto mt-2 animate-pulse motion-reduce:animate-none" />
        </div>

        {/* Progress tracker (4 steps) */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 shadow-soft space-y-4">
          <div className="w-28 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          <div className="space-y-4 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-coffee-100/70 flex-shrink-0 animate-pulse motion-reduce:animate-none" />
                <div className="flex-1 space-y-1.5">
                  <div className="w-32 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
                  <div className="w-48 h-3 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order items summary */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 shadow-soft space-y-3">
          <div className="w-24 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-coffee-50 last:border-0">
              <div className="w-10 h-10 rounded-lg bg-coffee-100/70 flex-shrink-0 animate-pulse motion-reduce:animate-none" />
              <div className="flex-1 space-y-1.5">
                <div className="w-28 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
                <div className="w-16 h-3 bg-coffee-100/60 rounded animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="w-14 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
