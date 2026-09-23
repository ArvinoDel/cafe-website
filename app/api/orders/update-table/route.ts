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
  if (secretKey) env.secretKeys = { default: secretKey };
  return env;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderCode = String(body?.order_code || '').trim().toUpperCase();
    const newTable = String(body?.new_table || '').trim().toUpperCase();

    if (!orderCode) {
      return NextResponse.json(
        { error: 'Kode pesanan wajib diisi.' },
        { status: 400 },
      );
    }

    if (!newTable) {
      return NextResponse.json(
        { error: 'Nomor meja baru wajib diisi.' },
        { status: 400 },
      );
    }

    const env = resolveEnv();
    const supabaseAdmin = createAdminClient({ env });

    // 1. Fetch current order
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_code, customer_name, table_number, status')
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
    if (!movableStatuses.includes(order.status)) {
      const statusLabels: Record<string, string> = {
        ready: 'Siap Diantar',
        completed: 'Selesai',
        cancelled: 'Dibatalkan',
      };
      const label = statusLabels[order.status] || order.status;
      return NextResponse.json(
        {
          error: `Pesanan sudah dalam status "${label}" dan tidak dapat dipindahkan mejanya. Silakan hubungi barista secara langsung.`,
        },
        { status: 400 },
      );
    }

    // 3. Update table number in database
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ table_number: newTable })
      .eq('order_code', orderCode)
      .select('id, order_code, customer_name, table_number, items, subtotal, total, payment_method, notes, status, created_at')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      previous_table: order.table_number,
      new_table: newTable,
      order: updated,
      message: `Nomor meja pesanan berhasil dipindahkan ke Meja ${newTable}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Terjadi kesalahan pada server saat memindahkan meja.' },
      { status: 500 },
    );
  }
}
