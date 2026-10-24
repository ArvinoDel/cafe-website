/**
 * POST /api/tables/activity
 *
 * Extends an unupgraded active soft-hold session upon user activity:
 * - Reads `table_session_token` cookie.
 * - Validates format: /^[A-Za-z0-9_-]{32,64}$/.
 * - Rate-limited: max once per 60s per token.
 * - Calls `extend_soft_hold_on_activity(p_token)` Postgres RPC.
 * - Extends expires_at up to started_at + claim_soft_hold_max_minutes (default 45m),
 *   never exceeding reservation buffers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TABLE_SESSION_COOKIE, resolveAdminEnv } from '@/lib/table-session-server';
import { createAdminClient } from '@/lib/supabase-server';
import { checkDbRateLimit } from '@/lib/db-rate-limiter';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{32,64}$/;

export async function POST(request: NextRequest) {
  try {
    const rawCookieToken = request.cookies.get(TABLE_SESSION_COOKIE)?.value ?? null;
    if (!rawCookieToken || !TOKEN_REGEX.test(rawCookieToken)) {
      return NextResponse.json(
        { ok: false, error: 'Sesi meja tidak valid atau belum dipilih.' },
        { status: 400 },
      );
    }

    const env = resolveAdminEnv();
    const supabaseAdmin = createAdminClient({ env });

    // Rate limit: max once per 60s per token
    const tokenLimit = await checkDbRateLimit(
      `activity_token:${rawCookieToken}`,
      1,
      60,
      supabaseAdmin,
      true,
    );

    if (!tokenLimit.allowed) {
      // Return 200 with throttled flag so client silently succeeds without console spam
      return NextResponse.json({
        ok: true,
        throttled: true,
        message: 'Aktivitas dicatat (dibatasi 1x per 60 detik).',
      });
    }

    // Call extend_soft_hold_on_activity RPC
    const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc(
      'extend_soft_hold_on_activity',
      { p_token: rawCookieToken },
    );

    if (rpcError) {
      console.error('[tables/activity] RPC error:', rpcError.message);
      return NextResponse.json(
        { ok: false, error: 'Gagal memperpanjang sesi meja.' },
        { status: 500 },
      );
    }

    const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

    return NextResponse.json({
      ok:                result?.ok ?? true,
      extended:          result?.extended ?? false,
      code:              result?.code,
      expires_at:        result?.expires_at,
      remaining_seconds: result?.remaining_seconds,
    });
  } catch (err: any) {
    console.error('[tables/activity] unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: 'Terjadi kesalahan sistem.' },
      { status: 500 },
    );
  }
}
