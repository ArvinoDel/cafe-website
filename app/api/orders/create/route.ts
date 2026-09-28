/**
 * POST /api/orders/create
 *
 * Server-side order creation endpoint. Validates the cart, resolves prices
 * from the database, and inserts the order via the service-role admin client.
 *
 * The client must NOT send prices, subtotal, total, or status — those are
 * all computed/enforced here.
 *
 * Request body:
 *   {
 *     customer_name: string,
 *     table_number:  string,
 *     branch_id?:    string (UUID — omit if site has exactly one branch),
 *     payment_method:'cash' | 'qris',
 *     notes?:        string,
 *     items: Array<{ id: string, quantity: number }>
 *   }
 *
 * Success response (201):
 *   { order: { order_code, status, items, subtotal, total, created_at, ... } }
 *
 * Error responses: 400 (validation), 409 (unavailable item), 500 (server).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-server';
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
  customer_name:  z.string().trim().min(1, 'Nama pemesan wajib diisi.').max(100, 'Nama terlalu panjang.'),
  table_number:   z.string().trim().min(1, 'Nomor meja wajib diisi.').max(50, 'Nomor meja terlalu panjang.'),
  branch_id:      z.string().uuid('Branch ID tidak valid.').optional(),
  payment_method: z.enum(['cash', 'qris'], { errorMap: () => ({ message: 'Metode pembayaran tidak valid.' }) }),
  notes:          z.string().trim().max(500, 'Catatan terlalu panjang.').optional(),
  items: z
    .array(
      z.object({
        id:       z.string().uuid('ID menu tidak valid.'),
        quantity: z.number().int().min(1, 'Jumlah minimum 1.').max(99, 'Jumlah maksimum 99.'),
      }),
    )
    .min(1, 'Pesanan tidak boleh kosong.')
    .max(50, 'Terlalu banyak item dalam satu pesanan.'),
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

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
};

type BranchMenuItem = {
  menu_item_id: string;
  is_available: boolean;
  is_enabled: boolean;
  custom_price: number | null;
};

// The shape stored in orders.items — must stay compatible with status/orders/admin pages
type OrderItemSnapshot = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
};

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

  const { customer_name, table_number, branch_id: clientBranchId, payment_method, notes, items } = parsed.data;

  const env = resolveEnv();
  const supabaseAdmin = createAdminClient({ env });

  // 2. Resolve branch
  let resolvedBranchId: string;

  if (clientBranchId) {
    // Validate provided branch_id exists
    const { data: branch, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id')
      .eq('id', clientBranchId)
      .maybeSingle();

    if (branchErr || !branch) {
      return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 400 });
    }
    resolvedBranchId = branch.id as string;
  } else {
    // Auto-resolve: only works when there is exactly one branch
    const { data: branches, error: branchListErr } = await supabaseAdmin
      .from('branches')
      .select('id');

    if (branchListErr) {
      return NextResponse.json({ error: 'Gagal memverifikasi cabang.' }, { status: 500 });
    }

    if (!branches || branches.length === 0) {
      return NextResponse.json({ error: 'Tidak ada cabang yang terdaftar.' }, { status: 400 });
    }

    if (branches.length > 1) {
      return NextResponse.json(
        { error: 'Cabang tidak dapat ditentukan secara otomatis. Silakan scan QR meja terlebih dahulu.' },
        { status: 400 },
      );
    }

    resolvedBranchId = branches[0].id as string;
  }

  // 3. Deduplicate item IDs from the request
  const itemIdSet = new Set<string>(items.map((i) => i.id));
  const itemIds = Array.from(itemIdSet);
  const quantityMap = new Map<string, number>();
  for (const item of items) {
    // If duplicate ids were submitted, sum their quantities
    quantityMap.set(item.id, (quantityMap.get(item.id) ?? 0) + item.quantity);
  }

  // 4. Load menu items from DB
  const { data: menuItems, error: menuErr } = await supabaseAdmin
    .from('menu_items')
    .select('id, name, price, image_url, is_available')
    .in('id', itemIds);

  if (menuErr) {
    return NextResponse.json({ error: 'Gagal memuat data menu.' }, { status: 500 });
  }

  const menuMap = new Map<string, MenuItem>(
    (menuItems ?? []).map((m) => [m.id as string, m as MenuItem]),
  );

  // 5. Load branch-specific overrides
  const { data: branchMenuRows, error: branchMenuErr } = await supabaseAdmin
    .from('branch_menu_items')
    .select('menu_item_id, is_available, is_enabled, custom_price')
    .eq('branch_id', resolvedBranchId)
    .in('menu_item_id', itemIds);

  if (branchMenuErr) {
    return NextResponse.json({ error: 'Gagal memuat ketersediaan menu di cabang.' }, { status: 500 });
  }

  const branchMenuMap = new Map<string, BranchMenuItem>(
    (branchMenuRows ?? []).map((r) => [r.menu_item_id as string, r as BranchMenuItem]),
  );

  // 6. Validate each requested item and build snapshot
  const snapshot: OrderItemSnapshot[] = [];
  let subtotal = 0;

  for (const itemId of itemIds) {
    const menuItem = menuMap.get(itemId);
    if (!menuItem) {
      return NextResponse.json({ error: 'Salah satu menu tidak ditemukan.' }, { status: 409 });
    }

    // Check global availability
    if (!menuItem.is_available) {
      return NextResponse.json(
        { error: `Menu "${menuItem.name}" sedang tidak tersedia.` },
        { status: 409 },
      );
    }

    const branchRow = branchMenuMap.get(itemId);

    // Check branch-specific availability / enablement
    if (branchRow) {
      if (!branchRow.is_enabled) {
        return NextResponse.json(
          { error: `Menu "${menuItem.name}" tidak tersedia di cabang ini.` },
          { status: 409 },
        );
      }
      if (!branchRow.is_available) {
        return NextResponse.json(
          { error: `Menu "${menuItem.name}" sedang habis di cabang ini.` },
          { status: 409 },
        );
      }
    }

    // Server-authoritative price
    const unitPrice = branchRow?.custom_price ?? menuItem.price;
    const quantity = quantityMap.get(itemId) ?? 1;

    subtotal += unitPrice * quantity;

    snapshot.push({
      id:        menuItem.id,
      name:      menuItem.name,
      price:     unitPrice,
      image_url: menuItem.image_url,
      quantity,
    });
  }

  // total = subtotal for now; a single place to add tax/service charge later
  const total = subtotal;

  // 7. Generate order code and insert (retry up to 3 times on unique violation)
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const orderCode = generateCode();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('orders')
      .insert({
        order_code:     orderCode,
        customer_name,
        table_number,
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
