'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Root error boundary for the customer site.
 * - Never renders error.message, error.stack, or error.digest to the customer.
 * - console.error is called inside useEffect for debugging without exposing details.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-cream">
      <ErrorState
        icon={<AlertCircle className="h-10 w-10 text-coffee-400" />}
        title="Ups, ada yang tidak beres"
        message="Halaman gagal dimuat. Coba lagi ya."
        primaryAction={{ label: 'Coba lagi', onClick: reset }}
        secondaryAction={{ label: 'Kembali ke menu', href: '/menu' }}
      />
    </div>
  );
}
