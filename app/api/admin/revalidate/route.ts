import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';

/**
 * POST /api/admin/revalidate
 *
 * Triggers ISR revalidation for the homepage and menu page after a superadmin
 * saves site_content changes. The request must come from an authenticated
 * superadmin session (validated via the existing auth context).
 */
export async function POST() {
  const { data: ctx, error } = await createSupabaseContext({ auth: 'user' });
  if (error || !ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch role from profiles
  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('role')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (!profile || profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  revalidatePath('/');
  revalidatePath('/menu');
  revalidatePath('/orders');
  revalidatePath('/checkout');

  return NextResponse.json({ revalidated: true });
}
