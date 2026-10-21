/**
 * /api/reservations/[code]
 *
 * Public endpoint: lookup reservation details by code + verifier.
 * Verifier may be provided via:
 *   - x-reservation-verifier header (preferred)
 *   - POST body: { verifier: "..." }
 *   - reservation_owner_token httpOnly cookie
 *   - ?verifier= query parameter (fallback)
 *
 * Security:
 *   - Calls SQL RPC lookup_reservation which verifies phone last 4 or owner_token_hash.
 *   - Throttles wrong verifier guesses (locks code for 15 min on 5 failed attempts).
 *   - Returns uniform 404 for wrong code or wrong verifier.
 *   - Never returns payment_proof_url or customer phone.
 *   - Distributed DB rate limiting (60 req / min per IP).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';
import { getClientIp } from '@/lib/client-ip';
import { checkDbRateLimit } from '@/lib/db-rate-limiter';

async function handleLookup(
  req: NextRequest,
  params: { code: string },
  explicitVerifier?: string | null,
) {
  const upperCode = params.code?.trim().toUpperCase();

  if (!upperCode || upperCode.length < 4 || upperCode.length > 12) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  const rawIp = getClientIp(req);
  const admin = createAdminClient();

  const ipLimit = await checkDbRateLimit(`res_lookup_ip:${rawIp}`, 60, 60, admin);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Silakan tunggu sebentar.' },
      { status: 429 },
    );
  }

  // Extract verifier: explicit argument > header > cookie > query param fallback
  let verifier =
    explicitVerifier?.trim() ||
    req.headers.get('x-reservation-verifier')?.trim();

  if (!verifier) {
    const ownerToken = req.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
    if (ownerToken) {
      verifier = computeTokenHash(ownerToken);
    }
  }

  if (!verifier) {
    const { searchParams } = req.nextUrl;
    verifier = searchParams.get('verifier')?.trim() || searchParams.get('v')?.trim();
  }

  if (!verifier) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  const { data: rpcData, error } = await (admin as any).rpc('lookup_reservation', {
    p_code:     upperCode,
    p_verifier: verifier,
  });

  if (error) {
    console.error('[GET /api/reservations/[code]] rpc error:', error.message);
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

  if (!result?.ok) {
    if (result?.code === 'CODE_LOCKED') {
      return NextResponse.json({ error: result?.message, code: 'CODE_LOCKED' }, { status: 429 });
    }
    // Uniform 404 for wrong code or wrong verifier
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  return NextResponse.json({
    reservation: {
      code:                   result.code,
      status:                 result.status,
      starts_at:              result.starts_at,
      ends_at:                result.ends_at,
      duration_minutes:       result.duration_minutes,
      table_code:             result.table_code,
      party_size:             result.party_size,
      occasion:               result.occasion,
      notes:                  result.notes,
      items:                  result.items,
      total:                  result.total,
      preorder_total:         result.total,
      hold_countdown_seconds: result.hold_countdown_seconds,
      refund_status:          result.refund_status,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  return handleLookup(req, await params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }
  return handleLookup(req, await params, body?.verifier);
}
