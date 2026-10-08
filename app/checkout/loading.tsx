/**
 * Route-level loading skeleton for /checkout.
 * Matches the real CheckoutPage layout: sticky top bar → item rows → customer
 * info fields → fixed bottom bar with total + submit button placeholder.
 *
 * The existing CheckoutSkeleton in checkout/page.tsx handles Suspense inside the
 * component tree (for useSearchParams). This loading.tsx fires before the JS
 * bundle even lands — giving instant visual feedback on Slow 3G.
 *
 * Each skeleton div uses `animate-pulse motion-reduce:animate-none`.
 */
export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-cream pb-52">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="w-16 h-4 bg-coffee-200/50 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-24 h-5 bg-coffee-200/60 rounded-lg animate-pulse motion-reduce:animate-none" />
          <div className="w-16 h-6 bg-coffee-200/50 rounded-lg animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Order items section */}
        <div className="space-y-3">
          <div className="w-24 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg bg-coffee-100/70 flex-shrink-0 animate-pulse motion-reduce:animate-none" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
                  <div className="w-20 h-3 bg-coffee-100/70 rounded animate-pulse motion-reduce:animate-none" />
                </div>
                <div className="w-16 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>

        {/* Customer details section */}
        <div className="space-y-3">
          <div className="w-28 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 space-y-4">
            <div className="h-11 bg-coffee-100/50 rounded-xl animate-pulse motion-reduce:animate-none" />
            <div className="h-11 bg-coffee-100/50 rounded-xl animate-pulse motion-reduce:animate-none" />
          </div>
        </div>

        {/* Payment method section */}
        <div className="space-y-3">
          <div className="w-32 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 grid grid-cols-2 gap-3">
            <div className="h-16 bg-coffee-100/50 rounded-xl animate-pulse motion-reduce:animate-none" />
            <div className="h-16 bg-coffee-100/50 rounded-xl animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      </div>

      {/* Fixed bottom summary + submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-cream/95 border-t border-coffee-100/60 p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex justify-between">
            <div className="w-20 h-4 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
            <div className="w-24 h-6 bg-coffee-200/60 rounded animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="w-full h-12 bg-coffee-200/70 rounded-xl animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
