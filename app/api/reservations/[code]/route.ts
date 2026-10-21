/**
 * GET /api/reservations/[code]
 *
 * Public endpoint: lookup reservation details by code + verifier.
 * Verifier may be provided via:
 *   - ?v=<last4_or_token> or ?verifier=<last4_or_token> query parameter
 *   - x-reservation-verifier header
 *   - reservation_owner_token httpOnly cookie
 *
 * Security:
 *   - Calls SQL RPC lookup_reservation which verifies phone last 4 or owner_token_hash.
 *   - Returns uniform 404 for wrong code or wrong verifier.
 *   - Never returns payment_proof_url or customer phone.
 *   - Per-IP rate limiting (60 req / min).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';

// ─── Rate limiting (in-memory per-IP sliding window) ─────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60; // 60 lookups/min per IP

type RateLimitEntry = { count: number; windowStart: number };
const ipRateMap = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string, now: number): boolean {
  if (ipRateMap.size > 1000) {
    ipRateMap.forEach((v, k) => {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) ipRateMap.delete(k);
    });
  }
  const entry = ipRateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRateMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upperCode = code?.trim().toUpperCase();

  if (!upperCode || upperCode.length < 4 || upperCode.length > 12) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  // Rate limiting check
  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  if (isRateLimited(rawIp, Date.now())) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Silakan tunggu sebentar.' },
      { status: 429 },
    );
  }

  // Extract verifier from query, header, or owner token cookie
  const { searchParams } = req.nextUrl;
  let verifier =
    searchParams.get('v')?.trim() ||
    searchParams.get('verifier')?.trim() ||
    req.headers.get('x-reservation-verifier')?.trim();

  if (!verifier) {
    const ownerToken = req.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
    if (ownerToken) {
      verifier = computeTokenHash(ownerToken);
    }
  }

  if (!verifier) {
    // Missing verifier -> return uniform 404 to prevent enumeration
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  const admin = createAdminClient();

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
      total:                  result.total,
      hold_countdown_seconds: result.hold_countdown_seconds,
      refund_status:          result.refund_status,
    },
  });
}
