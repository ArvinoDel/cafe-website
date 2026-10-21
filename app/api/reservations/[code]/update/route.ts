/**
 * PATCH /api/reservations/[code]/update
 *
 * Public endpoint: customer updates notes or occasion for their reservation.
 * Body: { notes?: string, occasion?: string, verifier?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';

const BodySchema = z.object({
  notes:    z.string().max(500).nullable().optional(),
  occasion: z.string().max(100).nullable().optional(),
  verifier: z.string().min(1).max(100).optional(),
});

export async function PATCH(
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

  const { notes, occasion } = parsed.data;

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

  const { data: rpcData, error } = await (admin as any).rpc('update_reservation_details', {
    p_code:     upperCode,
    p_verifier: verifier,
    p_notes:    notes ?? null,
    p_occasion: occasion ?? null,
  });

  if (error) {
    console.error('[PATCH /api/reservations/[code]/update] rpc error:', error.message);
    return NextResponse.json({ error: 'Gagal memperbarui reservasi.' }, { status: 500 });
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

  if (!result?.ok) {
    const errCode = result?.code;
    if (errCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
    }
    return NextResponse.json({ error: result?.message || 'Gagal memperbarui reservasi.' }, { status: 400 });
  }

  return NextResponse.json({
    ok:       true,
    code:     result.code,
    notes:    result.notes,
    occasion: result.occasion,
  });
}
