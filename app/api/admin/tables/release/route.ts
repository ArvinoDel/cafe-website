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
  const env          = resolveAdminEnv();
  const supabaseAdmin = createAdminClient({ env });

  // 5. Find the active session
  let query = supabaseAdmin
    .from('table_sessions')
    .select('id, branch_id, table_id')
    .eq('status', 'active');

  if ('session_id' in input) {
    query = query.eq('id', input.session_id);
  } else {
    query = query.eq('table_id', input.table_id);
  }

  const { data: sessions, error: fetchErr } = await query;

  if (fetchErr) {
    console.error('[admin/tables/release] fetch error:', fetchErr.message);
    return NextResponse.json({ ok: false, error: 'Gagal memuat sesi meja.' }, { status: 500 });
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: false, error: 'Tidak ada sesi aktif yang ditemukan.' }, { status: 404 });
  }

  const sess = sessions[0] as { id: string; branch_id: string; table_id: string };

  // 6. Branch admin can only release their own branch's sessions
  if (role === 'admin' && sess.branch_id !== branchId) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak untuk cabang ini.' }, { status: 403 });
  }

  // 7. Release the session
  const { error: updateErr } = await supabaseAdmin
    .from('table_sessions')
    .update({
      status:          'released',
      released_reason: 'staff',
      released_at:     new Date().toISOString(),
    })
    .eq('id', sess.id)
    .eq('status', 'active');   // Optimistic lock: only update if still active

  if (updateErr) {
    console.error('[admin/tables/release] update error:', updateErr.message);
    return NextResponse.json({ ok: false, error: 'Gagal mengosongkan meja.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Meja berhasil dikosongkan.' });
}
