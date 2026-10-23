import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import {
  RESERVATION_OWNER_COOKIE,
  computeTokenHash,
  resolveAdminEnv,
} from '@/lib/table-session-server';
import { getClientIp, normalizeIp } from '@/lib/client-ip';
import { checkDbRateLimit } from '@/lib/db-rate-limiter';

/**
 * GET /api/reservations/lookup
 *
 * Owner-scoped reservation listing:
 * - Requires reservation_owner_token httpOnly cookie.
 * - Returns only reservations whose owner_token_hash matches the cookie hash.
 * - Strictly NO code-only access (cross-device access uses GET /api/reservations/[code] with verifier).
 * - Distributed DB rate limited (60 req/min per IP).
 * - Returns only the fields required by the customer orders/reservations list page.
 */
export async function GET(request: NextRequest) {
  const env = resolveAdminEnv();
  const admin = createAdminClient({ env });

  // 1. Rate limiting per client IP
  const rawIp = getClientIp(request);
  const ipLimit = await checkDbRateLimit(`res_lookup_list_ip:${normalizeIp(rawIp)}`, 60, 60, admin);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Silakan tunggu sebentar.' },
      { status: 429 },
    );
  }

  // 2. Require owner token cookie: no cookie -> return empty array (no code-only access)
  const ownerToken = request.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
  if (!ownerToken) {
    return NextResponse.json({ ok: true, reservations: [] });
  }

  const ownerTokenHash = computeTokenHash(ownerToken);

  // 3. Optional code filtering within the owner's reservations
  const { searchParams } = new URL(request.url);
  const rawCodes = searchParams.get('codes') || searchParams.get('code');
  let codes: string[] = [];
  if (rawCodes) {
    codes = rawCodes
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length >= 4 && c.length <= 15)
      .slice(0, 30);
  }

  // 4. Query only reservations matching this owner's token hash
  let query = admin
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
    .eq('owner_token_hash', ownerTokenHash);

  if (codes.length > 0) {
    query = query.in('code', codes);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[GET /api/reservations/lookup] error:', error.message);
    return NextResponse.json({ ok: false, error: 'Gagal memuat reservasi.' }, { status: 500 });
  }

  // 5. Return only fields needed by the list page
  const reservations = (data || []).map((r: any) => {
    const tableObj = Array.isArray(r.tables) ? r.tables[0] : r.tables;
    return {
      id:            r.id,
      code:          r.code,
      table_code:    tableObj?.code || 'Meja',
      table_label:   tableObj?.label || null,
      starts_at:     r.starts_at,
      ends_at:       r.ends_at,
      party_size:    r.party_size,
      customer_name: r.customer_name,
      total:         r.preorder_total || 0,
      status:        r.status,
      notes:         r.notes,
      occasion:      r.occasion,
      created_at:    r.created_at,
    };
  });

  return NextResponse.json({ ok: true, reservations });
}
