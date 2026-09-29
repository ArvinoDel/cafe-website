/**
 * GET /api/branch-info
 *
 * Returns public-safe branch information for the Wi-Fi & Jam Buka card.
 * Only exposes: wifi_name, wifi_password, opening_hours.
 * Wi-Fi credentials are intentionally excluded from the homepage query
 * (app/page.tsx uses the anon publishable key) — this endpoint is the
 * single controlled path for guests to access them.
 *
 * Query params:
 *   ?branch_id=<uuid>   — explicit branch lookup
 *   (omit)              — auto-resolves when there is exactly one branch
 *
 * Responses:
 *   200  { wifi_name, wifi_password, opening_hours }   (any may be null)
 *   400  { error }  — missing/ambiguous branch, or invalid branch_id
 *   404  { error }  — branch not found
 *   500  { error }  — server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import type { SupabaseEnv } from '@supabase/server';

// ─── Env helper (mirrors /api/orders/create) ─────────────────────────────────

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

// ─── UUID format guard ────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const branchIdParam = searchParams.get('branch_id')?.trim() || null;

  // Validate UUID format early — return 400 rather than 404 to distinguish
  // a bad parameter from a valid-but-missing branch.
  if (branchIdParam && !UUID_RE.test(branchIdParam)) {
    return NextResponse.json({ error: 'Branch ID tidak valid.' }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient({ env: resolveEnv() });

  // Only select the fields exposed to guests — never include sensitive credentials
  // in a broad SELECT *.
  const SELECT = 'wifi_name, wifi_password, opening_hours, est_wait_minutes';

  if (branchIdParam) {
    // Explicit branch lookup
    const { data, error } = await supabaseAdmin
      .from('branches')
      .select(SELECT)
      .eq('id', branchIdParam)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Gagal memuat info cabang.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  }

  // Auto-resolve: valid only when there is exactly one branch
  const { data: branches, error: listErr } = await supabaseAdmin
    .from('branches')
    .select(`id, ${SELECT}`);

  if (listErr) {
    return NextResponse.json({ error: 'Gagal memuat info cabang.' }, { status: 500 });
  }

  if (!branches || branches.length === 0) {
    return NextResponse.json({ error: 'Tidak ada cabang yang terdaftar.' }, { status: 400 });
  }

  if (branches.length > 1) {
    return NextResponse.json(
      {
        error:
          'branch_id diperlukan karena ada lebih dari satu cabang.',
      },
      { status: 400 },
    );
  }

  const { wifi_name, wifi_password, opening_hours, est_wait_minutes } = branches[0] as {
    wifi_name: string | null;
    wifi_password: string | null;
    opening_hours: string | null;
    est_wait_minutes: number | null;
  };

  return NextResponse.json({ wifi_name, wifi_password, opening_hours, est_wait_minutes }, { status: 200 });
}
