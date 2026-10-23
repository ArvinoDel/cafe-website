/**
 * POST /api/reservations/[code]/check-in
 *
 * Public arrival check-in endpoint: customer arrives at the cafe, checks in with
 * their reservation code and verifier (owner cookie or phone last 4).
 * Replaces the legacy walk-in claim bypass.
 *
 * Execution:
 *   1. Calls check_in_reservation RPC: releases other sessions, creates table_session
 *      with expires_at = reservation.ends_at, sets status = 'seated'.
 *   2. If reservation included pre-ordered items and no order exists yet, creates the
 *      kitchen order in orders table.
 *   3. Sets table_session_token cookie on the response.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  TABLE_SESSION_COOKIE,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';
import { getClientIp, computeClientIpHash } from '@/lib/client-ip';
import { checkDbRateLimit } from '@/lib/db-rate-limiter';

const BodySchema = z.object({
  verifier: z.string().min(1).max(100).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upperCode = code?.trim().toUpperCase();

  const rawIp = getClientIp(req);
  const admin = createAdminClient();

  const ipLimit = await checkDbRateLimit(`res_checkin_ip:${rawIp}`, 30, 60, admin);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan check-in. Tunggu sebentar.' }, { status: 429 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }

  const parsed = BodySchema.safeParse(body);
  let verifier =
    parsed.success && parsed.data.verifier?.trim()
      ? parsed.data.verifier.trim()
      : req.headers.get('x-reservation-verifier')?.trim();

  if (!verifier) {
    const ownerToken = req.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
    if (ownerToken) {
      verifier = computeTokenHash(ownerToken);
    }
  }

  if (!verifier) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  // Resolve or generate table_session_token cookie
  let sessionToken = req.cookies.get(TABLE_SESSION_COOKIE)?.value;
  let isNewSessionToken = false;
  if (!sessionToken) {
    sessionToken = crypto.randomBytes(32).toString('hex');
    isNewSessionToken = true;
  }

  const ipHash = computeClientIpHash(rawIp);
  const { data: rpcData, error } = await (admin as any).rpc('check_in_reservation', {
    p_code:     upperCode,
    p_verifier: verifier,
    p_token:    sessionToken,
    p_ip_hash:  ipHash,
  });

  if (error) {
    console.error('[POST /api/reservations/[code]/check-in] rpc error:', error.message);
    return NextResponse.json({ error: 'Gagal melakukan check-in reservasi.' }, { status: 500 });
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
    if (errCode === 'NOT_CONFIRMED' || errCode === 'CHECKIN_TOO_EARLY' || errCode === 'CHECKIN_EXPIRED') {
      return NextResponse.json({ error: result?.message, code: errCode }, { status: 400 });
    }
    return NextResponse.json({ error: result?.message || 'Check-in gagal.' }, { status: 400 });
  }

  const reservation = result.reservation;

  // If pre-ordered items exist, create the kitchen order through the SAME internal function as /api/orders/create
  let createdOrder: any = null;
  let orderError: string | null = null;
  if (reservation?.items && Array.isArray(reservation.items) && reservation.items.length > 0) {
    const { createOrderInternal } = await import('@/lib/orders-server');
    const orderResult = await createOrderInternal(admin, {
      customerName:   reservation.customer_name || 'Tamu Reservasi',
      tableNumber:    result.table_code,
      branchId:       result.branch_id,
      items:          reservation.items,
      paymentMethod:  reservation.payment_method === 'cash' ? 'cash' : 'qris',
      paymentStatus:  'paid',
      notes:          `[LUNAS - Reservasi ${upperCode}]` + (reservation.notes ? ` ${reservation.notes}` : ''),
      idempotencyKey: `reservation_${reservation.id}`,
      sessionToken,
    });

    if (orderResult.ok) {
      createdOrder = orderResult.order;
    } else {
      console.error('[check-in] Kitchen order auto-create error:', orderResult.error);
      orderError = orderResult.error || 'Gagal membuat pesanan dapur secara otomatis.';
      await admin
        .from('reservations')
        .update({ needs_kitchen_order: true })
        .eq('id', reservation.id);
    }
  }

  // Response with table session cookie
  const response = NextResponse.json({
    ok:           true,
    status:       'seated',
    session_id:   result.session_id,
    table_code:   result.table_code,
    table_label:  result.table_label,
    order:        createdOrder,
    order_error:  orderError ?? undefined,
    message:      `Check-in berhasil! Meja ${result.table_code} aktif.`,
  });

  response.cookies.set(TABLE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   30 * 24 * 60 * 60,
  });

  return response;
}
