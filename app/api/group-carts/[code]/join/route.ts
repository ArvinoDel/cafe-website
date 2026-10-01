/**
 * POST /api/group-carts/[code]/join
 *
 * Joins an open group cart as a new member.
 *
 * Body: { name: string }
 * Returns: { member_id, member_token }
 *
 * Rate limit: 30 req/min per IP.
 * Errors: 400 (validation), 409 (full), 410 (closed/expired).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAdminClient, getIP, sanitizeName,
  checkGroupRateLimit,
  findActiveCart,
  generateMemberToken,
  err400, err409, err500,
  bumpVersion,
} from '@/lib/group-cart-server';

const MAX_MEMBERS = 12;

const JoinSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.').max(30, 'Nama maksimal 30 karakter.'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code?.toUpperCase() ?? '';
  const ip   = getIP(request);

  // Rate limit
  const limited = checkGroupRateLimit('join', ip);
  if (limited) return limited;

  // Parse + validate body
  let body: unknown;
  try { body = await request.json(); }
  catch { return err400('Format permintaan tidak valid.'); }

  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    return err400(parsed.error.errors[0]?.message ?? 'Input tidak valid.');
  }

  const name = sanitizeName(parsed.data.name);
  if (!name) return err400('Nama tidak boleh kosong.');

  const supabaseAdmin = getAdminClient();

  // Load cart (must be open and not expired)
  const cartResult = await findActiveCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  // Count current members
  const { count, error: countErr } = await supabaseAdmin
    .from('group_cart_members')
    .select('id', { count: 'exact', head: true })
    .eq('cart_id', cart.id);

  if (countErr) {
    console.error('[group-carts/join] count error:', countErr.message);
    return err500('Gagal memeriksa jumlah anggota.');
  }

  if ((count ?? 0) >= MAX_MEMBERS) {
    return err409(`Keranjang bersama sudah penuh (maksimal ${MAX_MEMBERS} orang).`);
  }

  // Insert new member with a fresh secret token
  const memberToken = generateMemberToken();
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('group_cart_members')
    .insert({ cart_id: cart.id, token: memberToken, name })
    .select('id')
    .single();

  if (memberErr) {
    console.error('[group-carts/join] member insert error:', memberErr.message);
    return err500('Gagal bergabung ke keranjang bersama. Silakan coba lagi.');
  }

  // Bump cart version so existing members see the new joiner
  await bumpVersion(supabaseAdmin, cart.id, cart.version);

  return NextResponse.json(
    { member_id: member.id, member_token: memberToken },
    { status: 201 },
  );
}
