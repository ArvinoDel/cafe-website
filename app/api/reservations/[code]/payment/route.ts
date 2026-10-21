/**
 * POST /api/reservations/[code]/payment
 *
 * Public endpoint: customer attaches payment proof for their pending reservation.
 * Transitions status from pending_payment -> awaiting_confirmation.
 * Extends hold once by 30 minutes.
 *
 * Body: { proof_path: string, verifier?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';

const BodySchema = z.object({
  proof_path:         z.string().max(500).nullish(),
  payment_proof_path: z.string().max(500).nullish(),
  verifier:           z.string().min(1).max(100).optional(),
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

  const proofPath = parsed.data.proof_path ?? parsed.data.payment_proof_path ?? null;

  // Resolve verifier: provided in body, or owner token cookie
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

  const { data: rpcData, error } = await (admin as any).rpc('claim_payment', {
    p_code:       upperCode,
    p_verifier:   verifier,
    p_proof_path: proofPath,
  });

  if (error) {
    console.error('[POST /api/reservations/[code]/payment] rpc error:', error.message);
    return NextResponse.json({ error: 'Gagal memproses bukti pembayaran.' }, { status: 500 });
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

  if (!result?.ok) {
    const errCode = result?.code;
    if (errCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
    }
    if (errCode === 'HOLD_EXPIRED') {
      return NextResponse.json({ error: result?.message || 'Waktu hold pembayaran telah habis.' }, { status: 409 });
    }
    return NextResponse.json({ error: result?.message || 'Gagal klaim pembayaran.' }, { status: 400 });
  }

  return NextResponse.json({
    ok:              true,
    code:            result.code,
    status:          result.status,
    hold_expires_at: result.hold_expires_at,
  });
}
