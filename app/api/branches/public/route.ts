/**
 * GET /api/branches/public
 *
 * Returns all branches that have reservations enabled.
 * Only exposes reservation-relevant settings — no internal/sensitive data.
 *
 * Response 200:
 *   { branches: Array<{
 *       id, name,
 *       reservation_open_time, reservation_close_time,
 *       reservation_min_lead_minutes, reservation_max_days_ahead,
 *       reservation_hold_minutes, reservation_min_preorder
 *     }>
 *   }
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

type PublicBranch = {
  id: string;
  name: string;
  reservations_enabled: boolean;
  reservation_open_time: string;
  reservation_close_time: string;
  reservation_min_lead_minutes: number;
  reservation_max_days_ahead: number;
  reservation_hold_minutes: number;
  reservation_min_preorder: number;
  timezone?: string | null;
  qris_image_url?: string | null;
};

export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('branches')
    .select(
      'id, name, reservations_enabled, reservation_open_time, reservation_close_time, ' +
      'reservation_min_lead_minutes, reservation_max_days_ahead, ' +
      'reservation_hold_minutes, reservation_min_preorder, timezone, qris_image_url'
    )
    .eq('reservations_enabled', true)
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: 'Gagal memuat cabang.' }, { status: 500 });
  }

  return NextResponse.json({ branches: (data ?? []) as unknown as PublicBranch[] });
}
