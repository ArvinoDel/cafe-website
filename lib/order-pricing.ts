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
  type ItemOptionGroup,
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
  options?: ItemOptionGroup[] | null; // jsonb column from DB
};

type BranchMenuItem = {
  menu_item_id: string;
  is_available: boolean;
  is_enabled: boolean;
  custom_price: number | null;
};

/**
 * One unavailable item in the ITEMS_UNAVAILABLE error payload.
 * reason:
 *   'sold_out'      — item exists but is not currently available
 *   'not_found'     — item ID not present in database
 *   'price_changed' — item available but price differs from what client expected
 */
export type UnavailableItem = {
  id: string;
  name: string;
  reason: 'sold_out' | 'not_found' | 'price_changed';
  /** Present only when reason === 'price_changed' */
  new_price?: number;
};

/** Returned when one or more items fail availability or price checks. */
export type ItemsUnavailableError = {
  error: {
    status: 409;
    message: string;
    code: 'ITEMS_UNAVAILABLE';
    items: UnavailableItem[];
  };
};

/** Returned on other validation / server errors. */
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
      .select('id, name, price, image_url, is_available, is_sold_out, options')
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

    // ── Server-side option validation & repricing ────────────────────────────
    // Re-price options from DB data; reject any invalid/unknown group or choice.
    const rawOptions: ItemOptionGroup[] = Array.isArray(menuItem.options) ? menuItem.options as ItemOptionGroup[] : [];
    const clientSelections = line.selected_options ?? [];
    const validatedOptions: SelectedOption[] = [];

    if (clientSelections.length > 0 && rawOptions.length > 0) {
      const groupMap = new Map(rawOptions.map((g) => [g.id, g]));

      // Track which groups have been satisfied
      const seenGroups = new Map<string, number>(); // groupId -> count of choices selected
      const seenPairs = new Set<string>(); // deduplicate (groupId + choiceId) pairs

      for (const sel of clientSelections) {
        const pairKey = `${sel.groupId}::${sel.choiceId}`;
        if (seenPairs.has(pairKey)) {
          // Ignore duplicate (groupId + choiceId) pairs so the same choice is not counted twice
          continue;
        }
        seenPairs.add(pairKey);

        const group = groupMap.get(sel.groupId);
        if (!group) {
          return {
            ...line,
            menu_item_id: menuItemId,
            name: menuItem.name,
            image_url: menuItem.image_url,
            unit_price: 0,
            sold_out: true,
            sold_out_reason: `Opsi "${sel.groupName}" tidak ditemukan pada menu "${menuItem.name}".`,
            selected_options: undefined,
          };
        }
        const choice = group.choices.find((c) => c.id === sel.choiceId);
        if (!choice) {
          return {
            ...line,
            menu_item_id: menuItemId,
            name: menuItem.name,
            image_url: menuItem.image_url,
            unit_price: 0,
            sold_out: true,
            sold_out_reason: `Pilihan "${sel.choiceName}" tidak ditemukan pada opsi "${group.name}" menu "${menuItem.name}".`,
            selected_options: undefined,
          };
        }
        const count = seenGroups.get(group.id) ?? 0;
        if (group.type === 'single' && count >= 1) {
          return {
            ...line,
            menu_item_id: menuItemId,
            name: menuItem.name,
            image_url: menuItem.image_url,
            unit_price: 0,
            sold_out: true,
            sold_out_reason: `Opsi "${group.name}" hanya boleh dipilih satu untuk menu "${menuItem.name}".`,
            selected_options: undefined,
          };
        }
        seenGroups.set(group.id, count + 1);
        // Use price from DATABASE, not from client payload
        validatedOptions.push({
          groupId:    group.id,
          groupName:  group.name,
          choiceId:   choice.id,
          choiceName: choice.name,
          price:      choice.price, // always from DB
        });
      }
    } else if (clientSelections.length > 0 && rawOptions.length === 0) {
      // Client sent options but item has none — silently ignore
    }

    // Validate required groups
    if (rawOptions.length > 0) {
      const selectedGroupIds = new Set(validatedOptions.map((s) => s.groupId));
      for (const group of rawOptions) {
        if (group.required && !selectedGroupIds.has(group.id)) {
          return {
            ...line,
            menu_item_id: menuItemId,
            name: menuItem.name,
            image_url: menuItem.image_url,
            unit_price: 0,
            sold_out: true,
            sold_out_reason: `Wajib memilih opsi "${group.name}" untuk menu "${menuItem.name}".`,
            selected_options: undefined,
          };
        }
      }
    }

    const optionsTotal = calculateOptionsTotal(validatedOptions);
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
      selected_options: validatedOptions.length > 0 ? validatedOptions : undefined,
    };
  });

  return { lines: evaluated };
}

/** Alias for evaluatePriceLines */
export const auditPriceLines = evaluatePriceLines;

/**
 * priceOrderLines
 *
 * Validates availability and prices for ALL lines in a single pass.
 *
 * Behaviour:
 *   - If ANY line is sold-out or missing: returns ItemsUnavailableError (409)
 *     with the full list of bad items so the client can show them all at once.
 *   - If ALL lines are available: returns PricingSuccess with the authoritative
 *     snapshot, subtotal, and total (prices always come from the database).
 *
 * clientPrices (optional): map of menu_item_id → client-sent unit price.  When
 *   provided, price mismatches are included in the unavailable-items list with
 *   reason 'price_changed'.
 */
export async function priceOrderLines(
  supabaseAdmin: AnySupabaseClient,
  branchId: string,
  lines: PricingLine[],
  clientPrices?: Map<string, number>,
): Promise<PricingError | ItemsUnavailableError | PricingSuccess> {
  if (lines.length === 0) {
    return {
      error: { status: 400, message: 'Pesanan tidak boleh kosong.' },
    };
  }

  const evalResult = await evaluatePriceLines(supabaseAdmin, branchId, lines);
  if ('error' in evalResult) {
    return { error: evalResult.error };
  }

  // Collect ALL problem items before deciding to fail
  const unavailableItems: UnavailableItem[] = [];
  const snapshot: OrderItemSnapshot[] = [];
  let subtotal = 0;

  for (const line of evalResult.lines) {
    const menuItemId = line.menu_item_id;

    // Determine failure reason
    if (line.sold_out) {
      const reason: UnavailableItem['reason'] =
        line.name === '(Menu tidak tersedia)' ? 'not_found' : 'sold_out';
      unavailableItems.push({ id: menuItemId, name: line.name, reason });
      continue;
    }

    // Price-changed check (only when caller supplies expected client prices)
    if (clientPrices) {
      const expectedBasePrice = clientPrices.get(menuItemId);
      if (expectedBasePrice !== undefined && expectedBasePrice !== line.unit_price) {
        unavailableItems.push({
          id:        menuItemId,
          name:      line.name,
          reason:    'price_changed',
          new_price: line.unit_price,
        });
        continue;
      }
    }

    subtotal += line.unit_price * line.quantity;
    const combinedNote = buildCombinedNote(line.note, line.selected_options);
    const serverOptions = (line as any).selected_options;

    snapshot.push({
      id:               menuItemId,
      name:             line.name,
      price:            line.unit_price,
      image_url:        line.image_url,
      quantity:         line.quantity,
      note:             combinedNote || line.note,
      selected_options: serverOptions || undefined,
    });
  }

  if (unavailableItems.length > 0) {
    return {
      error: {
        status: 409,
        message: 'Maaf, beberapa menu sudah habis atau mengalami perubahan harga.',
        code: 'ITEMS_UNAVAILABLE',
        items: unavailableItems,
      },
    };
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
