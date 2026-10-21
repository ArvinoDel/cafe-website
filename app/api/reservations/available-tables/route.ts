/**
 * GET /api/reservations/available-tables
 *
 * Public endpoint: returns tables that are NOT already booked for a given
 * branch + starts_at window (starts_at + 2h window with buffer).
 *
 * Query params:
 *   branch_id: UUID
 *   starts_at:  ISO 8601 timestamptz
 *
 * Success 200: { tables: Array<{ id, code, label, seats }> }
 * Errors: 400 | 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';

type BranchReservationSettings = {
  reservation_buffer_minutes: number | null;
  reservations_enabled: boolean;
};

const QSchema = z.object({
  branch_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
});

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const parsed = QSchema.safeParse({
    branch_id: searchParams.get('branch_id'),
    starts_at: searchParams.get('starts_at'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Parameter tidak valid.' }, { status: 400 });
  }

  const { branch_id, starts_at } = parsed.data;
  const startsAt = new Date(starts_at);
  // Default session: 2 hours + 15-min buffer on each side
  const endsAt   = new Date(startsAt.getTime() + 2 * 60 * 60_000 + 15 * 60_000);

  const admin = createAdminClient();

  // 1. Load branch settings
  const { data: branchRaw } = await admin
    .from('branches')
    .select('reservation_buffer_minutes, reservations_enabled')
    .eq('id', branch_id)
    .single();

  const branch = branchRaw as BranchReservationSettings | null;

  if (!branch?.reservations_enabled) {
    return NextResponse.json({ tables: [] });
  }

  // 2. Get all active tables for the branch
  const { data: allTables, error: tErr } = await admin
    .from('tables')
    .select('id, code, label, seats')
    .eq('branch_id', branch_id)
    .eq('is_active', true)
    .order('code');

  if (tErr || !allTables) {
    return NextResponse.json({ error: 'Gagal memuat daftar meja.' }, { status: 500 });
  }

  // 3. Find tables already booked in the overlapping window
  const bufferMs = (branch.reservation_buffer_minutes ?? 15) * 60_000;
  const windowStart = new Date(startsAt.getTime() - bufferMs).toISOString();
  const windowEnd   = endsAt.toISOString();

  const { data: booked } = await admin
    .from('reservations')
    .select('table_id')
    .eq('branch_id', branch_id)
    .in('status', ['pending_payment', 'awaiting_confirmation', 'confirmed'])
    .lt('starts_at', windowEnd)
    .gt('ends_at', windowStart);

  const bookedIds = new Set((booked ?? []).map((r) => r.table_id));

  const available = allTables.filter((t) => !bookedIds.has(t.id));

  return NextResponse.json({ tables: available });
}
