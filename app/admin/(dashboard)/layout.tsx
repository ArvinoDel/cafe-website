import { redirect } from 'next/navigation';
import { createSupabaseContext } from '@/lib/supabase-server';
import { AdminProfileProvider, AdminHeader, type AdminProfile } from '../AdminShell';
import type { ReactNode } from 'react';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { data: ctx, error } = await createSupabaseContext({ auth: 'user' });

  if (error || !ctx) {
    redirect('/admin/login');
  }

  // Fetch the profile + branch name in one query
  const { data: profile, error: profileError } = await ctx.supabase
    .from('profiles')
    .select('id, role, branch_id, full_name, branches(name)')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (profileError || !profile) {
    // User is authenticated but has no profile row — likely not an admin.
    redirect('/admin/login');
  }

  type ProfileRow = {
    id: string;
    role: string;
    branch_id: string | null;
    full_name: string | null;
    branches: { name: string } | { name: string }[] | null;
  };

  const row = (profile as unknown) as ProfileRow;
  const branchName = Array.isArray(row.branches)
    ? (row.branches[0]?.name ?? null)
    : (row.branches?.name ?? null);

  const adminProfile: AdminProfile = {
    id: row.id,
    role: row.role as 'superadmin' | 'admin',
    branch_id: row.branch_id,
    branch_name: branchName,
    full_name: row.full_name,
  };

  return (
    <AdminProfileProvider profile={adminProfile}>
      <div className="min-h-screen bg-cream">
        <AdminHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </AdminProfileProvider>
  );
}
