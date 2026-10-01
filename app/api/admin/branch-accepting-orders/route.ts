/**
 * POST /api/admin/branch-accepting-orders
 *
 * Allows admins to pause/resume ordering for a branch by flipping
 * branches.accepting_orders and branches.pause_message.
 *
 * Auth: session-based (createSupabaseContext({ auth: 'user' })) + profiles lookup.
 *   - superadmin  → may update any branch
 *   - admin       → may only update their own profiles.branch_id
 *   - other / unauthenticated → 403 / 401
 *
 * The write goes through the service-role admin client so we bypass RLS
 * (which only allows superadmin direct writes on branches) without adding a
 * new RLS policy for admins.
 *
 * Request body (JSON):
 *   {
 *     branch_id:        string  (UUID)
 *     accepting_orders: boolean
 *     pause_message?:   string  (max 120 chars) | null
 *   }
 *
 * Responses:
 *   200  { ok: true }
 *   400  { error }  — Zod validation failure
 *   401  { error }  — no valid session
 *   403  { error }  — insufficient role or branch mismatch
 *   500  { error }  — DB error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseContext } from '@/lib/supabase-server';

// ─── Zod schema ──────────────────────────────────────────────────────────────

const Schema = z.object({
  branch_id:        z.string().uuid('branch_id harus berupa UUID yang valid.'),
  accepting_orders: z.boolean({ required_error: 'accepting_orders wajib diisi.' }),
  pause_message:    z.string().max(120, 'Pesan jeda maksimal 120 karakter.').nullish(),
});

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Verify the caller has a valid admin session
  const { data: ctx, error: authError } = await createSupabaseContext({ auth: 'user' });

  if (authError || !ctx) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  // 2. Lookup caller's profile to determine role and branch scope
  const { data: callerProfile } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (!callerProfile || (callerProfile.role !== 'superadmin' && callerProfile.role !== 'admin')) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  // 3. Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  const parsed = Schema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Input tidak valid.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { branch_id, accepting_orders, pause_message } = parsed.data;

  // 4. Branch-scope enforcement for role 'admin'
  if (callerProfile.role === 'admin') {
    if (!callerProfile.branch_id || callerProfile.branch_id !== branch_id) {
      return NextResponse.json(
        { error: 'Kamu hanya bisa mengubah status cabangmu sendiri.' },
        { status: 403 },
      );
    }
  }

  // 5. Perform update via service-role client (bypasses RLS)
  const { error: updateErr } = await ctx.supabaseAdmin
    .from('branches')
    .update({
      accepting_orders,
      pause_message: pause_message ?? null,
    })
    .eq('id', branch_id);

  if (updateErr) {
    return NextResponse.json({ error: 'Gagal memperbarui status cabang.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
