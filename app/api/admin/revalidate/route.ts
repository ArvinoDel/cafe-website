import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';

/**
 * POST /api/admin/revalidate
 *
 * Triggers ISR cache revalidation (tags & paths) after an admin or superadmin
 * saves site_content, menu items, or branch changes.
 *
 * Request body (optional JSON):
 *   { tag?: string, tags?: string[] }
 */
export async function POST(request: NextRequest) {
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

  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { tag?: string; tags?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional
  }

  if (body.tag) {
    revalidateTag(body.tag);
  } else if (body.tags && Array.isArray(body.tags)) {
    body.tags.forEach((tag) => revalidateTag(tag));
  } else {
    // Default: invalidate all primary homepage & catalog cache tags
    revalidateTag('site-content');
    revalidateTag('branches');
    revalidateTag('menu');
  }

  revalidatePath('/');
  revalidatePath('/menu');
  revalidatePath('/orders');
  revalidatePath('/checkout');

  return NextResponse.json({ revalidated: true });
}

