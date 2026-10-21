import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import type { SupabaseEnv } from '@supabase/server';

function resolveEnv(): Partial<SupabaseEnv> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const env: Partial<SupabaseEnv> = {};
  if (url) env.url = url;
  if (publishableKey) env.publishableKeys = { default: publishableKey };
  if (secretKey) env.secretKeys      = { default: secretKey };
  return env;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderCode    = String(body?.order_code || '').trim().toUpperCase();
    const newTableCode = String(body?.new_table  || '').trim().toUpperCase();

    if (!orderCode) {
      return NextResponse.json(
        { error: 'Kode pesanan wajib diisi.' },
        { status: 400 },
      );
    }

    if (!newTableCode) {
      return NextResponse.json(
        { error: 'Kode meja baru wajib diisi.' },
        { status: 400 },
      );
    }

    const env           = resolveEnv();
    const supabaseAdmin = createAdminClient({ env });

    // 1. Fetch current order to verify it exists and is movable
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_code, customer_name, table_number, branch_id, status')
      .eq('order_code', orderCode)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json(
        { error: `Pesanan dengan kode ${orderCode} tidak ditemukan.` },
        { status: 404 },
      );
    }

    // 2. Only allow moving table if order is still active / in preparation
    const movableStatuses = ['pending', 'preparing'];
    if (!movableStatuses.includes((order as any).status)) {
      const statusLabels: Record<string, string> = {
        ready:     'Siap Diantar',
        completed: 'Selesai',
        cancelled: 'Dibatalkan',
      };
      const label = statusLabels[(order as any).status] || (order as any).status;
      return NextResponse.json(
        {
          error: `Pesanan sudah dalam status "${label}" dan tidak dapat dipindahkan mejanya. Silakan hubungi barista secara langsung.`,
        },
        { status: 400 },
      );
    }

    // 3. Call claim_table to atomically move the table session lock to the new table.
    //    The token lives in a httpOnly cookie and cannot be forged by JS.
    const { TABLE_SESSION_COOKIE } = await import('@/lib/table-session-server');
    const sessionToken = request.cookies.get(TABLE_SESSION_COOKIE)?.value ?? null;

    if (!sessionToken) {
      return NextResponse.json(
        {
          ok:    false,
          error: 'Sesi meja Anda telah berakhir. Silakan scan ulang QR meja baru terlebih dahulu.',
          code:  'SESSION_EXPIRED',
        },
        { status: 409 },
      );
    }

    const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc('claim_table', {
      p_branch_id:        (order as any).branch_id,
      p_code:             newTableCode,
      p_token:            sessionToken,
      p_reservation_code: null,
    });

    if (rpcError) {
      console.error('[orders/update-table] claim_table error:', rpcError.message);
      return NextResponse.json(
        { error: 'Gagal memvalidasi meja baru. Silakan coba lagi.' },
        { status: 500 },
      );
    }

    const claimResult = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

    if (!claimResult?.ok) {
      const errCode = claimResult?.code as string;
      const messages: Record<string, string> = {
        TABLE_NOT_FOUND:     'Meja baru tidak ditemukan.',
        TABLE_TAKEN:         'Meja baru sedang dipakai pelanggan lain.',
        TABLE_RESERVED:      'Meja baru sudah dipesan (reservasi).',
        TABLE_RESERVED_SOON: 'Meja baru akan segera dipakai untuk reservasi.',
      };
      return NextResponse.json(
        {
          ok:    false,
          code:  errCode,
          error: messages[errCode] ?? 'Meja baru tidak dapat diklaim.',
        },
        { status: 409 },
      );
    }

    // 4. Update table number on the order
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ table_number: newTableCode })
      .eq('order_code', orderCode)
      .select('id, order_code, customer_name, table_number, items, subtotal, total, payment_method, notes, status, created_at')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success:        true,
      previous_table: (order as any).table_number,
      new_table:      newTableCode,
      order:          updated,
      message:        `Nomor meja pesanan berhasil dipindahkan ke Meja ${newTableCode}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Terjadi kesalahan pada server saat memindahkan meja.' },
      { status: 500 },
    );
  }
}
