'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Coffee, LogOut, LayoutDashboard, QrCode, Building2, UtensilsCrossed, Palette } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useBrand } from '@/components/providers/BrandProvider';

// ─── Profile type ─────────────────────────────────────────────────────────────

export type AdminProfile = {
  id: string;
  role: 'superadmin' | 'admin';
  branch_id: string | null;
  branch_name: string | null;
  full_name: string | null;
};

// ─── Context ──────────────────────────────────────────────────────────────────

export const AdminProfileContext = createContext<AdminProfile | null>(null);

export function useAdminProfile(): AdminProfile {
  const ctx = useContext(AdminProfileContext);
  if (!ctx) throw new Error('useAdminProfile must be used inside AdminLayout');
  return ctx;
}

// ─── Provider wrapper (used by the server layout to inject the profile) ───────

export function AdminProfileProvider({
  profile,
  children,
}: {
  profile: AdminProfile;
  children: ReactNode;
}) {
  return (
    <AdminProfileContext.Provider value={profile}>{children}</AdminProfileContext.Provider>
  );
}

// ─── Header component ─────────────────────────────────────────────────────────

export function AdminHeader() {
  const profile = useContext(AdminProfileContext);
  const { brandName } = useBrand();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '',
    );
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  const navItems = [
    { href: '/admin', label: 'Orders', icon: LayoutDashboard },
    { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
    { href: '/admin/tables', label: 'QR Tables', icon: QrCode },
    ...(profile?.role === 'superadmin'
      ? [
          { href: '/admin/branches', label: 'Branches & Accounts', icon: Building2 },
          { href: '/admin/site-content', label: 'Site Content', icon: Palette },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-coffee-700 flex items-center justify-center">
              <Coffee className="w-4 h-4 text-cream" />
            </div>
            <div className="leading-none">
              <span className="text-sm font-extrabold text-coffee-900 tracking-tight">
                {brandName} Admin
              </span>
              <span className="block text-[10px] text-coffee-500 font-medium uppercase tracking-widest">
                Dashboard
              </span>
            </div>
          </div>

          {/* Nav tabs */}
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    active
                      ? 'bg-coffee-700 text-cream'
                      : 'text-charcoal/60 hover:bg-coffee-50 hover:text-coffee-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right side: role badge + logout */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {profile && (
              <div className="hidden sm:flex flex-col items-end leading-none">
                <span className="text-xs font-bold text-coffee-900">
                  {profile.full_name || 'Admin'}
                </span>
                <span className="text-[10px] text-charcoal/50 mt-0.5">
                  {profile.role === 'superadmin'
                    ? 'Superadmin'
                    : `Admin · ${profile.branch_name ?? '–'}`}
                </span>
              </div>
            )}
            <button
              id="admin-logout"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-charcoal/60 hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-semibold"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden flex items-center gap-1 pb-2 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                  active
                    ? 'bg-coffee-700 text-cream'
                    : 'text-charcoal/60 hover:bg-coffee-50 hover:text-coffee-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ─── Notice for authenticated users without profile row ───────────────────────

export function UnlinkedAdminNotice({ email }: { email?: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '',
    );
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-coffee-100 shadow-soft-lg p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <Coffee className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-extrabold text-coffee-900">Account Not Linked</h1>
        <p className="mt-2 text-charcoal/70 text-sm leading-relaxed">
          Your account {email ? <span className="font-semibold text-coffee-800">({email})</span> : ''} is not linked to an admin profile. Please contact your superadmin.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 w-full py-3 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

