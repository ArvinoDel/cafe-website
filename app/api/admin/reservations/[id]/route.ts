/**
 * PATCH /api/admin/reservations/[id]
 *
 * Staff-only endpoint to update a reservation's status or details.
 * Requires valid admin session (superadmin or branch admin — branch-scoped).
 *
 * Supported actions via `action` field:
 *   confirm             → pending_payment / awaiting_confirmation → confirmed (handles SLOT_LOST)
 *   cancel              → any non-terminal → cancelled (releases linked session, sets needs_refund if paid)
 *   no_show             → confirmed → no_show (releases linked session)
 *   complete            → confirmed / seated → completed (releases linked session)
 *   mark_refunded       → needs_refund → refunded
 *
 * Request body: { action: 'confirm' | 'cancel' | 'no_show' | 'complete' | 'mark_refunded' }
 *
 * Success 200: { reservation: { ok, id, status, refund_status?, ... } }
 * Errors: 400 | 403 | 404 | 409 | 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseContext } from '@/lib/supabase-server';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
  action: z.enum(['confirm', 'cancel', 'no_show', 'complete', 'mark_refunded']),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Auth & Profile lookup
  const { data: ctx, error: authErr } = await createSupabaseContext({ auth: 'user' });
  if (authErr || !ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const { data: profile, error: profileErr } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profil admin tidak ditemukan.' }, { status: 403 });
  }

  const role     = profile.role as string | undefined;
  const branchId = profile.branch_id as string | undefined;

  if (role !== 'superadmin' && role !== 'admin') {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  // 2. Parse body
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Data tidak valid.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action } = parsed.data;
  const admin = ctx.supabaseAdmin;

  // 3. Load reservation (branch-scoped for regular admin)
  const query = admin
    .from('reservations')
    .select('id, status, branch_id, refund_status')
    .eq('id', id);
  if (role === 'admin') query.eq('branch_id', branchId!);

  const { data: reservation, error: fetchErr } = await query.maybeSingle();

  if (fetchErr || !reservation) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan atau akses ditolak.' }, { status: 404 });
  }

  // 4. Delegate transition to SQL function admin_transition_reservation
  // Takes row lock on tables and reservations, synchronizes releases with table claims
  const { data: rpcData, error: rpcErr } = await (admin as any).rpc('admin_transition_reservation', {
    p_reservation_id: id,
    p_action:         action,
  });

  if (rpcErr) {
    console.error('[PATCH /api/admin/reservations/[id]] rpc error:', rpcErr.message);
    return NextResponse.json({ error: 'Gagal memperbarui status reservasi.' }, { status: 500 });
  }

  const resResult = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
  if (!resResult?.ok) {
    return NextResponse.json(
      {
        error:         resResult?.message || 'Transisi status tidak diizinkan.',
        code:          resResult?.code,
        refund_status: resResult?.refund_status,
      },
      { status: resResult?.code === 'SLOT_LOST' ? 409 : 400 },
    );
  }

  return NextResponse.json({ reservation: resResult });
}
