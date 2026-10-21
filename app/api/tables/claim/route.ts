/**
 * POST /api/tables/claim
 *
 * Claims a table for the requesting customer.
 * - Reads or generates the httpOnly session token cookie.
 * - Calls the atomic `claim_table` Postgres RPC via the service-role admin client.
 * - On success, sets / refreshes the httpOnly `table_session_token` cookie.
 * - The session_token is NEVER exposed to JavaScript — it lives only in the cookie.
 *
 * Request body:
 *   {
 *     branch_id?:        string (UUID)   — required when the site has multiple branches
 *     code:              string          — table code, e.g. "A-1"
 *     reservation_code?: string          — 8-char reservation code if the table is reserved
 *   }
 *
 * Success 200:
 *   { ok: true, session: { tableCode, tableLabel, tableSeats, branchId, expiresAt, startedAt, remainingSeconds, isExisting } }
 *
 * Error responses:
 *   400 — missing/invalid body
 *   404 — TABLE_NOT_FOUND
 *   409 — TABLE_TAKEN | TABLE_RESERVED | TABLE_RESERVED_SOON
 *   500 — server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import type { SupabaseEnv } from '@supabase/server';
import {
  TABLE_SESSION_COOKIE,
  newSessionToken,
  buildSessionCookieOptions,
  resolveAdminEnv,
} from '@/lib/table-session-server';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const ClaimSchema = z.object({
  branch_id:        z.string().uuid('Branch ID tidak valid.').optional(),
  code:             z.string().trim().min(1, 'Kode meja wajib diisi.').max(20, 'Kode meja terlalu panjang.'),
  reservation_code: z.string().trim().min(1).max(10).optional(),
});

// ─── Helper: resolve single branch when branch_id is omitted ─────────────────

async function resolveBranchId(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  clientBranchId: string | undefined,
): Promise<{ branchId: string } | { error: NextResponse }> {
  if (clientBranchId) return { branchId: clientBranchId };

  const { data: rows, error } = await supabaseAdmin
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
  // 1. Parse body
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

  const { branch_id, code, reservation_code } = parsed.data;

  // 2. Get or generate session token from cookie
  const existingToken = request.cookies.get(TABLE_SESSION_COOKIE)?.value ?? null;
  const token = existingToken || newSessionToken();

  // 3. Build admin client
  const env          = resolveAdminEnv();
  const supabaseAdmin = createAdminClient({ env });

  // 4. Resolve branch
  const branchResult = await resolveBranchId(supabaseAdmin as any, branch_id);
  if ('error' in branchResult) return branchResult.error;
  const { branchId } = branchResult;

  // 5. Call claim_table RPC
  const { data: rpcData, error: rpcError } = await (supabaseAdmin as any).rpc('claim_table', {
    p_branch_id:        branchId,
    p_code:             code.trim().toUpperCase(),
    p_token:            token,
    p_reservation_code: reservation_code?.trim().toUpperCase() ?? null,
  });

  if (rpcError) {
    console.error('[tables/claim] claim_table rpc error:', rpcError.message);
    return NextResponse.json(
      { ok: false, error: 'Terjadi kesalahan saat mengklaim meja. Silakan coba lagi.' },
      { status: 500 },
    );
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;

  // 6. Map RPC result to HTTP response
  if (!result?.ok) {
    const code = result?.code as string;

    const errorMessages: Record<string, string> = {
      TABLE_NOT_FOUND:     'Meja tidak ditemukan atau tidak aktif.',
      TABLE_TAKEN:         'Meja ini sedang dipakai pelanggan lain.',
      TABLE_RESERVED:      'Meja ini sudah dipesan.',
      TABLE_RESERVED_SOON: 'Meja ini akan segera dipakai untuk reservasi.',
    };

    const httpStatus =
      code === 'TABLE_NOT_FOUND' ? 404 : 409;

    return NextResponse.json(
      {
        ok:               false,
        code,
        error:            errorMessages[code] ?? 'Meja tidak dapat diklaim.',
        starts_at:        result?.starts_at ?? undefined,
        available_until:  result?.available_until ?? undefined,
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
    ok: true,
    isExisting: !!result.is_existing,
    session: {
      tableCode:        sess.table_code,
      tableLabel:       sess.table_label ?? null,
      branchId:         sess.branch_id,
      expiresAt:        sess.expires_at,
      startedAt:        sess.started_at,
      remainingSeconds,
    },
  };

  // 8. Set httpOnly cookie
  const response = NextResponse.json(responseBody, { status: 200 });
  response.cookies.set(TABLE_SESSION_COOKIE, token, buildSessionCookieOptions());

  return response;
}
