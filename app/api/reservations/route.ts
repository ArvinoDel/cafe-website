/**
 * POST /api/reservations
 *
 * Public endpoint: customer submits a reservation request.
 * No auth required — any visitor can book a table.
 *
 * Request body:
 *   {
 *     branch_id:      string (UUID)
 *     table_id:       string (UUID)
 *     customer_name:  string (1-80 chars)
 *     customer_phone: string (5-30 chars)
 *     customer_email: string | null
 *     party_size:     number (1-50)
 *     starts_at:      string (ISO 8601 timestamptz)
 *     notes:          string | null
 *   }
 *
 * Success 201:
 *   { reservation: { id, code, status, starts_at, ends_at, hold_expires_at } }
 *
 * Errors:
 *   400 — validation failed
 *   409 — table not available / reservations not enabled / outside booking window
 *   500 — server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';

// ─── Branch settings type (new columns added in Phase 1 migration) ────────────

type BranchSettings = {
  id: string;
  reservations_enabled: boolean;
  reservation_open_time: string;
  reservation_close_time: string;
  reservation_min_lead_minutes: number;
  reservation_max_days_ahead: number;
  reservation_hold_minutes: number;
  reservation_grace_minutes: number;
  reservation_buffer_minutes: number;
  reservation_min_preorder: number;
};

// ─── Zod schema ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
  branch_id:      z.string().uuid(),
  table_id:       z.string().uuid(),
  customer_name:  z.string().min(1).max(80).trim(),
  customer_phone: z.string().min(5).max(30).trim(),
  customer_email: z.string().email().max(120).trim().nullable().optional(),
  party_size:     z.number().int().min(1).max(50),
  starts_at:      z.string().datetime({ offset: true }),
  notes:          z.string().max(500).trim().nullable().optional(),
});

// ─── Code generator ───────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Parse & validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Data tidak valid', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    branch_id, table_id, customer_name, customer_phone,
    customer_email, party_size, starts_at, notes,
  } = parsed.data;

  const admin = createAdminClient();
  const startsAt = new Date(starts_at);

  // 2. Load branch settings
  const { data: branchRaw, error: branchErr } = await admin
    .from('branches')
    .select(
      'id, reservations_enabled, reservation_open_time, reservation_close_time, ' +
      'reservation_min_lead_minutes, reservation_max_days_ahead, ' +
      'reservation_hold_minutes, reservation_buffer_minutes, reservation_min_preorder'
    )
    .eq('id', branch_id)
    .single();

  const branch = branchRaw as BranchSettings | null;

  if (branchErr || !branch) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 400 });
  }

  if (!branch.reservations_enabled) {
    return NextResponse.json(
      { error: 'Fitur reservasi belum diaktifkan di cabang ini.' },
      { status: 409 },
    );
  }

  // 3. Validate booking window
  const now = new Date();
  const minLeadMs = (branch.reservation_min_lead_minutes ?? 120) * 60 * 1000;
  const maxDays    = branch.reservation_max_days_ahead ?? 30;

  if (startsAt.getTime() - now.getTime() < minLeadMs) {
    return NextResponse.json(
      { error: `Reservasi harus dibuat minimal ${branch.reservation_min_lead_minutes ?? 120} menit sebelum waktu mulai.` },
      { status: 409 },
    );
  }
  if (startsAt.getTime() > now.getTime() + maxDays * 86400_000) {
    return NextResponse.json(
      { error: `Reservasi hanya dapat dibuat hingga ${maxDays} hari ke depan.` },
      { status: 409 },
    );
  }

  // 4. Validate time is within branch reservation hours (Asia/Jakarta)
  const jakartaTime = startsAt.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const openTime  = branch.reservation_open_time  ?? '08:00';
  const closeTime = branch.reservation_close_time ?? '21:00';
  if (jakartaTime < openTime || jakartaTime >= closeTime) {
    return NextResponse.json(
      { error: `Reservasi hanya tersedia antara ${openTime}–${closeTime} WIB.` },
      { status: 409 },
    );
  }

  // 5. Verify table belongs to this branch and is active
  const { data: table, error: tableErr } = await admin
    .from('tables')
    .select('id, branch_id, seats, is_active')
    .eq('id', table_id)
    .eq('branch_id', branch_id)
    .single();

  if (tableErr || !table || !table.is_active) {
    return NextResponse.json({ error: 'Meja tidak tersedia.' }, { status: 409 });
  }

  // 6. Compute ends_at: starts_at + 2h (fixed session length used for overlap check)
  //    Admin can extend/adjust via PATCH. Buffer is handled by claim_table RPC.
  const sessionMinutes = 120;
  const endsAt = new Date(startsAt.getTime() + sessionMinutes * 60_000);

  // 7. Compute status based on min_preorder setting
  const requiresPayment = (branch.reservation_min_preorder ?? 0) > 0;
  const initialStatus   = requiresPayment ? 'pending_payment' : 'awaiting_confirmation';

  // 8. Compute hold_expires_at
  const holdMinutes   = branch.reservation_hold_minutes ?? 15;
  const holdExpiresAt = requiresPayment
    ? new Date(now.getTime() + holdMinutes * 60_000)
    : null;

  // 9. Generate a unique code (retry up to 5 times on collision)
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode();
    const { data: existing } = await admin
      .from('reservations')
      .select('id')
      .eq('code', candidate)
      .maybeSingle();
    if (!existing) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json({ error: 'Gagal membuat kode reservasi. Coba lagi.' }, { status: 500 });
  }

  // 10. Insert — the EXCLUDE constraint will reject overlapping active reservations
  const { data: reservation, error: insertErr } = await admin
    .from('reservations')
    .insert({
      code,
      branch_id,
      table_id,
      customer_name,
      customer_phone,
      customer_email:   customer_email ?? null,
      party_size,
      notes:            notes ?? null,
      starts_at:        startsAt.toISOString(),
      ends_at:          endsAt.toISOString(),
      status:           initialStatus,
      hold_expires_at:  holdExpiresAt?.toISOString() ?? null,
      preorder_total:   0,
    })
    .select('id, code, status, starts_at, ends_at, hold_expires_at')
    .single();

  if (insertErr) {
    // PostgreSQL exclusion constraint violation
    if (insertErr.code === '23P01') {
      return NextResponse.json(
        { error: 'Meja sudah dipesan di waktu tersebut. Silakan pilih waktu atau meja lain.' },
        { status: 409 },
      );
    }
    console.error('[POST /api/reservations]', insertErr);
    return NextResponse.json({ error: 'Gagal menyimpan reservasi.' }, { status: 500 });
  }

  return NextResponse.json({ reservation }, { status: 201 });
}
