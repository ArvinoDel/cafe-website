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

import type { ItemOptionGroup } from '@/lib/item-options';

export type AvailableMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;          // already resolved: custom_price ?? global price
  category: string;
  image_url: string | null;
  image_urls?: string[] | null;
  badge: string | null;
  is_available: boolean;
  is_sold_out?: boolean | null;
  sort_order: number;
  ingredients?: string | null;
  diet_tags?: string[] | null;
  allergen_tags?: string[] | null;
  prep_time_minutes?: number | null;
  portion_calories?: string | null;
  pairing_item_ids?: string[] | null;
  options?: ItemOptionGroup[] | null;
};

/**
 * Like AvailableMenuItem but includes all non-hidden items (enabled but possibly
 * out-of-stock). `sold_out = true` means enabled but not currently available.
 */
export type BranchMenuItem = AvailableMenuItem & {
  sold_out: boolean;
};

/** Minimum shape of an order-item snapshot needed for re-ordering. */
export type ReorderItem = {
  id: string;
  name: string;
  quantity: number;
  note?: string | null;   // Feature 4 forward-compat: preserved when re-adding
};

// ─── Supabase anon client (read-only, same as app/menu/page.tsx) ──────────────

let anonClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (anonClient) return anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  anonClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return anonClient;
}

// ─── In-memory session cache (SWR) ───────────────────────────────────────────

type MenuCache = {
  data: BranchMenuItem[];
  fetchedAt: number;
};

// Keyed by branchId (or '__all__' when no branchId is provided).
const menuCache = new Map<string, MenuCache>();
// Minimum gap between background revalidations (30 s).
const REVALIDATE_INTERVAL_MS = 30_000;

// ─── fetchBranchMenu ─────────────────────────────────────────────────────────

/**
 * Fetches ALL non-hidden menu items for a given branch, tagged with a
 * `sold_out` boolean.
 *
 * Semantics:
 * - Hidden (not returned):  a branch_menu_items row exists AND is_enabled = false.
 * - Sold out (sold_out=true): enabled but not available:
 *     • branch context: is_enabled = true AND is_available = false, OR
 *     • global context: no branch row (or no branchId) AND menu_items.is_available = false.
 * - Available (sold_out=false): everything else.
 *
 * custom_price overrides are applied regardless of availability.
 * Items are returned ordered by sort_order ascending.
 * Returns an empty array on error.
 *
 * Caching: results are stored in a module-level Map for the session lifetime.
 * On repeated calls the cached copy is returned immediately, then a background
 * revalidation is triggered (at most once per REVALIDATE_INTERVAL_MS) so data
 * stays fresh without blocking the UI.
 */
export async function fetchBranchMenu(
  branchId?: string | null,
  opts?: { forceRefresh?: boolean },
): Promise<BranchMenuItem[]> {
  const cacheKey = branchId ?? '__all__';
  const cached = menuCache.get(cacheKey);
  const now = Date.now();

  // Return cached data immediately if available (stale-while-revalidate)
  if (cached && !opts?.forceRefresh) {
    // Kick off background revalidation if stale but don't await it
    if (now - cached.fetchedAt > REVALIDATE_INTERVAL_MS) {
      fetchFromDB(branchId, cacheKey).catch(() => {});
    }
    return cached.data;
  }

  return fetchFromDB(branchId, cacheKey);
}

async function fetchFromDB(
  branchId: string | null | undefined,
  cacheKey: string,
): Promise<BranchMenuItem[]> {
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

    if (menuRes.error) return menuCache.get(cacheKey)?.data ?? [];

    const rawItems = (menuRes.data || []) as AvailableMenuItem[];
    const branchRows = (branchMenuRes.data || []) as {
      menu_item_id: string;
      is_available: boolean;
      is_enabled: boolean;
      custom_price: number | null;
    }[];

    const branchMap = new Map(branchRows.map((r) => [r.menu_item_id, r]));

    const result: BranchMenuItem[] = [];
    for (const item of rawItems) {
      const bRow = branchMap.get(item.id);

      // Hidden: branch row exists and is_enabled = false → skip entirely
      if (bRow && !bRow.is_enabled) continue;

      const globalSoldOut = item.is_sold_out === true || !item.is_available;
      const sold_out = bRow ? (globalSoldOut || !bRow.is_available) : globalSoldOut;
      const price = bRow?.custom_price != null ? bRow.custom_price : item.price;

      result.push({
        ...item,
        price,
        is_available: !sold_out,
        sold_out,
      });
    }
    menuCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // No branch — return all items, tagging unavailable ones as sold out
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return menuCache.get(cacheKey)?.data ?? [];

  const result = ((data || []) as AvailableMenuItem[]).map((item) => ({
    ...item,
    sold_out: item.is_sold_out === true || !item.is_available,
  }));
  menuCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── fetchCurrentAvailableMenu ────────────────────────────────────────────────

/**
 * Returns only currently-available (non-sold-out) menu items.
 * Implemented as fetchBranchMenu filtered to sold_out === false so the
 * "Pesan lagi" flow (executeReorder) still has the full non-hidden list
 * to detect skipped items.
 *
 * Returns an empty array on error.
 */
export async function fetchCurrentAvailableMenu(
  branchId?: string | null,
): Promise<AvailableMenuItem[]> {
  const items = await fetchBranchMenu(branchId);
  return items.filter((item) => !item.sold_out);
}

// ─── Cart helpers (shared localStorage keys & cart-item shape) ────────────────

import { getItemLineKey } from '@/lib/item-options';
import { CART_KEY } from '@/lib/cart';
export { CART_KEY } from '@/lib/cart';

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
        quantity: Math.min(99, existing.quantity + orderItem.quantity),
      });
    } else {
      cartMap.set(key, {
        id: current.id,
        lineKey: key,
        name: current.name,
        price: current.price,
        image_url: current.image_url,
        quantity: Math.min(99, orderItem.quantity),
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
