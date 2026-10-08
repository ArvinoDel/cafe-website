'use client';

import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary for the /status/[code] segment.
 * Shows a reassuring message so the customer knows their order is safe.
 * Never exposes error.message, error.stack, or error.digest.
 */
export default function StatusErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[StatusErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-cream">
      <ErrorState
        icon={<ShieldCheck className="h-10 w-10 text-coffee-400" />}
        title="Ups, ada yang tidak beres"
        message="Status pesanan belum bisa dimuat. Pesananmu tetap aman. Coba lagi ya."
        primaryAction={{ label: 'Coba lagi', onClick: reset }}
        secondaryAction={{ label: 'Lihat riwayat pesanan', href: '/orders' }}
      />
    </div>
  );
}
