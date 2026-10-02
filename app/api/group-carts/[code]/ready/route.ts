/**
 * POST /api/group-carts/[code]/ready
 *
 * Toggles the calling member's is_ready flag.
 *
 * Body: { is_ready: boolean }
 * Rate limit: 60 req/min per IP+code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAdminClient, getIP,
  checkGroupRateLimit,
  findActiveCart,
  requireMemberToken,
  err400, err500,
  bumpVersion,
} from '@/lib/group-cart-server';

const ReadySchema = z.object({
  is_ready: z.boolean(),
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

  const parsed = ReadySchema.safeParse(body);
  if (!parsed.success) {
    return err400(parsed.error.errors[0]?.message ?? 'Input tidak valid.');
  }

  const supabaseAdmin = getAdminClient();

  const cartResult = await findActiveCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  const memberResult = await requireMemberToken(request, supabaseAdmin, cart.id);
  if ('res' in memberResult) return memberResult.res;
  const { member } = memberResult;

  const { error } = await supabaseAdmin
    .from('group_cart_members')
    .update({ is_ready: parsed.data.is_ready })
    .eq('id', member.id);

  if (error) {
    console.error('[group-carts/ready] update error:', error.message);
    return err500('Gagal memperbarui status siap.');
  }

  await bumpVersion(supabaseAdmin, cart.id);
  return NextResponse.json({ ok: true });
}
