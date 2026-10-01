/**
 * POST /api/group-carts/[code]/kick
 *
 * Host-only. Removes a specific member (and their items) from the cart.
 *
 * Body: { member_id: string }
 * Rate limit: 60 req/min per IP+code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAdminClient, getIP,
  checkGroupRateLimit,
  findActiveCart,
  requireMemberToken,
  err400, err403, err409, err500,
  bumpVersion,
} from '@/lib/group-cart-server';

const KickSchema = z.object({
  member_id: z.string().uuid('ID anggota tidak valid.'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code?.toUpperCase() ?? '';
  const ip   = getIP(request);

  const limited = checkGroupRateLimit('mutate', ip, code);
  if (limited) return limited;

  let body: unknown;
  try { body = await request.json(); }
  catch { return err400('Format permintaan tidak valid.'); }

  const parsed = KickSchema.safeParse(body);
  if (!parsed.success) {
    return err400(parsed.error.errors[0]?.message ?? 'Input tidak valid.');
  }

  const { member_id: targetMemberId } = parsed.data;

  const supabaseAdmin = getAdminClient();

  const cartResult = await findActiveCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  const memberResult = await requireMemberToken(request, supabaseAdmin, cart.id);
  if ('res' in memberResult) return memberResult.res;
  const { member } = memberResult;

  // Only host can kick
  if (member.id !== cart.host_member_id) {
    return err403('Hanya host yang bisa mengeluarkan anggota.');
  }

  // Cannot kick yourself
  if (targetMemberId === member.id) {
    return err409('Kamu tidak bisa mengeluarkan dirimu sendiri. Gunakan "Batalkan Sesi" jika ingin menutup sesi.');
  }

  // Verify target member is in this cart
  const { data: target, error: targetErr } = await supabaseAdmin
    .from('group_cart_members')
    .select('id')
    .eq('id', targetMemberId)
    .eq('cart_id', cart.id)
    .maybeSingle();

  if (targetErr) {
    console.error('[group-carts/kick] target lookup error:', targetErr.message);
    return err500('Gagal memverifikasi anggota.');
  }

  if (!target) {
    return err400('Anggota tidak ditemukan di keranjang ini.');
  }

  // Delete their items first
  await supabaseAdmin
    .from('group_cart_items')
    .delete()
    .eq('cart_id', cart.id)
    .eq('member_id', targetMemberId);

  // Delete member
  const { error } = await supabaseAdmin
    .from('group_cart_members')
    .delete()
    .eq('id', targetMemberId);

  if (error) {
    console.error('[group-carts/kick] delete error:', error.message);
    return err500('Gagal mengeluarkan anggota. Silakan coba lagi.');
  }

  await bumpVersion(supabaseAdmin, cart.id, cart.version);
  return NextResponse.json({ ok: true });
}
