/**
 * POST /api/orders/feedback
 *
 * Submits a rating + optional comment for a completed order.
 * All writes go through the service-role admin client — no anon INSERT needed.
 *
 * Request body (JSON):
 *   {
 *     order_code: string,       // validated: legacy NK######  or new 8-char code
 *     rating:     1 | 2 | 3,   // 1=🙁  2=😐  3=😊
 *     comment?:   string        // optional, trimmed, max 300 chars
 *   }
 *
 * Responses:
 *   201  { success: true }
 *   400  { error }  — validation / order not completed
 *   404  { error }  — unknown order code (same message as format mismatch)
 *   409  { error }  — feedback already submitted
 *   429  { error }  — rate limited
 *   500  { error }  — server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import type { SupabaseEnv } from '@supabase/server';

// ─── Env helper ───────────────────────────────────────────────────────────────

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

// ─── Code validation (mirrors /api/orders/lookup) ─────────────────────────────

const LEGACY_CODE_RE = /^NK\d{6}$/i;
const NEW_CODE_RE    = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/i;

function isValidCodeFormat(code: string): boolean {
  return LEGACY_CODE_RE.test(code) || NEW_CODE_RE.test(code);
}

// ─── Rate limiting (same pattern as /api/orders/lookup) ──────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 60;

type RateLimitEntry = { count: number; windowStart: number };
const ipWindowMap = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = ipWindowMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipWindowMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const FeedbackSchema = z.object({
  order_code: z.string().trim().min(1, 'Kode pesanan wajib diisi.'),
  rating:     z.number().int().min(1).max(3, 'Rating tidak valid.'),
  comment:    z.string().trim().max(300, 'Komentar maksimal 300 karakter.').optional(),
});

// ─── Shared 404 (same shape for invalid format + not found) ───────────────────

function notFound() {
  return NextResponse.json(
    { error: 'Pesanan tidak ditemukan.' },
    { status: 404 },
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limiting
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

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  // Zod validation
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Input tidak valid.';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { order_code: rawCode, rating, comment } = parsed.data;
  const orderCode = rawCode.trim().toUpperCase();

  // Validate code format before hitting DB (same 404 to prevent enumeration)
  if (!isValidCodeFormat(orderCode)) {
    return notFound();
  }

  const supabaseAdmin = createAdminClient({ env: resolveEnv() });

  // Fetch order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, branch_id, status')
    .eq('order_code', orderCode)
    .maybeSingle();

  if (orderErr) {
    console.error('[orders/feedback] order fetch error:', orderErr.message);
    return NextResponse.json({ error: 'Gagal memverifikasi pesanan.' }, { status: 500 });
  }

  // Generic 404 for unknown codes
  if (!order) {
    return notFound();
  }

  // Order must be completed
  if (order.status !== 'completed') {
    return NextResponse.json(
      { error: 'Ulasan hanya dapat diberikan untuk pesanan yang sudah selesai.' },
      { status: 400 },
    );
  }

  // Check for existing feedback (one per order)
  const { data: existing, error: existErr } = await supabaseAdmin
    .from('order_feedback')
    .select('id')
    .eq('order_id', order.id)
    .maybeSingle();

  if (existErr) {
    console.error('[orders/feedback] existing check error:', existErr.message);
    const isMissingTable =
      existErr.code === 'PGRST205' ||
      existErr.message?.includes('order_feedback') ||
      existErr.message?.includes('schema cache');
    if (isMissingTable) {
      console.error('[orders/feedback] Tabel database order_feedback belum dibuat. Silakan jalankan migration SQL di Supabase.');
      return NextResponse.json(
        { error: 'Gagal menyimpan ulasan. Coba lagi.' },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: 'Gagal memeriksa ulasan sebelumnya.' }, { status: 500 });
  }

  if (existing) {
    const { error: updateErr } = await supabaseAdmin
      .from('order_feedback')
      .update({
        rating,
        comment: comment?.trim() || null,
      })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('[orders/feedback] update error:', updateErr.message);
      return NextResponse.json({ error: 'Gagal memperbarui ulasan. Coba lagi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  }

  // Insert feedback via service-role client
  const { error: insertErr } = await supabaseAdmin
    .from('order_feedback')
    .insert({
      order_id:  order.id,
      branch_id: order.branch_id,
      rating,
      comment:   comment?.trim() || null,
    });

  if (insertErr) {
    // 23505 = unique_violation (race condition — another request beat this one)
    const pgCode = (insertErr as unknown as { code?: string }).code;
    if (pgCode === '23505') {
      return NextResponse.json(
        { error: 'Kamu sudah memberikan ulasan untuk pesanan ini.' },
        { status: 409 },
      );
    }
    const isMissingTable =
      insertErr.code === 'PGRST205' ||
      insertErr.message?.includes('order_feedback') ||
      insertErr.message?.includes('schema cache');
    if (isMissingTable) {
      console.error('[orders/feedback] Tabel database order_feedback belum dibuat. Silakan jalankan migration SQL di Supabase.');
      return NextResponse.json(
        { error: 'Gagal menyimpan ulasan. Coba lagi.' },
        { status: 500 },
      );
    }
    console.error('[orders/feedback] insert error:', insertErr.message);
    return NextResponse.json({ error: 'Gagal menyimpan ulasan. Coba lagi.' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
