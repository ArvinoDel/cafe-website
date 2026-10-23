/**
 * POST /api/reservations/[code]/reschedule
 *
 * Public endpoint: customer reschedules their reservation to a new table/time.
 * Body: { new_starts_at: string, new_table_id: string, verifier?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';
import { getClientIp, computeClientIpHash } from '@/lib/client-ip';

const BodySchema = z.object({
  new_starts_at: z.string().datetime({ offset: true }),
  new_table_id:  z.string().uuid(),
  verifier:      z.string().min(1).max(100).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upperCode = code?.trim().toUpperCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Format JSON tidak valid.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Data tidak valid.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { new_starts_at, new_table_id } = parsed.data;

  let verifier = parsed.data.verifier?.trim();
  if (!verifier) {
    const ownerToken = req.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
    if (ownerToken) {
      verifier = computeTokenHash(ownerToken);
    }
  }

  if (!verifier) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  const admin = createAdminClient();
  const rawIp = getClientIp(req);
  const ipHash = computeClientIpHash(rawIp);

  const { data: rpcData, error } = await (admin as any).rpc('reschedule_reservation', {
    p_code:          upperCode,
    p_verifier:      verifier,
    p_new_starts_at: new_starts_at,
    p_new_table_id:  new_table_id,
    p_ip_hash:       ipHash,
  });

  if (error) {
    console.error('[POST /api/reservations/[code]/reschedule] rpc error:', error.message);
    return NextResponse.json({ error: 'Gagal menjadwalkan ulang reservasi.' }, { status: 500 });
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

  if (!result?.ok) {
    const errCode = result?.code;
    if (errCode === 'CODE_LOCKED') {
      return NextResponse.json({ error: result?.message, code: 'CODE_LOCKED' }, { status: 429 });
    }
    if (errCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
    }
    if (errCode === 'TABLE_ALREADY_RESERVED' || errCode === 'TABLE_CURRENTLY_OCCUPIED' || errCode === 'OUTSIDE_HOURS' || errCode === 'MIN_LEAD_VIOLATION' || errCode === 'MAX_DAYS_EXCEEDED' || errCode === 'CAPACITY_EXCEEDED') {
      return NextResponse.json({ error: result?.message || 'Meja atau jadwal baru tidak tersedia.', code: errCode }, { status: 409 });
    }
    return NextResponse.json({ error: result?.message || 'Gagal menjadwalkan ulang reservasi.' }, { status: 400 });
  }

  return NextResponse.json({
    ok:         true,
    code:       result.code,
    starts_at:  result.starts_at,
    ends_at:    result.ends_at,
    table_code: result.table_code,
  });
}
