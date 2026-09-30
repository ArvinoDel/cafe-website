import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const { data: ctx, error: authError } = await createSupabaseContext({ auth: 'user' });
  if (authError || !ctx) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  let body: {
    branch_id?: string;
    menu_item_id?: string;
    is_available?: boolean;
    is_enabled?: boolean;
    custom_price?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  const { branch_id, menu_item_id, is_available, is_enabled, custom_price } = body;
  if (!branch_id || !menu_item_id) {
    return NextResponse.json({ error: 'branch_id dan menu_item_id wajib diisi.' }, { status: 400 });
  }

  // 1. Fetch caller's profile to verify permission
  const { data: profile, error: profileErr } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profil admin tidak ditemukan.' }, { status: 403 });
  }

  // 2. Verify permissions: superadmin or branch admin of this specific branch
  if (profile.role !== 'superadmin') {
    if (profile.role !== 'admin' || profile.branch_id !== branch_id) {
      return NextResponse.json(
        { error: 'Anda tidak memiliki izin mengelola menu cabang ini.' },
        { status: 403 },
      );
    }
  }

  // 3. Prepare payload for upsert
  const payload: {
    branch_id: string;
    menu_item_id: string;
    is_available?: boolean;
    is_enabled?: boolean;
    custom_price?: number | null;
  } = {
    branch_id,
    menu_item_id,
  };

  if (typeof is_available === 'boolean') payload.is_available = is_available;
  if (typeof is_enabled === 'boolean') payload.is_enabled = is_enabled;
  if (custom_price !== undefined) payload.custom_price = custom_price;

  // 4. Upsert using service-role admin client
  const { data, error: upsertError } = await ctx.supabaseAdmin
    .from('branch_menu_items')
    .upsert(payload, { onConflict: 'branch_id,menu_item_id' })
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
