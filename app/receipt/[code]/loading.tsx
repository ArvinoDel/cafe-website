/**
 * Route-level loading skeleton for /receipt/[code].
 * Mirrors the real receipt page layout: back navigation → receipt paper card
 * (branch header, separator, metadata grid, items table, total row, action buttons).
 *
 * Each skeleton div uses `animate-pulse motion-reduce:animate-none`.
 */
export default function ReceiptLoading() {
  return (
    <div className="min-h-screen bg-cream py-6 sm:py-10 px-4">
      {/* Back navigation placeholder */}
      <div className="max-w-md mx-auto mb-4 flex items-center justify-between">
        <div className="h-4 w-24 bg-coffee-100/70 rounded animate-pulse motion-reduce:animate-none" />
        <div className="h-3 w-16 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none" />
      </div>

      {/* Receipt paper card */}
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl border border-coffee-100 shadow-soft-lg p-6 sm:p-8 space-y-5">
        {/* Branch header */}
        <div className="flex flex-col items-center gap-3 pb-4">
          <div className="w-10 h-10 rounded-xl bg-coffee-100/70 animate-pulse motion-reduce:animate-none" />
          <div className="w-40 h-6 bg-coffee-200/70 rounded animate-pulse motion-reduce:animate-none" />
          <div className="w-32 h-3 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none" />
          <div className="w-24 h-5 bg-coffee-100/60 rounded-full animate-pulse motion-reduce:animate-none mt-1" />
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-coffee-200" />

        {/* Order metadata grid */}
        <div className="grid grid-cols-2 gap-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`space-y-1 ${i % 2 === 0 ? 'text-right' : ''}`}>
              <div className="h-2.5 w-16 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-4 w-20 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-coffee-200" />

        {/* Item rows */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between items-start">
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
                <div className="h-3 w-10 bg-coffee-100/50 rounded animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="h-4 w-20 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-coffee-200" />

        {/* Total row */}
        <div className="flex justify-between items-center">
          <div className="h-5 w-10 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-6 w-28 bg-coffee-200/70 rounded animate-pulse motion-reduce:animate-none" />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <div className="flex-1 h-11 bg-coffee-100/60 rounded-xl animate-pulse motion-reduce:animate-none" />
          <div className="flex-1 h-11 bg-coffee-100/60 rounded-xl animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
