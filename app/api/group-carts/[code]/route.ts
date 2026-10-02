/**
 * GET /api/group-carts/[code]?since=<version>
 *
 * Returns the full cart state for authenticated members.
 * Requires header: x-member-token
 *
 * If version == since: returns { changed: false } (polling shortcut).
 * Otherwise returns the full snapshot.
 *
 * Rate limits:
 *   - 300 req/min per IP  (shared-WiFi ceiling)
 *   - 60  req/min per IP+code
 *
 * HTTP 410 for closed or expired carts (triggers client-side cleanup).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminClient, getIP,
  checkGroupRateLimit,
  findCart,
  requireMemberToken,
  err500,
} from '@/lib/group-cart-server';
import { evaluatePriceLines } from '@/lib/order-pricing';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code?.toUpperCase() ?? '';
  const ip   = getIP(request);

  // Rate limit (read tier — higher per-IP ceiling for shared WiFi)
  const limited = checkGroupRateLimit('read', ip, code);
  if (limited) return limited;

  const supabaseAdmin = getAdminClient();

  // Load cart (any status — so polling detects submitted/cancelled)
  const cartResult = await findCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  // Verify token (must belong to this cart)
  const memberResult = await requireMemberToken(request, supabaseAdmin, cart.id);
  if ('res' in memberResult) return memberResult.res;
  const { member: me } = memberResult;

  // Polling shortcut — if version hasn't changed, client can skip parsing
  const sinceParam = request.nextUrl.searchParams.get('since');
  const sinceVersion = sinceParam !== null ? parseInt(sinceParam, 10) : -1;
  if (!isNaN(sinceVersion) && cart.version === sinceVersion) {
    return NextResponse.json({ changed: false });
  }

  // Load all members (no tokens)
  const { data: membersRaw, error: membersErr } = await supabaseAdmin
    .from('group_cart_members')
    .select('id, name, is_ready, joined_at')
    .eq('cart_id', cart.id)
    .order('joined_at', { ascending: true });

  if (membersErr) {
    console.error('[group-carts/GET] members error:', membersErr.message);
    return err500('Gagal memuat anggota.');
  }

  // Load all items
  const { data: itemsRaw, error: itemsErr } = await supabaseAdmin
    .from('group_cart_items')
    .select('id, member_id, menu_item_id, quantity, note, created_at')
    .eq('cart_id', cart.id)
    .order('created_at', { ascending: true });

  if (itemsErr) {
    console.error('[group-carts/GET] items error:', itemsErr.message);
    return err500('Gagal memuat item keranjang.');
  }

  type RawItem = { id: string; member_id: string; menu_item_id: string; quantity: number; note: string | null; created_at: string };
  const rawItems = (itemsRaw ?? []) as RawItem[];

  // Build a member name lookup for attribution
  type RawMember = { id: string; name: string; is_ready: boolean; joined_at: string };
  const rawMembers = (membersRaw ?? []) as RawMember[];
  const memberNameMap = new Map<string, string>(rawMembers.map((m) => [m.id, m.name]));

  // Price + availability check (non-fatal on sold-out) via shared read-only function
  const evalResult = await evaluatePriceLines(
    supabaseAdmin as any,
    cart.branch_id,
    rawItems.map((r) => ({
      id:           r.id,
      member_id:    r.member_id,
      member_name:  memberNameMap.get(r.member_id) ?? '',
      menu_item_id: r.menu_item_id,
      quantity:     r.quantity,
      note:         r.note,
    })),
  );

  const auditedItems = 'error' in evalResult ? [] : evalResult.lines.map((line) => ({
    id:              line.id,
    member_id:       line.member_id,
    member_name:     line.member_name ?? '',
    menu_item_id:    line.menu_item_id,
    name:            line.name,
    image_url:       line.image_url,
    unit_price:      line.unit_price,
    price:           line.unit_price,
    effective_price: line.unit_price,
    quantity:        line.quantity,
    note:            line.note,
    sold_out:        line.sold_out,
  }));

  // Compute totals
  const per_member_totals: Record<string, number> = {};
  for (const item of auditedItems) {
    per_member_totals[item.member_id] =
      (per_member_totals[item.member_id] ?? 0) + item.unit_price * item.quantity;
  }
  const subtotal = Object.values(per_member_totals).reduce((a, b) => a + b, 0);
  const total = subtotal; // placeholder for future tax/service charge

  const members = rawMembers.map((m) => ({
    id:       m.id,
    name:     m.name,
    is_ready: m.is_ready,
    is_host:  m.id === cart.host_member_id,
    is_me:    m.id === me.id,
  }));

  return NextResponse.json({
    changed:         true,
    code:            cart.code,
    status:          cart.status,
    order_code:      cart.order_code,
    table_number:    cart.table_number,
    branch_id:       cart.branch_id,
    version:         cart.version,
    host_member_id:  cart.host_member_id,
    members,
    items:           auditedItems,
    subtotal,
    total,
    per_member_totals,
  });
}
