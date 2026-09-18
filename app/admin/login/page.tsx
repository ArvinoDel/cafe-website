'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Coffee, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Harap isi email dan password.');
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = getSupabase();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError('Incorrect email or password. Please try again.');
      setLoading(false);
      return;
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-coffee-700 flex items-center justify-center mb-4 shadow-soft">
            <Coffee className="w-7 h-7 text-cream" />
          </div>
          <h1 className="text-2xl font-extrabold text-coffee-900 tracking-tight">Cafe Admin</h1>
          <p className="text-sm text-charcoal/50 mt-1 font-medium">Admin Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 shadow-soft-lg p-7">
          <h2 className="text-lg font-bold text-coffee-900 mb-1">Sign In</h2>
          <p className="text-xs text-charcoal/50 mb-6">
            Use the account created by your superadmin.
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200/80 mb-5"
            >
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-400 pointer-events-none" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@yourcafe.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/35 focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-coffee-400 pointer-events-none" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/35 focus:outline-none focus:border-coffee-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-charcoal/35 hover:text-charcoal/60 transition-colors"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="admin-login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-soft mt-2"
            >
              {loading ? 'Verifying...' : 'Sign In to Dashboard'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-charcoal/35 mt-6">
          Cafe Admin &copy; {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}
