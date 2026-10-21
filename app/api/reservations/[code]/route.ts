/**
 * GET /api/reservations/[code]
 *
 * Public endpoint: customer looks up their reservation by the 8-char code.
 * Returns a safe subset of fields — no internal IDs leaked.
 *
 * Success 200:
 *   { reservation: { code, status, starts_at, ends_at, customer_name,
 *                    party_size, table_code, table_label, hold_expires_at } }
 *
 * Errors:
 *   404 — code not found
 *   500 — server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upperCode = code.trim().toUpperCase();

  if (!upperCode || upperCode.length < 4 || upperCode.length > 10) {
    return NextResponse.json({ error: 'Kode tidak valid.' }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('reservations')
    .select(
      'code, status, starts_at, ends_at, customer_name, party_size, ' +
      'hold_expires_at, notes, preorder_total, payment_proof_url, ' +
      'table:tables(code, label)'
    )
    .eq('code', upperCode)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/reservations/[code]]', error);
    return NextResponse.json({ error: 'Terjadi kesalahan.' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Kode reservasi tidak ditemukan.' }, { status: 404 });
  }

  return NextResponse.json({ reservation: data });
}
