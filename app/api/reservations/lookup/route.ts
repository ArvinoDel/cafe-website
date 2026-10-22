import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { resolveAdminEnv } from '@/lib/table-session-server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawCodes = searchParams.get('codes') || searchParams.get('code');

  if (!rawCodes) {
    return NextResponse.json({ ok: true, reservations: [] });
  }

  const codes = rawCodes
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length >= 4 && c.length <= 15)
    .slice(0, 30);

  if (codes.length === 0) {
    return NextResponse.json({ ok: true, reservations: [] });
  }

  const env = resolveAdminEnv();
  const admin = createAdminClient({ env });

  const { data, error } = await admin
    .from('reservations')
    .select(`
      id,
      code,
      status,
      starts_at,
      ends_at,
      party_size,
      customer_name,
      preorder_total,
      notes,
      occasion,
      created_at,
      tables (
        code,
        label
      )
    `)
    .in('code', codes)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/reservations/lookup] error:', error.message);
    return NextResponse.json({ ok: false, error: 'Gagal memuat reservasi.' }, { status: 500 });
  }

  const reservations = (data || []).map((r: any) => {
    const tableObj = Array.isArray(r.tables) ? r.tables[0] : r.tables;
    return {
      id:            r.id,
      code:          r.code,
      status:        r.status,
      starts_at:     r.starts_at,
      ends_at:       r.ends_at,
      party_size:    r.party_size,
      customer_name: r.customer_name,
      total:         r.preorder_total || 0,
      table_code:    tableObj?.code || 'Meja',
      table_label:   tableObj?.label || null,
      notes:         r.notes,
      occasion:      r.occasion,
      created_at:    r.created_at,
    };
  });

  return NextResponse.json({ ok: true, reservations });
}
