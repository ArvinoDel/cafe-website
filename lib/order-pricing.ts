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

import {
  type SelectedOption,
  calculateOptionsTotal,
  buildCombinedNote,
} from '@/lib/item-options';

type AnySupabaseClient = { from: (table: string) => any };

// ─── Types ────────────────────────────────────────────────────────────────────

/** One line of input: a menu item id, desired quantity, optional note and selected options. */
export type PricingLine = {
  id: string;       // menu_items.id
  quantity: number; // 1–99
  note: string | null;
  selected_options?: SelectedOption[] | null;
};

/** A single item in the server-authoritative order snapshot. */
export type OrderItemSnapshot = {
  id: string;
  name: string;
  price: number;          // unit price including selected options (custom or global)
  image_url: string | null;
  quantity: number;
  note?: string | null;
  selected_options?: SelectedOption[] | null;
  /** Added by which group-cart member (name).  Present only for group orders. */
  added_by?: string;
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_sold_out?: boolean | null;
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

// ─── Main read-only helper ───────────────────────────────────────────────────

export type PricingLineInput = {
  id?: string;
  menu_item_id?: string;
  quantity?: number;
  note?: string | null;
  selected_options?: SelectedOption[] | null;
  [key: string]: any;
};

export type EvaluatedPriceLine<T extends PricingLineInput = PricingLineInput> = T & {
  menu_item_id: string;
  name: string;
  image_url: string | null;
  unit_price: number;
  sold_out: boolean;
  sold_out_reason: string | null;
};

/**
 * evaluatePriceLines (also exported as auditPriceLines)
 *
 * Read-only function that resolves menu item data and branch overrides from DB,
 * and returns per-line unit_price and sold_out status without throwing or erroring
 * on sold-out items.
 *
 * Rules:
 *   - Missing menu item: sold_out = true, unit_price = 0
 *   - menuItem.is_available === false or menuItem.is_sold_out === true: sold_out = true
 *   - branchRow.is_enabled === false: sold_out = true
 *   - branchRow.is_available === false: sold_out = true
 *   - unit_price: (branchRow.custom_price ?? menuItem.price) + optionsTotal
 */
export async function evaluatePriceLines<T extends PricingLineInput>(
  supabaseAdmin: AnySupabaseClient,
  branchId: string,
  lines: T[],
): Promise<
  | { error: { status: number; message: string } }
  | { lines: EvaluatedPriceLine<T>[] }
> {
  if (lines.length === 0) {
    return { lines: [] };
  }

  const itemIds = Array.from(
    new Set(lines.map((l) => (l.menu_item_id || l.id || '').trim()).filter(Boolean)),
  );

  const [menuRes, branchRes] = await Promise.all([
    supabaseAdmin
      .from('menu_items')
      .select('id, name, price, image_url, is_available, is_sold_out')
      .in('id', itemIds),
    supabaseAdmin
      .from('branch_menu_items')
      .select('menu_item_id, is_available, is_enabled, custom_price')
      .eq('branch_id', branchId)
      .in('menu_item_id', itemIds),
  ]);

  if (menuRes.error) {
    console.error('[order-pricing] menu fetch error:', menuRes.error);
    return { error: { status: 500, message: 'Gagal memuat data menu.' } };
  }
  if (branchRes.error) {
    console.error('[order-pricing] branch menu fetch error:', branchRes.error);
    return { error: { status: 500, message: 'Gagal memuat ketersediaan menu di cabang.' } };
  }

  const menuMap = new Map<string, MenuItem>(
    (menuRes.data ?? []).map((m: MenuItem) => [m.id, m]),
  );
  const branchMap = new Map<string, BranchMenuItem>(
    (branchRes.data ?? []).map((b: BranchMenuItem) => [b.menu_item_id, b]),
  );

  const evaluated = lines.map((line) => {
    const menuItemId = line.menu_item_id || line.id || '';
    const menuItem = menuMap.get(menuItemId);
    const branchRow = branchMap.get(menuItemId);
    const optionsTotal = calculateOptionsTotal(line.selected_options);

    if (!menuItem) {
      return {
        ...line,
        menu_item_id: menuItemId,
        name: '(Menu tidak tersedia)',
        image_url: null,
        unit_price: 0,
        sold_out: true,
        sold_out_reason: 'Salah satu menu tidak ditemukan.',
      };
    }

    const baseUnitPrice = branchRow?.custom_price ?? menuItem.price;
    const finalUnitPrice = baseUnitPrice + optionsTotal;

    if (!menuItem.is_available || menuItem.is_sold_out === true) {
      return {
        ...line,
        menu_item_id: menuItemId,
        name: menuItem.name,
        image_url: menuItem.image_url,
        unit_price: finalUnitPrice,
        sold_out: true,
        sold_out_reason: `Menu "${menuItem.name}" sedang tidak tersedia.`,
      };
    }

    if (branchRow) {
      if (!branchRow.is_enabled) {
        return {
          ...line,
          menu_item_id: menuItemId,
          name: menuItem.name,
          image_url: menuItem.image_url,
          unit_price: finalUnitPrice,
          sold_out: true,
          sold_out_reason: `Menu "${menuItem.name}" tidak tersedia di cabang ini.`,
        };
      }
      if (!branchRow.is_available) {
        return {
          ...line,
          menu_item_id: menuItemId,
          name: menuItem.name,
          image_url: menuItem.image_url,
          unit_price: finalUnitPrice,
          sold_out: true,
          sold_out_reason: `Menu "${menuItem.name}" sedang habis di cabang ini.`,
        };
      }
    }

    return {
      ...line,
      menu_item_id: menuItemId,
      name: menuItem.name,
      image_url: menuItem.image_url,
      unit_price: finalUnitPrice,
      sold_out: false,
      sold_out_reason: null,
    };
  });

  return { lines: evaluated };
}

/** Alias for evaluatePriceLines */
export const auditPriceLines = evaluatePriceLines;

/**
 * priceOrderLines
 *
 * Given an already-consolidated list of lines, calls evaluatePriceLines to
 * check availability and prices against the DB, returning a 409 error on
 * any sold-out/unavailable item, or building the authoritative snapshot on success.
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

  const evalResult = await evaluatePriceLines(supabaseAdmin, branchId, lines);
  if ('error' in evalResult) {
    return { error: evalResult.error };
  }

  const snapshot: OrderItemSnapshot[] = [];
  let subtotal = 0;

  for (const line of evalResult.lines) {
    if (line.sold_out) {
      return {
        error: {
          status: 409,
          message: line.sold_out_reason || `Menu "${line.name}" sedang tidak tersedia.`,
        },
      };
    }

    subtotal += line.unit_price * line.quantity;
    const combinedNote = buildCombinedNote(line.note, line.selected_options);

    snapshot.push({
      id:               line.menu_item_id,
      name:             line.name,
      price:            line.unit_price,
      image_url:        line.image_url,
      quantity:         line.quantity,
      note:             combinedNote || line.note,
      selected_options: line.selected_options || undefined,
    });
  }

  const total = subtotal;
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
