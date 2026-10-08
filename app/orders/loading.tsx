/**
 * Route-level loading skeleton for /orders.
 * Mirrors the real orders page: sticky top bar → search bar → status tabs →
 * 3–4 order history card rows.
 *
 * Each skeleton div uses `animate-pulse motion-reduce:animate-none`.
 */
export default function OrdersLoading() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="w-16 h-4 bg-coffee-200/50 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-36 h-5 bg-coffee-200/60 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-8 h-8 bg-coffee-200/50 rounded-xl animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 space-y-4 pb-16">
        {/* Search bar */}
        <div className="h-11 bg-white rounded-xl border border-coffee-100/80 animate-pulse motion-reduce:animate-none" />

        {/* Status tabs row */}
        <div className="flex gap-2">
          {['w-16', 'w-24', 'w-20'].map((w, i) => (
            <div
              key={i}
              className={`h-9 rounded-xl bg-coffee-100/60 flex-shrink-0 animate-pulse motion-reduce:animate-none ${w}`}
            />
          ))}
        </div>

        {/* Order card rows */}
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl p-5 border border-coffee-100/70 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-28 bg-coffee-100 rounded-lg animate-pulse motion-reduce:animate-none" />
                <div className="h-5 w-20 bg-coffee-100 rounded-full animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="h-3 w-40 bg-coffee-50 rounded animate-pulse motion-reduce:animate-none" />
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 bg-coffee-100 rounded animate-pulse motion-reduce:animate-none" />
                <div className="h-8 w-20 bg-coffee-100/70 rounded-xl animate-pulse motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
