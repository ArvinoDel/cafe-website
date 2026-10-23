/**
 * POST /api/reservations
 *
 * Public endpoint: creates a table reservation hold.
 * Business rules and atomic table locking execute in SQL via create_reservation_hold.
 * Preorder pricing is calculated server-side via lib/order-pricing.
 * Reservation code is generated with crypto.randomInt and retried on collision.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import { priceOrderLines, type PricingLine } from '@/lib/order-pricing';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';
import { getClientIp, computeClientIpHash, normalizeIp } from '@/lib/client-ip';
import { checkDbRateLimit } from '@/lib/db-rate-limiter';

// ─── Validation Schema ────────────────────────────────────────────────────────

const ItemLineSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  note: z.string().max(200).nullable().optional(),
  selected_options: z.array(z.any()).nullable().optional(),
});

const ReservationBodySchema = z.object({
  branch_id:        z.string().uuid(),
  table_id:         z.string().uuid(),
  customer_name:    z.string().min(1).max(80).trim(),
  customer_phone:   z.string().min(5).max(30).trim(),
  customer_email:   z.string().email().max(120).trim().nullable().optional(),
  party_size:       z.number().int().min(1).max(50),
  starts_at:        z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().refine((d) => [60, 90, 120, 150, 180].includes(d)).optional().default(120),
  occasion:         z.string().max(100).trim().nullable().optional(),
  notes:            z.string().max(500).trim().nullable().optional(),
  items:            z.array(ItemLineSchema).min(1, 'Pre-order minimal 1 menu wajib dipilih.'),
});

// ─── Code Generator (crypto.randomInt — strictly no Math.random) ─────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Format JSON tidak valid.' }, { status: 400 });
  }

  const parsed = ReservationBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Data reservasi tidak valid.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    branch_id,
    table_id,
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    starts_at,
    duration_minutes,
    occasion,
    notes,
    items,
  } = parsed.data;

  const admin = createAdminClient();

  // 1. Server-price pre-order items if present
  let pricedSnapshot: any[] = [];
  let calculatedPreorderTotal = 0;

  if (items && items.length > 0) {
    const pricingLines: PricingLine[] = items.map((it) => ({
      id: it.id,
      quantity: it.quantity,
      note: it.note ?? null,
      selected_options: it.selected_options ?? null,
    }));

    const pricingResult = await priceOrderLines(admin, branch_id, pricingLines);
    if ('error' in pricingResult) {
      return NextResponse.json(
        { error: pricingResult.error.message, code: (pricingResult.error as any).code },
        { status: pricingResult.error.status },
      );
    }

    pricedSnapshot = pricingResult.snapshot;
    calculatedPreorderTotal = Math.round(pricingResult.total);
  }

  // 2. Resolve or generate owner token cookie
  let ownerToken = req.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
  let isNewOwnerToken = false;
  if (!ownerToken) {
    ownerToken = crypto.randomBytes(24).toString('hex');
    isNewOwnerToken = true;
  }
  const ownerTokenHash = computeTokenHash(ownerToken);

  // 3. Resolve client IP and check DB rate limit
  const rawIp = getClientIp(req);
  const ipLimit = await checkDbRateLimit(`res_create_ip:${normalizeIp(rawIp)}`, 30, 60, admin);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan reservasi dari jaringan ini. Silakan coba lagi nanti.' },
      { status: 429 },
    );
  }
  const ipHash = computeClientIpHash(rawIp);

  // 4. Call create_reservation_hold RPC with retry on CODE_COLLISION (up to 5 attempts, no pre-check SELECT)
  let result: any = null;
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    const { data: rpcData, error: rpcError } = await (admin as any).rpc('create_reservation_hold', {
      p_branch_id:        branch_id,
      p_table_id:         table_id,
      p_code:             code,
      p_customer_name:    customer_name,
      p_customer_phone:   customer_phone,
      p_customer_email:   customer_email ?? null,
      p_party_size:       party_size,
      p_starts_at:        starts_at,
      p_duration_minutes: duration_minutes,
      p_occasion:         occasion ?? null,
      p_notes:            notes ?? null,
      p_items:            pricedSnapshot,
      p_preorder_total:   calculatedPreorderTotal,
      p_owner_token_hash: ownerTokenHash,
      p_ip_hash:          ipHash,
    });

    if (rpcError) {
      console.error('[POST /api/reservations] rpc error:', rpcError.message);
      return NextResponse.json({ error: 'Gagal memproses reservasi di server.' }, { status: 500 });
    }

    result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

    // If collision, retry immediately with next random code
    if (!result?.ok && result?.code === 'CODE_COLLISION') {
      continue;
    }
    break;
  }

  if (!result?.ok) {
    const code = result?.code as string;
    const statusMap: Record<string, number> = {
      TABLE_NOT_FOUND:           404,
      CAPACITY_EXCEEDED:         409,
      RESERVATIONS_DISABLED:     409,
      INVALID_DURATION:          400,
      MIN_LEAD_VIOLATION:        409,
      MAX_DAYS_EXCEEDED:         409,
      OUTSIDE_HOURS:             409,
      EXCEEDS_CLOSING_TIME:      409,
      PREORDER_REQUIRED:         409,
      PREORDER_BELOW_MINIMUM:    409,
      TABLE_CURRENTLY_OCCUPIED:  409,
      TABLE_ALREADY_RESERVED:    409,
      TOO_MANY_HOLDS:            429,
    };

    return NextResponse.json(
      { error: result?.message || 'Gagal membuat reservasi.', code },
      { status: statusMap[code] ?? 400 },
    );
  }

  // 5. Build response and set owner token cookie if newly generated
  const response = NextResponse.json(
    {
      ok: true,
      reservation: {
        id:              result.id,
        code:            result.code,
        status:          result.status,
        starts_at:       result.starts_at,
        ends_at:         result.ends_at,
        hold_expires_at: result.hold_expires_at,
        table_code:      result.table_code,
        table_label:     result.table_label,
      },
    },
    { status: 201 },
  );

  if (isNewOwnerToken) {
    response.cookies.set(RESERVATION_OWNER_COOKIE, ownerToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   30 * 24 * 60 * 60, // 30 days
    });
  }

  return response;
}
