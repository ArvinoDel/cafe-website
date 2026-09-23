import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';

export async function DELETE(request: NextRequest) {
  const { data: ctx, error: authError } = await createSupabaseContext({ auth: 'user' });
  if (authError || !ctx) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('id');
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID wajib diisi.' }, { status: 400 });
  }

  // 1. Fetch caller's profile
  const { data: profile, error: profileErr } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profil admin tidak ditemukan.' }, { status: 403 });
  }

  // 2. Fetch the target order's branch_id using admin client
  const { data: order, error: orderErr } = await ctx.supabaseAdmin
    .from('orders')
    .select('id, branch_id')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Pesanan tidak ditemukan.' }, { status: 404 });
  }

  // 3. Verify permissions: superadmin or branch admin of the order's branch
  if (profile.role !== 'superadmin') {
    if (profile.role !== 'admin' || profile.branch_id !== order.branch_id) {
      return NextResponse.json(
        { error: 'Anda tidak memiliki izin menghapus pesanan di cabang ini.' },
        { status: 403 }
      );
    }
  }

  // 4. Delete the order
  const { error: deleteError } = await ctx.supabaseAdmin
    .from('orders')
    .delete()
    .eq('id', orderId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
