/**
 * POST /api/table-requests
 *
 * Handles guest service requests ("Minta air putih", "Minta tisu", "Panggil pelayan", "Minta bill").
 * Uses service-role admin client — no anon INSERT policies needed.
 *
 * Request body (JSON):
 *   {
 *     branch_id?:    string,                    // optional UUID; auto-resolves when 1 branch
 *     table_number:  string,                    // required, e.g. "5" or "A-1"
 *     type:          'water' | 'tissue' | 'waiter' | 'bill',
 *     order_code?:   string                     // optional reference to current order
 *   }
 *
 * Responses:
 *   201  { success: true, message }
 *   200  { already_sent: true, message }       // open request already pending
 *   400  { error }                             // invalid input / ambiguous branch
 *   429  { error }                             // rate limited (20 req / min)
 *   500  { error }                             // server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import type { SupabaseEnv } from '@supabase/server';

function resolveEnv(): Partial<SupabaseEnv> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const env: Partial<SupabaseEnv> = {};
  if (url) env.url = url;
  if (publishableKey) env.publishableKeys = { default: publishableKey };
  if (secretKey) env.secretKeys = { default: secretKey };
  return env;
}

// ─── Rate limiting (20 req / min per IP) ──────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 20;

type RateLimitEntry = { count: number; windowStart: number };
const ipWindowMap = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipWindowMap.size > 1000) {
    ipWindowMap.forEach((v, k) => {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS) ipWindowMap.delete(k);
    });
  }

  const entry = ipWindowMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipWindowMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const TableRequestSchema = z.object({
  branch_id:    z.string().uuid('ID cabang tidak valid.').optional(),
  table_number: z.string().trim().min(1, 'Nomor meja wajib diisi.').max(20, 'Nomor meja tidak valid.'),
  type:         z.enum(['water', 'tissue', 'waiter', 'bill'], {
    errorMap: () => ({ message: 'Jenis permintaan tidak valid.' }),
  }),
  order_code:   z.string().trim().max(20).optional(),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  const parsed = TableRequestSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Input tidak valid.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { branch_id: clientBranchId, table_number: tableNumber, type, order_code: rawOrderCode } = parsed.data;
  const orderCode = rawOrderCode ? rawOrderCode.trim().toUpperCase() : null;

  const supabaseAdmin = createAdminClient({ env: resolveEnv() });

  // 1. Resolve branch
  let resolvedBranchId: string;
  if (clientBranchId) {
    const { data: branch, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id')
      .eq('id', clientBranchId)
      .maybeSingle();

    if (branchErr || !branch) {
      return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 400 });
    }
    resolvedBranchId = branch.id as string;
  } else {
    // Single-branch auto-resolve
    const { data: branches, error: branchListErr } = await supabaseAdmin
      .from('branches')
      .select('id');

    if (branchListErr) {
      return NextResponse.json({ error: 'Gagal memverifikasi cabang.' }, { status: 500 });
    }

    if (!branches || branches.length === 0) {
      return NextResponse.json({ error: 'Tidak ada cabang yang terdaftar.' }, { status: 400 });
    }

    if (branches.length > 1) {
      return NextResponse.json(
        { error: 'Cabang tidak dapat ditentukan secara otomatis. Silakan scan QR meja terlebih dahulu.' },
        { status: 400 },
      );
    }

    resolvedBranchId = branches[0].id as string;
  }

  // 2. Check for duplicate pending/open request of the same type at this table
  const { data: existingOpen, error: checkErr } = await supabaseAdmin
    .from('table_requests')
    .select('id')
    .eq('branch_id', resolvedBranchId)
    .eq('table_number', tableNumber)
    .eq('type', type)
    .eq('status', 'open')
    .maybeSingle();

  if (checkErr) {
    console.error('[table-requests] check error:', checkErr.message);
  }

  if (existingOpen) {
    return NextResponse.json(
      {
        already_sent: true,
        message: 'Permintaan sudah terkirim sebelumnya. Barista segera datang 🙌',
      },
      { status: 200 },
    );
  }

  // 3. Insert new open request
  const { error: insertErr } = await supabaseAdmin
    .from('table_requests')
    .insert({
      branch_id:    resolvedBranchId,
      table_number: tableNumber,
      type,
      order_code:   orderCode,
      status:       'open',
    });

  if (insertErr) {
    console.error('[table-requests] insert error:', insertErr.message);
    return NextResponse.json(
      { error: 'Gagal mengirim permintaan. Coba lagi.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: 'Terkirim! Barista segera datang 🙌',
    },
    { status: 201 },
  );
}
