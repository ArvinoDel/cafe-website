'use client';

import { useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary scoped to /checkout.
 * Reassures the customer that their cart items are still saved (they are — in
 * localStorage). Never exposes error.message, error.stack, or error.digest.
 */
export default function CheckoutErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[CheckoutErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-cream">
      <ErrorState
        icon={<ShoppingCart className="h-10 w-10 text-coffee-400" />}
        title="Ups, ada yang tidak beres"
        message="Checkout gagal dimuat. Keranjangmu tetap tersimpan."
        primaryAction={{ label: 'Coba lagi', onClick: reset }}
        secondaryAction={{ label: 'Kembali ke menu', href: '/menu' }}
      />
    </div>
  );
}
