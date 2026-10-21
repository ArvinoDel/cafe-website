/**
 * POST /api/admin/reservations/[id]/retry-kitchen-order
 *
 * Admin-only endpoint: re-attempts creating a kitchen order for a seated/confirmed
 * reservation that was flagged with `needs_kitchen_order = true`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseContext, createAdminClient } from '@/lib/supabase-server';
import { createOrderInternal } from '@/lib/orders-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: reservationId } = await params;

  // 1. Authenticate admin user
  const { data: ctx, error: authErr } = await createSupabaseContext({ auth: 'user' });
  if (authErr || !ctx) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const admin = createAdminClient();

  // 2. Fetch reservation with table details
  const { data: res, error: fetchErr } = await admin
    .from('reservations')
    .select('*, table:tables(code, branch_id)')
    .eq('id', reservationId)
    .single();

  if (fetchErr || !res) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  // Branch check for regular admin
  if (profile.role === 'admin' && profile.branch_id !== res.branch_id) {
    return NextResponse.json({ error: 'Akses ditolak untuk cabang ini.' }, { status: 403 });
  }

  if (!res.items || !Array.isArray(res.items) || res.items.length === 0) {
    return NextResponse.json({ error: 'Reservasi tidak memiliki menu pre-order.' }, { status: 400 });
  }

  // 3. Create the kitchen order using authoritative internal engine
  const orderResult = await createOrderInternal(admin, {
    customerName:   res.customer_name || 'Tamu Reservasi',
    tableNumber:    res.table?.code || 'MEJA',
    branchId:       res.branch_id,
    items:          res.items,
    paymentMethod:  res.payment_method === 'cash' ? 'cash' : 'qris',
    notes:          `[LUNAS - Reservasi ${res.code}]` + (res.notes ? ` ${res.notes}` : ''),
    idempotencyKey: `retry_reservation_${res.id}_${Date.now()}`,
  });

  if (!orderResult.ok) {
    return NextResponse.json({ error: orderResult.error || 'Gagal membuat pesanan dapur.' }, { status: 500 });
  }

  // 4. Clear the needs_kitchen_order flag
  await admin
    .from('reservations')
    .update({ needs_kitchen_order: false, updated_at: new Date().toISOString() })
    .eq('id', res.id);

  return NextResponse.json({
    ok:      true,
    order:   orderResult.order,
    message: `Pesanan dapur untuk meja ${res.table?.code} berhasil dibuat ulang!`,
  });
}
