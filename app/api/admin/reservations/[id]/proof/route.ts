/**
 * GET /api/admin/reservations/[id]/proof
 *
 * Staff/Admin endpoint to view a private reservation payment proof.
 * Returns a short-lived signed URL for viewing. Never exposes public URLs.
 * Strictly scoped to authenticated staff; branch admins only see their branch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Auth & role check
  const { data: ctx, error: authErr } = await createSupabaseContext({ auth: 'user' });
  if (authErr || !ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const { data: profile, error: profileErr } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (profileErr || !profile || (profile.role !== 'superadmin' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const admin = ctx.supabaseAdmin;

  // 2. Fetch reservation with branch scope
  const query = admin
    .from('reservations')
    .select('id, code, branch_id, payment_proof_url')
    .eq('id', id);

  if (profile.role === 'admin') {
    query.eq('branch_id', profile.branch_id);
  }

  const { data: res, error: fetchErr } = await query.maybeSingle();

  if (fetchErr || !res) {
    return NextResponse.json({ error: 'Reservasi tidak ditemukan atau akses ditolak.' }, { status: 404 });
  }

  if (!res.payment_proof_url) {
    return NextResponse.json({ error: 'Tidak ada bukti pembayaran yang diunggah.' }, { status: 404 });
  }

  // 3. Create 1-hour signed URL from private bucket
  const { data: signedData, error: signErr } = await admin.storage
    .from('reservation-proofs')
    .createSignedUrl(res.payment_proof_url, 3600);

  if (signErr || !signedData?.signedUrl) {
    console.error('[admin/reservations/proof] createSignedUrl error:', signErr);
    return NextResponse.json({ error: 'Gagal membuat tautan bukti pembayaran.' }, { status: 500 });
  }

  return NextResponse.json({
    ok:        true,
    signedUrl: signedData.signedUrl,
  });
}
