/**
 * POST /api/group-carts/[code]/cancel
 *
 * Host-only. Cancels the group cart session.
 * All members are notified on the next poll (status becomes 'cancelled').
 *
 * Rate limit: 60 req/min per IP+code.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminClient, getIP,
  checkGroupRateLimit,
  findActiveCart,
  requireMemberToken,
  err400, err403, err500,
  bumpVersion,
} from '@/lib/group-cart-server';

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code?.toUpperCase() ?? '';
  const ip   = getIP(request);

  const limited = checkGroupRateLimit('mutate', ip, code);
  if (limited) return limited;

  try { await request.text(); } catch { /* ignore */ }

  const supabaseAdmin = getAdminClient();

  const cartResult = await findActiveCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  const memberResult = await requireMemberToken(request, supabaseAdmin, cart.id);
  if ('res' in memberResult) return memberResult.res;
  const { member } = memberResult;

  if (member.id !== cart.host_member_id) {
    return err403('Hanya host yang bisa membatalkan sesi keranjang bersama.');
  }

  const { error } = await supabaseAdmin
    .from('group_carts')
    .update({ status: 'cancelled' })
    .eq('id', cart.id)
    .eq('status', 'open'); // guard against race

  if (error) {
    console.error('[group-carts/cancel] update error:', error.message);
    return err500('Gagal membatalkan keranjang bersama. Silakan coba lagi.');
  }

  // Bump version so all pollers immediately see the 'cancelled' status
  await bumpVersion(supabaseAdmin, cart.id, cart.version);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return err400('Gunakan POST untuk membatalkan sesi.');
}
