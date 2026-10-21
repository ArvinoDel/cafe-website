/**
 * POST /api/reservations/[code]/proof-upload-url
 *
 * Generates a signed upload URL for the private reservation-proofs bucket.
 * The customer uploads their payment proof directly via PUT to this signed URL.
 * Never exposes public URLs.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
} from '@/lib/table-session-server';

const BodySchema = z.object({
  verifier: z.string().min(1).max(100).optional(),
  file_ext: z.string().min(1).max(10).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upperCode = code?.trim().toUpperCase();

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }

  const parsed = BodySchema.safeParse(body);
  let verifier = parsed.success ? parsed.data.verifier?.trim() : undefined;
  const fileExt = parsed.success && parsed.data.file_ext ? parsed.data.file_ext.replace(/^\./, '').toLowerCase() : 'jpg';

  // Fallback to cookie
  if (!verifier) {
    const ownerToken = req.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
    if (ownerToken) {
      verifier = computeTokenHash(ownerToken);
    }
  }

  if (!verifier) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  const admin = createAdminClient();

  // Validate reservation existence and verifier
  const { data: res, error: fetchErr } = await admin
    .from('reservations')
    .select('id, code, customer_phone, owner_token_hash, status')
    .eq('code', upperCode)
    .maybeSingle();

  if (fetchErr || !res) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  const matchesPhone = res.customer_phone && res.customer_phone.slice(-4) === verifier;
  const matchesToken = res.owner_token_hash && res.owner_token_hash === verifier;

  if (!matchesPhone && !matchesToken) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
  }

  if (res.status !== 'pending_payment' && res.status !== 'awaiting_confirmation') {
    return NextResponse.json(
      { error: 'Status reservasi saat ini tidak menerima unggah bukti pembayaran.' },
      { status: 409 },
    );
  }

  const randSuffix = crypto.randomBytes(4).toString('hex');
  const filePath = `${upperCode}/${Date.now()}-${randSuffix}.${fileExt}`;

  const { data: uploadData, error: uploadErr } = await admin.storage
    .from('reservation-proofs')
    .createSignedUploadUrl(filePath);

  if (uploadErr || !uploadData) {
    console.error('[proof-upload-url] createSignedUploadUrl error:', uploadErr);
    return NextResponse.json({ error: 'Gagal membuat URL unggah bukti.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:        true,
    uploadUrl: uploadData.signedUrl,
    path:      filePath,
    token:     uploadData.token,
  });
}
