/**
 * PATCH /api/admin/reservations/[id]
 *
 * Staff-only endpoint to update a reservation's status or details.
 * Requires valid admin session (superadmin or branch admin — branch-scoped).
 *
 * Supported actions via `action` field:
 *   confirm             → pending_payment / awaiting_confirmation → confirmed
 *   cancel              → any non-terminal → cancelled
 *   no_show             → confirmed → no_show
 *   complete            → confirmed → completed
 *   upload_proof        → attaches payment_proof_url, moves to awaiting_confirmation
 *
 * Request body: { action: string, payment_proof_url?: string }
 *
 * Success 200: { reservation: { id, status, updated_at } }
 * Errors: 400 | 403 | 404 | 409 | 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseContext } from '@/lib/supabase-server';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
  action: z.enum(['confirm', 'cancel', 'no_show', 'complete', 'upload_proof']),
  payment_proof_url: z.string().url().optional(),
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

  const { action, payment_proof_url } = parsed.data;
  const admin = ctx.supabaseAdmin;

  // 3. Load reservation (branch-scoped for regular admin)
  const query = admin
    .from('reservations')
    .select('id, status, branch_id')
    .eq('id', id);
  if (role === 'admin') query.eq('branch_id', branchId!);

  const { data: reservation, error: fetchErr } = await query.maybeSingle();

  if (fetchErr || !reservation) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  // 4. Compute new status + allowed transitions
  const TERMINAL = ['cancelled', 'no_show', 'completed'] as const;
  if (TERMINAL.includes(reservation.status as (typeof TERMINAL)[number])) {
    return NextResponse.json(
      { error: 'Status reservasi sudah final, tidak dapat diubah.' },
      { status: 409 },
    );
  }

  let newStatus: string | null = null;
  const updates: Record<string, unknown> = {};

  switch (action) {
    case 'confirm':
      if (!['pending_payment', 'awaiting_confirmation'].includes(reservation.status)) {
        return NextResponse.json({ error: 'Hanya bisa konfirmasi reservasi yang menunggu.' }, { status: 409 });
      }
      newStatus = 'confirmed';
      break;

    case 'cancel':
      newStatus = 'cancelled';
      break;

    case 'no_show':
      if (reservation.status !== 'confirmed') {
        return NextResponse.json({ error: 'Hanya reservasi yang sudah dikonfirmasi yang bisa ditandai tidak hadir.' }, { status: 409 });
      }
      newStatus = 'no_show';
      break;

    case 'complete':
      if (reservation.status !== 'confirmed') {
        return NextResponse.json({ error: 'Hanya reservasi yang sudah dikonfirmasi yang bisa diselesaikan.' }, { status: 409 });
      }
      newStatus = 'completed';
      break;

    case 'upload_proof':
      if (!payment_proof_url) {
        return NextResponse.json({ error: 'URL bukti pembayaran diperlukan.' }, { status: 400 });
      }
      if (reservation.status !== 'pending_payment') {
        return NextResponse.json({ error: 'Hanya reservasi pending_payment yang bisa diunggah bukti.' }, { status: 409 });
      }
      updates.payment_proof_url = payment_proof_url;
      newStatus = 'awaiting_confirmation';
      break;
  }

  if (newStatus) updates.status = newStatus;

  // 5. Apply update
  const { data: updated, error: updateErr } = await admin
    .from('reservations')
    .update(updates)
    .eq('id', id)
    .select('id, status, updated_at')
    .single();

  if (updateErr || !updated) {
    console.error('[PATCH /api/admin/reservations/[id]]', updateErr);
    return NextResponse.json({ error: 'Gagal memperbarui reservasi.' }, { status: 500 });
  }

  return NextResponse.json({ reservation: updated });
}
