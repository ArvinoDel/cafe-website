/**
 * lib/order-pricing.ts
 *
 * Server-only helper that validates and prices a list of ordered lines against
 * the database.  Extracted from app/api/orders/create/route.ts so that the
 * group-cart API (/api/group-carts/[code]) can reuse the exact same logic
 * without duplicating availability rules or price overrides.
 *
 * IMPORTANT: This module is server-only (it calls supabaseAdmin). Never import
 * it from client-side code.
 *
 * Usage:
 *   import { priceOrderLines } from '@/lib/order-pricing';
 *
 *   const result = await priceOrderLines(supabaseAdmin, branchId, lines);
 *   if ('error' in result) {
 *     return NextResponse.json({ error: result.error.message }, { status: result.error.status });
 *   }
 *   const { snapshot, subtotal, total } = result;
 */

type AnySupabaseClient = { from: (table: string) => any };

// ─── Types ────────────────────────────────────────────────────────────────────

/** One line of input: a menu item id, desired quantity, and optional note. */
export type PricingLine = {
  id: string;       // menu_items.id
  quantity: number; // 1–99
  note: string | null;
};

/** A single item in the server-authoritative order snapshot. */
export type OrderItemSnapshot = {
  id: string;
  name: string;
  price: number;          // unit price (custom or global)
  image_url: string | null;
  quantity: number;
  note?: string | null;
  /** Added by which group-cart member (name).  Present only for group orders. */
  added_by?: string;
};

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

/** Returned on validation / availability error. */
export type PricingError = {
  error: {
    status: number;
    message: string;
    code?: string;
  };
};

/** Returned on success. */
export type PricingSuccess = {
  snapshot: OrderItemSnapshot[];
  subtotal: number;
  /** total === subtotal for now; single place to add tax/service charge later. */
  total: number;
};

// ─── Main helper ──────────────────────────────────────────────────────────────

/**
 * priceOrderLines
 *
 * Given an already-consolidated list of lines (each with a unique id+note key),
 * fetches menu item data and branch overrides from the DB, validates
 * availability, applies custom prices, and returns the authoritative snapshot.
 *
 * Error messages are identical to those in the original orders/create route so
 * the behaviour visible to clients stays unchanged.
 *
 * @param supabaseAdmin  Service-role Supabase client.
 * @param branchId       Resolved branch UUID.
 * @param lines          Consolidated lines (duplicates already merged by caller).
 *
 * @returns PricingError | PricingSuccess
 */
export async function priceOrderLines(
  supabaseAdmin: AnySupabaseClient,
  branchId: string,
  lines: PricingLine[],
): Promise<PricingError | PricingSuccess> {
  if (lines.length === 0) {
    return {
      error: { status: 400, message: 'Pesanan tidak boleh kosong.' },
    };
  }

  const itemIds = Array.from(new Set(lines.map((l) => l.id)));

  // ── Step 1: Load menu items ─────────────────────────────────────────────────
  const { data: menuItems, error: menuErr } = await supabaseAdmin
    .from('menu_items')
    .select('id, name, price, image_url, is_available')
    .in('id', itemIds);

  if (menuErr) {
    return { error: { status: 500, message: 'Gagal memuat data menu.' } };
  }

  const menuMap = new Map<string, MenuItem>(
    (menuItems ?? []).map((m: MenuItem) => [m.id, m]),
  );

  // ── Step 2: Load branch-specific overrides ──────────────────────────────────
  const { data: branchMenuRows, error: branchMenuErr } = await supabaseAdmin
    .from('branch_menu_items')
    .select('menu_item_id, is_available, is_enabled, custom_price')
    .eq('branch_id', branchId)
    .in('menu_item_id', itemIds);

  if (branchMenuErr) {
    return {
      error: { status: 500, message: 'Gagal memuat ketersediaan menu di cabang.' },
    };
  }

  const branchMenuMap = new Map<string, BranchMenuItem>(
    (branchMenuRows ?? []).map((r: BranchMenuItem) => [r.menu_item_id, r]),
  );

  // ── Step 3: Validate each line and build snapshot ───────────────────────────
  const snapshot: OrderItemSnapshot[] = [];
  let subtotal = 0;

  for (const line of lines) {
    const menuItem = menuMap.get(line.id);
    if (!menuItem) {
      return {
        error: { status: 409, message: 'Salah satu menu tidak ditemukan.' },
      };
    }

    // Global availability
    if (!menuItem.is_available) {
      return {
        error: {
          status: 409,
          message: `Menu "${menuItem.name}" sedang tidak tersedia.`,
        },
      };
    }

    const branchRow = branchMenuMap.get(line.id);

    // Branch-specific availability / enablement
    if (branchRow) {
      if (!branchRow.is_enabled) {
        return {
          error: {
            status: 409,
            message: `Menu "${menuItem.name}" tidak tersedia di cabang ini.`,
          },
        };
      }
      if (!branchRow.is_available) {
        return {
          error: {
            status: 409,
            message: `Menu "${menuItem.name}" sedang habis di cabang ini.`,
          },
        };
      }
    }

    // Server-authoritative price (custom override wins)
    const unitPrice = branchRow?.custom_price ?? menuItem.price;
    subtotal += unitPrice * line.quantity;

    snapshot.push({
      id:        menuItem.id,
      name:      menuItem.name,
      price:     unitPrice,
      image_url: menuItem.image_url,
      quantity:  line.quantity,
      note:      line.note,
    });
  }

  const total = subtotal; // room for future tax/service-charge

  return { snapshot, subtotal, total };
}

/**
 * pricingLineFromGroupItems
 *
 * Convenience helper that converts raw group_cart_items DB rows into
 * the PricingLine[] format expected by priceOrderLines.
 * The caller is responsible for passing only lines that belong to a single cart.
 */
export function pricingLinesFromGroupItems(
  rows: Array<{ menu_item_id: string; quantity: number; note: string | null }>,
): PricingLine[] {
  return rows.map((r) => ({
    id:       r.menu_item_id,
    quantity: r.quantity,
    note:     r.note,
  }));
}
