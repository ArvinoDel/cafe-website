/**
 * POST /api/tables/claim
 *
 * Claims a table for the requesting customer (Soft Hold).
 * - Reads or generates the httpOnly session token cookie.
 * - Computes deterministic HMAC ip_hash from client IP.
 * - Rate limits per IP and per cookie/token.
 * - Calls the atomic `claim_table` Postgres RPC via the service-role admin client.
 * - Catches Postgres 23505 unique_violation and maps to clean 409.
 * - Maps TOO_MANY_HOLDS to 429.
 * - On success, sets / refreshes the httpOnly `table_session_token` cookie.
 * - Returns session object with `upgraded: boolean`.
 *
 * Request body:
 *   {
 *     branch_id?: string (UUID) — required when the site has multiple branches
 *     code:       string        — table code, e.g. "A-1"
 *   }
 *
 * Success 200:
 *   { ok: true, session: { tableCode, tableLabel, tableSeats, branchId, expiresAt, startedAt, remainingSeconds, isExisting, upgraded } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  TABLE_SESSION_COOKIE,
  newSessionToken,
  buildSessionCookieOptions,
  resolveAdminEnv,
} from '@/lib/table-session-server';
import { getClientIp, computeClientIpHash, normalizeIp } from '@/lib/client-ip';
import { checkDbRateLimit } from '@/lib/db-rate-limiter';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const ClaimSchema = z.object({
  branch_id:        z.string().uuid('Branch ID tidak valid.').nullable().optional(),
  code:             z.string().trim().min(1, 'Kode meja wajib diisi.').max(20, 'Kode meja terlalu panjang.'),
  reservation_code: z.string().trim().optional(),
});

// ─── Helper: resolve single branch when branch_id is omitted ─────────────────

async function resolveBranchId(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  clientBranchId: string | null | undefined,
  tableCode?: string,
): Promise<{ branchId: string } | { error: NextResponse }> {
  if (clientBranchId) return { branchId: clientBranchId };

  // If table code was provided, check if it uniquely belongs to one branch
  if (tableCode) {
    try {
      const { data: matchingTables } = await (supabaseAdmin as any)
        .from('tables')
        .select('branch_id')
        .eq('code', tableCode.trim().toUpperCase())
        .eq('is_active', true);

      const matches = (matchingTables ?? []) as { branch_id: string }[];
      if (matches.length === 1) {
        return { branchId: matches[0].branch_id };
      }
    } catch {
      // Continue to branch query fallback
    }
  }

  const { data: rows, error } = await (supabaseAdmin as any)
    .from('branches')
    .select('id');

  if (error) {
    return {
      error: NextResponse.json(
        { ok: false, error: 'Gagal memverifikasi cabang.' },
        { status: 500 },
      ),
    };
  }

  const list = (rows ?? []) as { id: string }[];
  if (list.length === 0) {
    return {
      error: NextResponse.json(
        { ok: false, error: 'Tidak ada cabang yang terdaftar.' },
        { status: 400 },
      ),
    };
  }
  if (list.length > 1) {
    return {
      error: NextResponse.json(
        { ok: false, error: 'Silakan scan QR meja terlebih dahulu (cabang tidak dapat ditentukan otomatis).' },
        { status: 400 },
      ),
    };
  }

  return { branchId: list[0].id };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Authoritative client IP & DB-backed rate limiting
    const rawIp = getClientIp(request);
    const existingToken = request.cookies.get(TABLE_SESSION_COOKIE)?.value ?? null;
    const token = existingToken || newSessionToken();

    const env = resolveAdminEnv();
    const supabaseAdmin = createAdminClient({ env });

    try {
      const ipLimit = await checkDbRateLimit(`claim_ip:${normalizeIp(rawIp)}`, 60, 60, supabaseAdmin, true);
      if (!ipLimit.allowed) {
        return NextResponse.json(
          { ok: false, code: 'RATE_LIMITED', error: 'Terlalu banyak permintaan klaim dari jaringan ini. Tunggu sebentar ya.' },
          { status: 429 },
        );
      }

      const tokenLimit = await checkDbRateLimit(`claim_token:${token}`, 20, 60, supabaseAdmin, true);
      if (!tokenLimit.allowed) {
        return NextResponse.json(
          { ok: false, code: 'RATE_LIMITED', error: 'Terlalu banyak permintaan klaim meja. Silakan coba lagi sebentar.' },
          { status: 429 },
        );
      }
    } catch (rateErr) {
      console.error('[tables/claim] rate limiter threw, failing closed:', rateErr);
      return NextResponse.json(
        { ok: false, code: 'RATE_LIMITED', error: 'Terlalu banyak permintaan klaim meja. Silakan coba lagi sebentar.' },
        { status: 429 },
      );
    }

    // 2. Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const parsed = ClaimSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Input tidak valid.';
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const { branch_id, code } = parsed.data;

    // 3. Compute ip_hash
    const ipHash = computeClientIpHash(rawIp);

    // 4. Resolve branch
    const branchResult = await resolveBranchId(supabaseAdmin as any, branch_id ?? null, code);
    if ('error' in branchResult) return branchResult.error;
    const { branchId } = branchResult;

    // 5. Call claim_table RPC
    const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc('claim_table', {
      p_branch_id: branchId,
      p_code:      code.trim().toUpperCase(),
      p_token:     token,
      p_ip_hash:   ipHash,
    });

    if (rpcError) {
      // Catch Postgres 23505 (unique_violation) from concurrent claims on same token or table
      if (rpcError.code === '23505') {
        return NextResponse.json(
          {
            ok:    false,
            code:  'TABLE_TAKEN',
            error: 'Meja ini sedang dipakai atau klaim lain sedang diproses. Silakan coba lagi.',
          },
          { status: 409 },
        );
      }

      console.error('[tables/claim] claim_table rpc error:', rpcError.message);
      return NextResponse.json(
        { ok: false, error: 'Terjadi kesalahan saat mengklaim meja. Silakan coba lagi.' },
        { status: 500 },
      );
    }

    const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

    // 6. Map RPC result to HTTP response
    if (!result?.ok) {
      const errCode = result?.code as string;

      if (errCode === 'TOO_MANY_HOLDS') {
        return NextResponse.json(
          {
            ok:    false,
            code:  'TOO_MANY_HOLDS',
            error: 'Terlalu banyak meja yang ditahan dari perangkat atau jaringan ini. Selesaikan pesanan Anda terlebih dahulu ya.',
          },
          { status: 429 },
        );
      }

      const errorMessages: Record<string, string> = {
        TABLE_NOT_FOUND:     'Meja tidak ditemukan atau tidak aktif.',
        TABLE_TAKEN:         'Meja ini sedang dipakai pelanggan lain.',
        TABLE_RESERVED:      'Meja ini sudah dipesan untuk reservasi.',
        TABLE_RESERVED_SOON: 'Meja ini akan segera dipakai untuk reservasi.',
      };

      const httpStatus = errCode === 'TABLE_NOT_FOUND' ? 404 : 409;

      return NextResponse.json(
        {
          ok:              false,
          code:            errCode,
          error:           errorMessages[errCode] ?? 'Meja tidak dapat diklaim.',
          starts_at:       result?.starts_at ?? undefined,
          ends_at:         result?.ends_at ?? undefined,
          available_until: result?.available_until ?? undefined,
        },
        { status: httpStatus },
      );
    }

    // 7. Success: build response with session info
    const sess = result.session;
    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(sess.expires_at).getTime() - Date.now()) / 1000),
    );

    const responseBody = {
      ok:         true,
      isExisting: !!result.is_existing,
      session: {
        tableCode:        sess.table_code,
        tableLabel:       sess.table_label ?? null,
        branchId:         sess.branch_id,
        expiresAt:        sess.expires_at,
        startedAt:        sess.started_at,
        remainingSeconds,
        upgraded:         !!sess.upgraded,
      },
    };

    // 8. Set httpOnly cookie
    const response = NextResponse.json(responseBody, { status: 200 });
    response.cookies.set(TABLE_SESSION_COOKIE, token, buildSessionCookieOptions());

    return response;
  } catch (err: any) {
    console.error('[tables/claim] unhandled error in claim handler:', err);
    return NextResponse.json(
      {
        ok:    false,
        code:  'INTERNAL_ERROR',
        error: 'Terjadi kesalahan sistem saat memproses meja. Silakan coba lagi sebentar.',
      },
      { status: 500 },
    );
  }
}
