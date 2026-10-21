/**
 * POST /api/reservations/[code]/cancel
 *
 * Public endpoint: customer cancels their reservation.
 * Allowed until reservation_cancel_lead_minutes before starts_at.
 * If paid, refund_status is marked 'needs_refund'.
 *
 * Body: { verifier?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';

const BodySchema = z.object({
  verifier: z.string().min(1).max(100).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upperCode = code?.trim().toUpperCase();

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }

  const parsed = BodySchema.safeParse(body);
  let verifier = parsed.success ? parsed.data.verifier?.trim() : undefined;

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

  const { data: rpcData, error } = await (admin as any).rpc('cancel_reservation', {
    p_code:     upperCode,
    p_verifier: verifier,
  });

  if (error) {
    console.error('[POST /api/reservations/[code]/cancel] rpc error:', error.message);
    return NextResponse.json({ error: 'Gagal membatalkan reservasi.' }, { status: 500 });
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

  if (!result?.ok) {
    const errCode = result?.code;
    if (errCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
    }
    if (errCode === 'TOO_LATE_TO_CANCEL') {
      return NextResponse.json({ error: result?.message || 'Batas waktu pembatalan telah lewat.' }, { status: 409 });
    }
    return NextResponse.json({ error: result?.message || 'Gagal membatalkan reservasi.' }, { status: 400 });
  }

  return NextResponse.json({
    ok:            true,
    code:          result.code,
    status:        result.status,
    refund_status: result.refund_status,
  });
}
