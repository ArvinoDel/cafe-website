/**
 * POST /api/group-carts
 *
 * Creates a new group cart and its host member.
 *
 * Body: { branch_id?: string, table_number: string, name: string }
 * Returns: { code, member_id, member_token }
 *
 * Rate limit: 10 requests / hour per IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAdminClient, getIP, sanitizeName,
  checkGroupRateLimit,
  generateGroupCode, generateMemberToken,
  err400, err500, pausedRes,
} from '@/lib/group-cart-server';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const CreateGroupCartSchema = z.object({
  branch_id:    z.string().uuid('Branch ID tidak valid.').optional(),
  table_number: z.string().trim().min(1, 'Nomor meja wajib diisi.').max(50, 'Nomor meja terlalu panjang.'),
  name:         z.string().min(1, 'Nama wajib diisi.').max(30, 'Nama maksimal 30 karakter.'),
});

// ─── Branch resolver (mirrors orders/create exactly — same messages) ──────────

type BranchData = { id: string; accepting_orders: boolean | null; pause_message: string | null };
type AdminClient = { from: (t: string) => any };

async function resolveBranch(
  supabaseAdmin: AdminClient,
  clientBranchId: string | undefined,
): Promise<{ branchId: string } | { response: NextResponse }> {
  if (clientBranchId) {
    let { data, error } = await supabaseAdmin
      .from('branches')
      .select('id, accepting_orders, pause_message')
      .eq('id', clientBranchId)
      .maybeSingle();

    // Fallback for older schemas without the accepting_orders column
    if (error && (error as { code?: string }).code === '42703') {
      const fallback = await supabaseAdmin
        .from('branches').select('id').eq('id', clientBranchId).maybeSingle();
      data = fallback.data ? { id: fallback.data.id, accepting_orders: true, pause_message: null } : null;
      error = fallback.error;
    }

    if (error || !data) return { response: err400('Cabang tidak ditemukan.') };
    const branch = data as BranchData;
    if (branch.accepting_orders === false) return { response: pausedRes(branch.pause_message) };
    return { branchId: branch.id };
  }

  // Auto-resolve — single-branch sites only
  let { data: rows, error } = await supabaseAdmin
    .from('branches')
    .select('id, accepting_orders, pause_message');

  if (error && (error as { code?: string }).code === '42703') {
    const fallback = await supabaseAdmin.from('branches').select('id');
    rows = fallback.data
      ? fallback.data.map((b: { id: string }) => ({ id: b.id, accepting_orders: true, pause_message: null }))
      : null;
    error = fallback.error;
  }

  if (error) return { response: err500('Gagal memverifikasi cabang.') };
  const branches = (rows ?? []) as BranchData[];
  if (branches.length === 0) return { response: err400('Tidak ada cabang yang terdaftar.') };
  if (branches.length > 1) {
    return {
      response: err400(
        'Cabang tidak dapat ditentukan secara otomatis. Silakan scan QR meja terlebih dahulu.',
      ),
    };
  }
  const single = branches[0];
  if (single.accepting_orders === false) return { response: pausedRes(single.pause_message) };
  return { branchId: single.id };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = getIP(request);
  const limited = checkGroupRateLimit('create', ip);
  if (limited) return limited;

  // Parse + validate
  let body: unknown;
  try { body = await request.json(); }
  catch { return err400('Format permintaan tidak valid.'); }

  const parsed = CreateGroupCartSchema.safeParse(body);
  if (!parsed.success) {
    return err400(parsed.error.errors[0]?.message ?? 'Input tidak valid.');
  }

  const { branch_id, table_number, name: rawName } = parsed.data;
  const name = sanitizeName(rawName);
  if (!name) return err400('Nama tidak boleh kosong.');

  const supabaseAdmin = getAdminClient();

  // Resolve branch (same logic + messages as orders/create)
  const branchResult = await resolveBranch(supabaseAdmin, branch_id);
  if ('response' in branchResult) return branchResult.response;
  const { branchId } = branchResult;

  // Generate cart code (retry up to 5 times on collision)
  const MAX_TRIES = 5;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const code = generateGroupCode();

    // Insert the cart (no host_member_id yet — circular FK)
    const { data: cart, error: cartErr } = await supabaseAdmin
      .from('group_carts')
      .insert({
        code,
        branch_id:  branchId,
        table_number: table_number.trim(),
        status:     'open',
      })
      .select('id')
      .single();

    if (cartErr) {
      const pgCode = (cartErr as { code?: string }).code;
      if (pgCode === '23505' && attempt < MAX_TRIES) continue; // code collision
      console.error('[group-carts] cart insert error:', cartErr);
      return err500('Terjadi kesalahan. Coba lagi.');
    }

    // Insert host member
    const memberToken = generateMemberToken();
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('group_cart_members')
      .insert({
        cart_id: cart.id,
        token:   memberToken,
        name,
      })
      .select('id')
      .single();

    if (memberErr) {
      console.error('[group-carts] member insert error:', memberErr);
      // Clean up the dangling cart
      await supabaseAdmin.from('group_carts').delete().eq('id', cart.id);
      return err500('Terjadi kesalahan. Coba lagi.');
    }

    // Set host_member_id and initial version
    await supabaseAdmin
      .from('group_carts')
      .update({ host_member_id: member.id, version: 1 })
      .eq('id', cart.id);

    return NextResponse.json(
      { code, member_id: member.id, member_token: memberToken },
      { status: 201 },
    );
  }

  return err500('Gagal membuat kode keranjang. Silakan coba lagi.');
}
