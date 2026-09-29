/**
 * lib/menu-availability.ts
 *
 * Shared helpers for fetching current menu availability and executing the
 * "Pesan lagi" (order-again) flow.
 *
 * Separated from app/menu/page.tsx so the same logic can be reused from
 * app/orders/page.tsx and app/status/[code]/page.tsx without duplication.
 */

import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvailableMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;          // already resolved: custom_price ?? global price
  category: string;
  image_url: string | null;
  badge: string | null;
  is_available: boolean;
  sort_order: number;
};

/** Minimum shape of an order-item snapshot needed for re-ordering. */
export type ReorderItem = {
  id: string;
  name: string;
  quantity: number;
  note?: string | null;   // Feature 4 forward-compat: preserved when re-adding
};

// ─── Supabase anon client (read-only, same as app/menu/page.tsx) ──────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key);
}

// ─── fetchCurrentAvailableMenu ────────────────────────────────────────────────

/**
 * Fetches the currently available menu items for a given branch.
 * Mirrors the logic in app/menu/page.tsx → fetchMenu().
 *
 * - When branchId is provided: loads menu_items + branch_menu_items and
 *   applies enabled/available/custom-price overrides.
 * - When branchId is omitted: returns globally-available items only.
 *
 * Returns an empty array on error (callers should degrade gracefully).
 */
export async function fetchCurrentAvailableMenu(
  branchId?: string | null,
): Promise<AvailableMenuItem[]> {
  const supabase = getSupabase();

  if (branchId) {
    const [menuRes, branchMenuRes] = await Promise.all([
      supabase
        .from('menu_items')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('branch_menu_items')
        .select('menu_item_id, is_available, is_enabled, custom_price')
        .eq('branch_id', branchId),
    ]);

    if (menuRes.error) return [];

    const rawItems = (menuRes.data || []) as AvailableMenuItem[];
    const branchRows = (branchMenuRes.data || []) as {
      menu_item_id: string;
      is_available: boolean;
      is_enabled: boolean;
      custom_price: number | null;
    }[];

    const branchMap = new Map(branchRows.map((r) => [r.menu_item_id, r]));

    return rawItems
      .filter((item) => {
        const bRow = branchMap.get(item.id);
        if (bRow) return bRow.is_enabled && bRow.is_available;
        return item.is_available;
      })
      .map((item) => {
        const bRow = branchMap.get(item.id);
        if (bRow && bRow.custom_price != null) {
          return { ...item, price: bRow.custom_price };
        }
        return item;
      });
  }

  // No branch — global availability only
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('is_available', true)
    .order('sort_order', { ascending: true });

  if (error) return [];
  return (data || []) as AvailableMenuItem[];
}

// ─── Cart helpers (shared localStorage keys & cart-item shape) ────────────────

import { getItemLineKey } from '@/lib/item-options';

/** The cart localStorage key — stable across menu/checkout/orders pages. */
export const CART_KEY = 'kopi-nako-cart';

/**
 * Minimal cart item shape stored in localStorage.
 * `note` and `lineKey` are optional so old carts without them continue to load.
 */
export type StoredCartItem = {
  id: string;
  lineKey?: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  note?: string | null;
};

// ─── executeReorder ───────────────────────────────────────────────────────────

export type ReorderResult = {
  added: number;
  skipped: string[];   // names of items that were unavailable
};

/**
 * Executes the "Pesan lagi" flow:
 * 1. Fetches current availability & prices for the branch.
 * 2. For each item in `orderItems`:
 *    - If available: upsert into the existing cart (merge by lineKey, note preserved).
 *    - If unavailable: collect name for the caller to surface in a toast.
 * 3. Writes the merged cart back to localStorage[CART_KEY].
 *
 * Returns { added, skipped } so the caller can show an appropriate toast.
 * Throws if localStorage is unavailable (SSR guard — call only client-side).
 */
export async function executeReorder(
  orderItems: ReorderItem[],
  branchId?: string | null,
): Promise<ReorderResult> {
  // Load current availability
  const available = await fetchCurrentAvailableMenu(branchId);
  const availableMap = new Map(available.map((m) => [m.id, m]));

  // Read existing cart
  let existingCart: StoredCartItem[] = [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) existingCart = JSON.parse(raw);
  } catch {
    existingCart = [];
  }

  // Key existing cart lines by getItemLineKey
  const cartMap = new Map<string, StoredCartItem>();
  for (const c of existingCart) {
    const key = c.lineKey || getItemLineKey(c.id, c.note);
    cartMap.set(key, { ...c, lineKey: key });
  }

  const skipped: string[] = [];
  let added = 0;

  for (const orderItem of orderItems) {
    const current = availableMap.get(orderItem.id);
    if (!current) {
      skipped.push(orderItem.name);
      continue;
    }

    const key = getItemLineKey(orderItem.id, orderItem.note);
    const existing = cartMap.get(key);
    if (existing) {
      cartMap.set(key, {
        ...existing,
        price: current.price, // always use current price
        quantity: existing.quantity + orderItem.quantity,
      });
    } else {
      cartMap.set(key, {
        id: current.id,
        lineKey: key,
        name: current.name,
        price: current.price,
        image_url: current.image_url,
        quantity: orderItem.quantity,
        note: orderItem.note ? orderItem.note.trim() : null,
      });
    }
    added++;
  }

  // Persist merged cart
  const nextCart = Array.from(cartMap.values());
  localStorage.setItem(CART_KEY, JSON.stringify(nextCart));

  return { added, skipped };
}
