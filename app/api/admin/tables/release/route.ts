/**
 * POST /api/admin/tables/release
 *
 * Staff-only endpoint to manually release an active table session.
 * Requires an authenticated admin session (JWT in cookie via AdminShell).
 *
 * Request body:
 *   { session_id: string }   — UUID of the table_session row to release
 *    OR
 *   { table_id: string }     — UUID of the tables row (releases any active session)
 *
 * Success 200:
 *   { ok: true, message: string }
 *
 * Error: 400 (bad body), 401 (not authenticated), 403 (wrong branch), 404 (no active session), 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseContext, createAdminClient } from '@/lib/supabase-server';
import { resolveAdminEnv } from '@/lib/table-session-server';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const ReleaseSchema = z.union([
  z.object({ session_id: z.string().uuid('session_id tidak valid.') }),
  z.object({ table_id:   z.string().uuid('table_id tidak valid.')   }),
]);

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Authenticate admin
  const { data: ctx, error: authErr } = await createSupabaseContext({ auth: 'user' });
  if (authErr || !ctx) {
    return NextResponse.json({ ok: false, error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  // 2. Lookup admin profile
  const { data: profile, error: profileErr } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ ok: false, error: 'Profil admin tidak ditemukan.' }, { status: 403 });
  }

  const role     = profile.role as string | undefined;
  const branchId = profile.branch_id as string | undefined;

  if (role !== 'superadmin' && role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Akses ditolak.' }, { status: 403 });
  }

  // 3. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  const parsed = ReleaseSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Input tidak valid.';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const input = parsed.data;

  // 4. Admin client
  const env           = resolveAdminEnv();
  const supabaseAdmin = createAdminClient({ env });

  // 5. Check branch authorization if role === 'admin'
  if (role === 'admin') {
    let checkQuery = supabaseAdmin
      .from('table_sessions')
      .select('branch_id')
      .eq('status', 'active');

    if ('session_id' in input) {
      checkQuery = checkQuery.eq('id', input.session_id);
    } else {
      checkQuery = checkQuery.eq('table_id', input.table_id);
    }

    const { data: activeRows } = await checkQuery;
    if (activeRows && activeRows.length > 0 && activeRows[0].branch_id !== branchId) {
      return NextResponse.json({ ok: false, error: 'Akses ditolak untuk cabang ini.' }, { status: 403 });
    }
  }

  // 6. Release via SQL RPC (taking table row lock to synchronize with table claim)
  const { data: rpcData, error: rpcErr } = await (supabaseAdmin as any).rpc('admin_release_table_session', {
    p_table_id:   'table_id' in input ? input.table_id : null,
    p_session_id: 'session_id' in input ? input.session_id : null,
    p_reason:     'staff',
  });

  if (rpcErr) {
    console.error('[admin/tables/release] rpc error:', rpcErr.message);
    return NextResponse.json({ ok: false, error: 'Gagal mengosongkan meja.' }, { status: 500 });
  }

  const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
  if (!result?.ok) {
    return NextResponse.json(
      { ok: false, error: result?.message || 'Gagal mengosongkan meja.' },
      { status: result?.code === 'NO_ACTIVE_SESSION' ? 404 : 400 },
    );
  }

  return NextResponse.json({ ok: true, message: result.message || 'Meja berhasil dikosongkan.' });
}
