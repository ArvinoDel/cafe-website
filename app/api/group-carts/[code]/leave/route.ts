/**
 * POST /api/group-carts/[code]/leave
 *
 * Removes the calling member from the group cart and deletes all their items.
 * The host cannot use this endpoint — they must use /cancel instead.
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

  // No request body needed, but reject clearly if malformed
  try { await request.text(); } catch { /* ignore */ }

  const supabaseAdmin = getAdminClient();

  const cartResult = await findActiveCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  const memberResult = await requireMemberToken(request, supabaseAdmin, cart.id);
  if ('res' in memberResult) return memberResult.res;
  const { member } = memberResult;

  // Host must cancel instead of leaving
  if (member.id === cart.host_member_id) {
    return err403(
      'Kamu adalah host. Gunakan "Batalkan Sesi" untuk menutup keranjang bersama.',
    );
  }

  // Delete member's items first (FK cascade would handle this, but explicit is clearer)
  await supabaseAdmin
    .from('group_cart_items')
    .delete()
    .eq('cart_id', cart.id)
    .eq('member_id', member.id);

  // Delete the member row
  const { error } = await supabaseAdmin
    .from('group_cart_members')
    .delete()
    .eq('id', member.id);

  if (error) {
    console.error('[group-carts/leave] delete error:', error.message);
    return err500('Gagal meninggalkan keranjang bersama. Silakan coba lagi.');
  }

  await bumpVersion(supabaseAdmin, cart.id);
  return NextResponse.json({ ok: true });
}

// Prevent accidental GET
export async function GET() {
  return err400('Gunakan POST untuk meninggalkan keranjang bersama.');
}
