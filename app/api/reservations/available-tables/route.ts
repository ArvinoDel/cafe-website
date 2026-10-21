/**
 * GET /api/reservations/available-tables
 *
 * Public endpoint: returns tables that are available for a given
 * branch, starts_at, duration, and party_size.
 * Thin wrapper over SQL function available_tables.
 *
 * Query params:
 *   branch_id:   UUID
 *   starts_at:   ISO 8601 timestamptz
 *   duration:    number (optional: 60, 90, 120, 150, 180; default: 120)
 *   party_size:  number (optional, default: 1)
 *
 * Success 200: { tables: Array<{ id, code, label, seats }> }
 * Errors: 400 | 500
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';

const QSchema = z.object({
  branch_id:  z.string().uuid(),
  starts_at:  z.string().datetime({ offset: true }),
  duration:   z.coerce.number().int().refine((d) => [60, 90, 120, 150, 180].includes(d)).optional().default(120),
  party_size: z.coerce.number().int().min(1).max(50).optional().default(1),
});

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const parsed = QSchema.safeParse({
    branch_id:  searchParams.get('branch_id'),
    starts_at:  searchParams.get('starts_at'),
    duration:   searchParams.get('duration') ?? undefined,
    party_size: searchParams.get('party_size') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Parameter tidak valid.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { branch_id, starts_at, duration, party_size } = parsed.data;
  const admin = createAdminClient();

  const { data: tables, error } = await (admin as any).rpc('available_tables', {
    p_branch_id:        branch_id,
    p_starts_at:        starts_at,
    p_duration_minutes: duration,
    p_party_size:       party_size,
  });

  if (error) {
    console.error('[GET /api/reservations/available-tables] rpc error:', error.message);
    return NextResponse.json({ error: 'Gagal memuat ketersediaan meja.' }, { status: 500 });
  }

  return NextResponse.json({ tables: tables ?? [] });
}
