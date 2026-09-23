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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codesParam = searchParams.get('codes');
  const codeParam = searchParams.get('code');

  const env = resolveEnv();
  const supabaseAdmin = createAdminClient({ env });

  // Batch lookup
  if (codesParam) {
    const list = Array.from(
      new Set(
        codesParam
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      ),
    ).slice(0, 30);

    if (list.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_code, customer_name, table_number, items, subtotal, total, payment_method, notes, status, created_at')
      .in('order_code', list)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: orders || [] });
  }

  // Single lookup
  const code = (codeParam || '').trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'Kode pesanan wajib diisi.' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_code, customer_name, table_number, items, subtotal, total, payment_method, notes, status, created_at')
    .eq('order_code', code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: 'Pesanan tidak ditemukan.' }, { status: 404 });
  }

  return NextResponse.json({ order });
}
