/**
 * POST /api/orders/create
 *
 * Server-side order creation endpoint. Validates the cart, resolves prices
 * from the database, and inserts the order via the service-role admin client.
 *
 * The client must NOT send prices, subtotal, total, or status — those are
 * all computed/enforced here.
 *
 * Request body (solo order):
 *   {
 *     customer_name: string,
 *     table_number:  string,
 *     branch_id?:    string (UUID — omit if site has exactly one branch),
 *     payment_method:'cash' | 'qris',
 *     notes?:        string,
 *     items: Array<{ id: string, quantity: number, note?: string | null }>
 *   }
 *
 * Request body (group order — items array is ignored):
 *   {
 *     customer_name?:     string (falls back to host name from cart),
 *     payment_method:     'cash' | 'qris',
 *     notes?:             string,
 *     group_cart_code:    string,
 *     member_token:       string  (must belong to the HOST)
 *   }
 *
 * Success response (201):
 *   { order: { order_code, status, items, subtotal, total, created_at, ... } }
 *
 * Error responses: 400 (validation), 409 (unavailable item, ORDERS_PAUSED, or
 *   cart already submitted), 410 (cart expired/closed), 500 (server).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
import { priceOrderLines, pricingLinesFromGroupItems, evaluatePriceLines } from '@/lib/order-pricing';
import { getItemLineKey, type SelectedOption } from '@/lib/item-options';
import type { SupabaseEnv } from '@supabase/server';

// ─── Env helper ──────────────────────────────────────────────────────────────

function resolveEnv(): Partial<SupabaseEnv> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const env: Partial<SupabaseEnv> = {};
  if (url) env.url = url;
  if (publishableKey) env.publishableKeys = { default: publishableKey };
  if (secretKey) env.secretKeys = { default: secretKey };
  return env;
}

// ─── Zod schema ──────────────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  customer_name:  z.string().trim().min(1, 'Nama pemesan wajib diisi.').max(100, 'Nama terlalu panjang.').optional(),
  table_number:   z.string().trim().min(1, 'Nomor meja wajib diisi.').max(50, 'Nomor meja terlalu panjang.').optional(),
  branch_id:      z.string().uuid('Branch ID tidak valid.').optional(),
  payment_method: z.enum(['cash', 'qris'], { errorMap: () => ({ message: 'Metode pembayaran tidak valid.' }) }),
  notes:          z.string().trim().max(500, 'Catatan terlalu panjang.').optional(),
  // Solo order items — required unless group_cart_code is present
  items: z
    .array(
      z.object({
        id:       z.string().uuid('ID menu tidak valid.'),
        quantity: z.number().int().min(1, 'Jumlah minimum 1.').max(99, 'Jumlah maksimum 99.'),
        note:     z.string().trim().max(100, 'Catatan per item maksimal 100 karakter.').nullish(),
        selected_options: z
          .array(
            z.object({
              groupId: z.string(),
              groupName: z.string(),
              choiceId: z.string(),
              choiceName: z.string(),
              price: z.number().min(0),
            }),
          )
          .nullish(),
      }),
    )
    .min(1, 'Pesanan tidak boleh kosong.')
    .max(50, 'Terlalu banyak item dalam satu pesanan.')
    .optional(),
  // Group order fields — when present, items array is ignored
  group_cart_code: z.string().min(1).max(10).optional(),
  member_token:    z.string().min(1).optional(),
});

// ─── Code generator ──────────────────────────────────────────────────────────

// Unambiguous alphabet: excludes visually-similar chars 0/O, 1/I/L
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = '';
  // Use crypto.getRandomValues for cryptographic randomness
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  const arr = Array.from(bytes);
  for (let i = 0; i < arr.length; i++) {
    code += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  }
  return code;
}

// ─── Branch resolver (shared between solo and group flows) ───────────────────

type BranchRow = { id: string; accepting_orders: boolean | null; pause_message: string | null };
type AdminClient = { from: (table: string) => any };

async function resolveBranch(
  supabaseAdmin: AdminClient,
  clientBranchId: string | undefined,
): Promise<{ branch: BranchRow } | { response: NextResponse }> {
  if (clientBranchId) {
    // Validate provided branch_id exists and load pause status
    let { data: branchRaw, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id, accepting_orders, pause_message')
      .eq('id', clientBranchId)
      .maybeSingle();

    if (branchErr && (branchErr as { code?: string }).code === '42703') {
      const fallback = await supabaseAdmin
        .from('branches')
        .select('id')
        .eq('id', clientBranchId)
        .maybeSingle();
      branchRaw = fallback.data
        ? ({ id: fallback.data.id, accepting_orders: true, pause_message: null } as BranchRow)
        : null;
      branchErr = fallback.error;
    }

    if (branchErr || !branchRaw) {
      return { response: NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 400 }) };
    }

    const branch = branchRaw as BranchRow;

    // Guard: branch is paused
    if (branch.accepting_orders === false) {
      return {
        response: NextResponse.json(
          {
            error: branch.pause_message ||
              'Maaf, pemesanan sedang dijeda sementara. Silakan hubungi barista ya.',
            code: 'ORDERS_PAUSED',
          },
          { status: 409 },
        ),
      };
    }

    return { branch };
  } else {
    // Auto-resolve: only works when there is exactly one branch
    let { data: branchesRaw, error: branchListErr } = await supabaseAdmin
      .from('branches')
      .select('id, accepting_orders, pause_message');

    if (branchListErr && (branchListErr as { code?: string }).code === '42703') {
      const fallback = await supabaseAdmin.from('branches').select('id');
      branchesRaw = fallback.data
        ? fallback.data.map((b: { id: string }) => ({ id: b.id, accepting_orders: true, pause_message: null } as BranchRow))
        : null;
      branchListErr = fallback.error;
    }

    if (branchListErr) {
      return { response: NextResponse.json({ error: 'Gagal memverifikasi cabang.' }, { status: 500 }) };
    }

    const branches = (branchesRaw ?? []) as BranchRow[];

    if (branches.length === 0) {
      return { response: NextResponse.json({ error: 'Tidak ada cabang yang terdaftar.' }, { status: 400 }) };
    }

    if (branches.length > 1) {
      return {
        response: NextResponse.json(
          { error: 'Cabang tidak dapat ditentukan secara otomatis. Silakan scan QR meja terlebih dahulu.' },
          { status: 400 },
        ),
      };
    }

    const singleBranch = branches[0];

    // Guard: branch is paused
    if (singleBranch.accepting_orders === false) {
      return {
        response: NextResponse.json(
          {
            error: singleBranch.pause_message ||
              'Maaf, pemesanan sedang dijeda sementara. Silakan hubungi barista ya.',
            code: 'ORDERS_PAUSED',
          },
          { status: 409 },
        ),
      };
    }

    return { branch: singleBranch };
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }

  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Input tidak valid.';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { customer_name, table_number, branch_id: clientBranchId, payment_method, notes, items, group_cart_code, member_token } = parsed.data;

  const isGroupOrder = !!group_cart_code && !!member_token;

  // Extra validation for solo path
  if (!isGroupOrder) {
    if (!customer_name) {
      return NextResponse.json({ error: 'Nama pemesan wajib diisi.' }, { status: 400 });
    }
    if (!table_number) {
      return NextResponse.json({ error: 'Nomor meja wajib diisi.' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Pesanan tidak boleh kosong.' }, { status: 400 });
    }
  }

  const env = resolveEnv();
  const supabaseAdmin = createAdminClient({ env });

  // ─── GROUP ORDER FLOW ─────────────────────────────────────────────────────
  if (isGroupOrder) {
    // 2a. Load the group cart and verify the token is the host's
    const { data: cartRow, error: cartErr } = await supabaseAdmin
      .from('group_carts')
      .select('id, status, expires_at, branch_id, table_number, host_member_id, version')
      .eq('code', group_cart_code!)
      .maybeSingle();

    if (cartErr) {
      console.error('[orders/create] group cart lookup error:', cartErr.message);
      return NextResponse.json({ error: 'Gagal memuat keranjang bersama.' }, { status: 500 });
    }

    if (!cartRow) {
      return NextResponse.json({ error: 'Keranjang bersama tidak ditemukan.' }, { status: 410 });
    }

    if (cartRow.status !== 'open') {
      return NextResponse.json(
        { error: 'Pesanan bareng sudah dikirim atau ditutup.' },
        { status: 409 },
      );
    }

    if (new Date(cartRow.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Keranjang bersama sudah kedaluwarsa.' },
        { status: 410 },
      );
    }

    // Verify token belongs to the host member
    const { data: hostMember, error: memberErr } = await supabaseAdmin
      .from('group_cart_members')
      .select('id, name')
      .eq('cart_id', cartRow.id)
      .eq('token', member_token!)
      .maybeSingle();

    if (memberErr) {
      console.error('[orders/create] host member lookup error:', memberErr.message);
      return NextResponse.json({ error: 'Gagal memverifikasi anggota.' }, { status: 500 });
    }

    if (!hostMember) {
      return NextResponse.json({ error: 'Token tidak valid.' }, { status: 403 });
    }

    if (hostMember.id !== cartRow.host_member_id) {
      return NextResponse.json(
        { error: 'Hanya host yang dapat mengirim pesanan bersama.' },
        { status: 403 },
      );
    }

    // 2b. Verify branch is not paused
    const branchResult = await resolveBranch(supabaseAdmin, cartRow.branch_id);
    if ('response' in branchResult) return branchResult.response;

    // 2c. Load all group cart items with member names
    const { data: groupItems, error: itemsErr } = await supabaseAdmin
      .from('group_cart_items')
      .select(`
        id,
        menu_item_id,
        quantity,
        note,
        member_id,
        group_cart_members!member_id(name)
      `)
      .eq('cart_id', cartRow.id);

    if (itemsErr) {
      console.error('[orders/create] group items fetch error:', itemsErr.message);
      return NextResponse.json({ error: 'Gagal memuat item keranjang bersama.' }, { status: 500 });
    }

    if (!groupItems || groupItems.length === 0) {
      return NextResponse.json({ error: 'Keranjang bersama masih kosong.' }, { status: 400 });
    }

    // 2d. Price the items using the shared helper
    const pricingLines = pricingLinesFromGroupItems(
      (groupItems as any[]).map((r) => ({ menu_item_id: r.menu_item_id, quantity: r.quantity, note: r.note ?? null }))
    );
    const pricingResult = await priceOrderLines(supabaseAdmin as any, cartRow.branch_id, pricingLines);

    if ('error' in pricingResult) {
      return NextResponse.json(
        { error: pricingResult.error.message, code: pricingResult.error.code },
        { status: pricingResult.error.status },
      );
    }

    // Attach added_by to each snapshot item
    // groupItems is ordered the same as pricingLines/snapshot
    const snapshotWithAttribution = pricingResult.snapshot.map((snap, i) => ({
      ...snap,
      added_by: (groupItems[i] as any)?.group_cart_members?.name ?? undefined,
    }));

    // 2e. Atomically claim the cart (prevent double-submission)
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('group_carts')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', cartRow.id)
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();

    if (claimErr) {
      console.error('[orders/create] cart claim error:', claimErr.message);
      return NextResponse.json({ error: 'Gagal mengunci keranjang bersama.' }, { status: 500 });
    }

    if (!claimed) {
      return NextResponse.json(
        { error: 'Pesanan bareng sudah dikirim atau ditutup.' },
        { status: 409 },
      );
    }

    // Bump version right after cart is claimed as submitted
    await (supabaseAdmin as any).rpc('bump_group_cart_version', { p_cart_id: cartRow.id });

    // 2f. Insert the order
    const resolvedCustomerName = customer_name?.trim() || hostMember.name;
    const { subtotal, total } = pricingResult;

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const orderCode = generateCode();

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('orders')
        .insert({
          order_code:     orderCode,
          customer_name:  resolvedCustomerName,
          table_number:   cartRow.table_number,
          branch_id:      cartRow.branch_id,
          items:          snapshotWithAttribution,
          subtotal,
          total,
          payment_method,
          notes:          notes?.trim() || null,
          status:         'pending',
        })
        .select('id, order_code, customer_name, table_number, branch_id, items, subtotal, total, payment_method, notes, status, created_at')
        .single();

      if (insertErr) {
        const pgCode = (insertErr as unknown as { code?: string }).code;
        if (pgCode === '23505' && attempt < MAX_RETRIES) continue;

        // Rollback the cart claim so the host can retry
        await supabaseAdmin
          .from('group_carts')
          .update({ status: 'open', submitted_at: null })
          .eq('id', cartRow.id);
        await (supabaseAdmin as any).rpc('bump_group_cart_version', { p_cart_id: cartRow.id });

        console.error('[orders/create] group order insert error:', insertErr.message);
        return NextResponse.json(
          { error: 'Gagal menyimpan pesanan. Silakan coba lagi.' },
          { status: 500 },
        );
      }

      // 2g. Store order_code on the cart and bump version atomically
      await supabaseAdmin
        .from('group_carts')
        .update({ order_code: orderCode })
        .eq('id', cartRow.id);
      await (supabaseAdmin as any).rpc('bump_group_cart_version', { p_cart_id: cartRow.id });

      return NextResponse.json({ order: inserted }, { status: 201 });
    }

    return NextResponse.json({ error: 'Gagal membuat kode pesanan. Silakan coba lagi.' }, { status: 500 });
  }

  // ─── SOLO ORDER FLOW ──────────────────────────────────────────────────────

  // 2. Resolve branch
  const branchResult = await resolveBranch(supabaseAdmin, clientBranchId);
  if ('response' in branchResult) return branchResult.response;
  const resolvedBranchId = branchResult.branch.id;

  // 3. Consolidate requested items by (id + normalized note + options)
  // Two entries with the exact same id, options, and note are summed; entries with different options/notes remain distinct lines.
  type ConsolidatedLine = {
    id: string;
    quantity: number;
    note: string | null;
    selected_options?: SelectedOption[] | null;
  };

  const consolidatedMap = new Map<string, ConsolidatedLine>();
  for (const item of items!) {
    const cleanNote = item.note?.trim() || null;
    const lineKey = getItemLineKey(item.id, cleanNote, item.selected_options);

    const existing = consolidatedMap.get(lineKey);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + item.quantity);
    } else {
      consolidatedMap.set(lineKey, {
        id: item.id,
        quantity: item.quantity,
        note: cleanNote,
        selected_options: item.selected_options || null,
      });
    }
  }

  const consolidatedLines = Array.from(consolidatedMap.values());

  // 4–6. Validate items and build snapshot via shared helper
  const pricingResult = await priceOrderLines(supabaseAdmin as any, resolvedBranchId, consolidatedLines);

  if ('error' in pricingResult) {
    return NextResponse.json(
      { error: pricingResult.error.message, code: pricingResult.error.code },
      { status: pricingResult.error.status },
    );
  }

  const { snapshot, subtotal, total } = pricingResult;

  // 7. Generate order code and insert (retry up to 3 times on unique violation)
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const orderCode = generateCode();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('orders')
      .insert({
        order_code:     orderCode,
        customer_name:  customer_name!,
        table_number:   table_number!,
        branch_id:      resolvedBranchId,
        items:          snapshot,
        subtotal,
        total,
        payment_method,
        notes:          notes?.trim() || null,
        status:         'pending',
      })
      .select('id, order_code, customer_name, table_number, branch_id, items, subtotal, total, payment_method, notes, status, created_at')
      .single();

    if (insertErr) {
      // 23505 = unique_violation — retry with a new code
      const pgCode = (insertErr as unknown as { code?: string }).code;
      if (pgCode === '23505' && attempt < MAX_RETRIES) {
        continue;
      }
      console.error('[orders/create] insert error:', insertErr.message);
      return NextResponse.json(
        { error: 'Gagal menyimpan pesanan. Silakan coba lagi.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ order: inserted }, { status: 201 });
  }

  // Should be unreachable
  return NextResponse.json({ error: 'Gagal membuat kode pesanan. Silakan coba lagi.' }, { status: 500 });
}
