import Link from 'next/link';
import { MapPin } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

/**
 * 404 catch-all page.
 * Not a 'use client' — it's a pure server component, which is the Next.js default
 * for not-found.tsx. No brand names, all text in Indonesian.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream">
      <ErrorState
        icon={<MapPin className="h-10 w-10 text-coffee-400" />}
        title="Halaman tidak ditemukan"
        message="Link yang kamu buka mungkin salah atau sudah tidak berlaku."
        primaryAction={{ label: 'Ke halaman utama', href: '/' }}
        secondaryAction={{ label: 'Lihat menu', href: '/menu' }}
      />
    </div>
  );
}
