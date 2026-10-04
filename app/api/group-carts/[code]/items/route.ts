/**
 * POST /api/group-carts/[code]/items
 *
 * Mutates item lines in a group cart.
 *
 * Body (set/remove):
 *   { action: 'set', menu_item_id: string, quantity: number, note?: string | null }
 *   { action: 'remove', item_id: string }   — host only, removes anyone's line
 *
 * Rules:
 *   - A member can only write their own lines (enforced by member_id check).
 *   - quantity = 0 → delete the line.
 *   - quantity 1..99 → upsert (check availability when adding/increasing).
 *   - action 'remove' (by item_id) → host-only, can remove any member's line.
 *   - Max 40 item lines per cart (counted across all members).
 *
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

const MAX_LINES = 40;

const ItemsSchema = z.discriminatedUnion('action', [
  z.object({
    action:       z.literal('set'),
    menu_item_id: z.string().uuid('ID menu tidak valid.'),
    quantity:     z.number().int().min(0, 'Jumlah minimum 0.').max(99, 'Jumlah maksimum 99.'),
    note:         z.string().trim().max(100, 'Catatan maksimal 100 karakter.').nullish(),
  }),
  z.object({
    action:  z.literal('remove'),
    item_id: z.string().uuid('ID item tidak valid.'),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = params.code?.toUpperCase() ?? '';
  const ip   = getIP(request);

  // Rate limit
  const limited = checkGroupRateLimit('mutate', ip, code);
  if (limited) return limited;

  // Parse + validate body
  let body: unknown;
  try { body = await request.json(); }
  catch { return err400('Format permintaan tidak valid.'); }

  const parsed = ItemsSchema.safeParse(body);
  if (!parsed.success) {
    return err400(parsed.error.errors[0]?.message ?? 'Input tidak valid.');
  }

  const supabaseAdmin = getAdminClient();

  // Load cart
  const cartResult = await findActiveCart(supabaseAdmin, code);
  if ('res' in cartResult) return cartResult.res;
  const { cart } = cartResult;

  // Auth
  const memberResult = await requireMemberToken(request, supabaseAdmin, cart.id);
  if ('res' in memberResult) return memberResult.res;
  const { member } = memberResult;
  const isHost = member.id === cart.host_member_id;

  const input = parsed.data;

  // ── action: 'remove' (host only, by item_id) ──────────────────────────────
  if (input.action === 'remove') {
    if (!isHost) return err403('Hanya host yang bisa menghapus item anggota lain.');

    const { error } = await supabaseAdmin
      .from('group_cart_items')
      .delete()
      .eq('id', input.item_id)
      .eq('cart_id', cart.id);

    if (error) {
      console.error('[group-carts/items] remove error:', error.message);
      return err500('Gagal menghapus item.');
    }

    await bumpVersion(supabaseAdmin, cart.id);
    return NextResponse.json({ ok: true });
  }

  // ── action: 'set' ──────────────────────────────────────────────────────────
  const { menu_item_id, quantity, note: rawNote } = input;
  const note = rawNote?.trim() || null;

  // Find existing line for this member+item+note combination
  let existingQuery = supabaseAdmin
    .from('group_cart_items')
    .select('id, quantity')
    .eq('cart_id', cart.id)
    .eq('member_id', member.id)
    .eq('menu_item_id', menu_item_id);

  existingQuery = note === null
    ? existingQuery.is('note', null)
    : existingQuery.eq('note', note);

  const { data: existing, error: existErr } = await existingQuery.maybeSingle();
  if (existErr) {
    console.error('[group-carts/items] existing check error:', existErr.message);
    return err500('Gagal memeriksa item.');
  }

  // quantity = 0 → delete
  if (quantity === 0) {
    if (!existing) return NextResponse.json({ ok: true }); // nothing to delete
    const { error: delErr } = await supabaseAdmin
      .from('group_cart_items')
      .delete()
      .eq('id', existing.id);
    if (delErr) {
      console.error('[group-carts/items] delete error:', delErr.message);
      return err500('Gagal menghapus item.');
    }
    await bumpVersion(supabaseAdmin, cart.id);
    return NextResponse.json({ ok: true });
  }

  // quantity > 0 — verify availability when adding or increasing
  const isIncreasing = !existing || quantity > (existing.quantity ?? 0);
  if (isIncreasing) {
    const { data: menuItem, error: menuErr } = await supabaseAdmin
      .from('menu_items')
      .select('id, name, is_available, options')
      .eq('id', menu_item_id)
      .maybeSingle();

    if (menuErr) return err500('Gagal memuat data menu.');
    if (!menuItem) return err409('Menu tidak ditemukan.');
    if (!menuItem.is_available) {
      return err409(`Menu "${menuItem.name}" sedang tidak tersedia.`);
    }

    if (Array.isArray(menuItem.options) && menuItem.options.length > 0) {
      return err400('Pesan Bareng belum mendukung menu dengan opsi tambahan. Silakan pesan menu ini secara terpisah.');
    }

    const { data: branchRow } = await supabaseAdmin
      .from('branch_menu_items')
      .select('is_available, is_enabled')
      .eq('branch_id', cart.branch_id)
      .eq('menu_item_id', menu_item_id)
      .maybeSingle();

    if (branchRow) {
      if (!branchRow.is_enabled) return err409(`Menu "${menuItem.name}" tidak tersedia di cabang ini.`);
      if (!branchRow.is_available) return err409(`Menu "${menuItem.name}" sedang habis di cabang ini.`);
    }
  }

  if (existing) {
    // Update existing line
    const { error: upErr } = await supabaseAdmin
      .from('group_cart_items')
      .update({ quantity })
      .eq('id', existing.id);
    if (upErr) {
      console.error('[group-carts/items] update error:', upErr.message);
      return err500('Gagal memperbarui item.');
    }
  } else {
    // Check global line limit before inserting
    const { count, error: countErr } = await supabaseAdmin
      .from('group_cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('cart_id', cart.id);
    if (countErr) return err500('Gagal memeriksa jumlah item.');
    if ((count ?? 0) >= MAX_LINES) {
      return err409(`Keranjang sudah penuh (maksimal ${MAX_LINES} item).`);
    }

    const { error: insErr } = await supabaseAdmin
      .from('group_cart_items')
      .insert({ cart_id: cart.id, member_id: member.id, menu_item_id, quantity, note });
    if (insErr) {
      console.error('[group-carts/items] insert error:', insErr.message);
      return err500('Gagal menambahkan item.');
    }
  }

  await bumpVersion(supabaseAdmin, cart.id);
  return NextResponse.json({ ok: true });
}
