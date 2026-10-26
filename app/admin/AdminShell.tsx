'use client';

import { createContext, useContext, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Coffee, LogOut, LayoutDashboard, QrCode, Building2, UtensilsCrossed, Palette, FileText, CalendarDays } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
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
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  const navItems = [
    { href: '/admin', label: 'Orders', icon: LayoutDashboard },
    { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
    { href: '/admin/tables', label: 'QR Tables', icon: QrCode },
    { href: '/admin/reservations', label: 'Reservasi', icon: CalendarDays },
    ...(profile?.role === 'superadmin'
      ? [
          { href: '/admin/branches', label: 'Branches & Accounts', icon: Building2 },
          { href: '/admin/site-content', label: 'Site Content', icon: Palette },
          { href: '/admin/pages', label: 'Pages', icon: FileText },
        ]
      : []),
  ];

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (profile?.role === 'superadmin' ? 'SA' : 'AD');

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-coffee-200/40 shadow-[0_1px_3px_0_rgba(42,31,23,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand */}
          <Link
            href="/admin"
            className="flex items-center gap-2.5 flex-shrink-0 group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-coffee-800 to-coffee-950 text-amber-200 flex items-center justify-center shadow-xs ring-1 ring-coffee-900/10 group-hover:scale-105 transition-transform duration-200">
              <Coffee className="w-4 h-4 text-amber-200/90" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-coffee-950 tracking-tight leading-none group-hover:text-coffee-800 transition-colors">
                  {brandName || 'Kafeitiam'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase bg-coffee-100 text-coffee-800 border border-coffee-200/60 leading-none">
                  Admin
                </span>
              </div>
              <span className="text-[10px] text-coffee-500/80 font-medium tracking-normal mt-0.5 leading-none">
                Management Portal
              </span>
            </div>
          </Link>

          {/* Nav tabs (Desktop segmented pill control) */}
          <nav className="hidden lg:flex items-center p-1 bg-coffee-100/50 border border-coffee-200/50 rounded-2xl backdrop-blur-xs gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-[13px] font-medium whitespace-nowrap transition-all duration-150 ${
                    active
                      ? 'bg-coffee-900 text-cream shadow-xs font-semibold'
                      : 'text-coffee-700/70 hover:text-coffee-950 hover:bg-white/70'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 transition-colors ${
                      active ? 'text-amber-300' : 'text-coffee-400 group-hover:text-coffee-700'
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right side: profile chip + logout */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {profile && (
              <div className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-coffee-50/60 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-coffee-200 to-sand-200 text-coffee-900 font-bold text-xs flex items-center justify-center border border-coffee-300/60 shadow-xs ring-2 ring-white select-none">
                  {initials}
                </div>
                <div className="hidden sm:flex flex-col text-left leading-tight">
                  <span className="text-xs font-semibold text-coffee-950 max-w-[120px] truncate">
                    {profile.full_name || 'Admin'}
                  </span>
                  <span className="text-[10px] font-medium text-coffee-600/70">
                    {profile.role === 'superadmin'
                      ? 'Superadmin'
                      : (profile.branch_name ?? 'Branch Admin')}
                  </span>
                </div>
              </div>
            )}

            <div className="h-4 w-px bg-coffee-200/60 hidden sm:block mx-0.5" />

            <button
              id="admin-logout"
              onClick={handleLogout}
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-coffee-600 hover:text-red-600 hover:bg-red-50/80 border border-transparent hover:border-red-100 transition-all duration-150"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Tablet & Mobile nav strip */}
        <div className="lg:hidden py-2 border-t border-coffee-100/60 overflow-x-auto scrollbar-hide">
          <nav className="flex items-center gap-1 px-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all duration-150 ${
                    active
                      ? 'bg-coffee-900 text-cream shadow-xs font-semibold'
                      : 'text-coffee-700/70 hover:text-coffee-900 hover:bg-white/60'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      active ? 'text-amber-300' : 'text-coffee-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

// ─── Notice for authenticated users without profile row ───────────────────────

export function UnlinkedAdminNotice({ email }: { email?: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
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

