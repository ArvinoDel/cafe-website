'use client';

/**
 * /group/[code]
 *
 * Group cart invitation page.
 * - Loads the invite code from the URL
 * - If the user already has a session for this code, redirects to /menu?group=CODE
 * - Otherwise shows a "join" form (name input) and calls POST /api/group-carts/[code]/join
 * - On success, saves the session to localStorage and redirects to /menu?group=CODE
 */

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users, Coffee, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import {
  getLocalGroupSession,
  saveLocalGroupSession,
  getLastDisplayName,
} from '@/lib/group-cart';

type PageParams = { code: string };

export default function GroupJoinPage({ params }: { params: Promise<PageParams> }) {
  const { code } = use(params);
  const router = useRouter();

  const [name, setName]           = useState('');
  const [joining, setJoining]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [mounted, setMounted]     = useState(false);

  // Hydrate after mount to avoid SSR mismatch
  useEffect(() => {
    setMounted(true);
    // If user already belongs to this cart, skip the form
    const existing = getLocalGroupSession();
    if (existing && existing.code === code) {
      router.replace(`/menu?group=${encodeURIComponent(code)}`);
      return;
    }
    // Pre-fill last used name
    const last = getLastDisplayName();
    if (last) setName(last);
  }, [code, router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Masukkan namamu dulu ya.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Nama terlalu panjang (maks. 30 karakter).');
      return;
    }
    setJoining(true);
    setError(null);

    try {
      const res = await fetch(`/api/group-carts/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? 'Gagal bergabung. Coba lagi ya.');
        setJoining(false);
        return;
      }

      saveLocalGroupSession({
        code,
        member_id:    data.member_id,
        member_token: data.member_token,
        name:         trimmed,
      });

      router.replace(`/menu?group=${encodeURIComponent(code)}`);
    } catch {
      setError('Koneksi bermasalah. Periksa internet kamu dan coba lagi.');
      setJoining(false);
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-cream" />;
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-coffee-600 to-coffee-800 flex items-center justify-center shadow-soft-lg">
            <Users className="w-9 h-9 text-cream" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-coffee-900 tracking-tight">
            Pesan Bareng Yuk!
          </h1>
          <p className="mt-2 text-sm text-charcoal/60 leading-relaxed">
            Temanmu mengundang kamu buat pesan bareng di satu meja. Masukkan namamu supaya
            semua orang tahu siapa yang mesen apa 😄
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-coffee-50 border border-coffee-200/70 text-xs font-semibold text-coffee-700">
            <Coffee className="w-3.5 h-3.5" />
            Kode undangan: <span className="font-extrabold tracking-widest">{code}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="join-name" className="block text-xs font-semibold text-charcoal/50 mb-1.5">
              Namamu
            </label>
            <input
              id="join-name"
              type="text"
              autoFocus
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Budi, Sari, dll."
              maxLength={30}
              className="w-full px-4 py-3.5 rounded-xl bg-white border border-coffee-200 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-500 transition-colors shadow-2xs"
              disabled={joining}
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs"
            >
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={joining || !name.trim()}
            className="w-full py-4 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft flex items-center justify-center gap-2"
          >
            {joining ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Bergabung...</span>
              </>
            ) : (
              <>
                <span>Gabung &amp; Pilih Menu</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-charcoal/40 leading-relaxed">
          Kamu akan bisa pilih menu sendiri dan pesanan semua orang akan digabung jadi satu
          oleh yang punya undangan ini.
        </p>
      </motion.div>
    </div>
  );
}
