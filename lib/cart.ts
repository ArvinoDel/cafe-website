/**
 * lib/cart.ts
 *
 * Cart persistence helpers for the cafe ordering app.
 *
 * Storage format (localStorage key: CART_KEY = 'cafe_cart'):
 *   {
 *     version:      number,           // schema version — bump when shape changes
 *     timestamp:    number,           // Date.now() at last write
 *     table_number: string | null,    // last known table (informational)
 *     items:        StoredCartItem[], // cart line items
 *   }
 *
 * Legacy formats supported for migration:
 *   - Raw CartItem[] array (cafe-cart or kopi-nako-cart keys)
 *
 * Rules:
 *   - All localStorage access is wrapped in try/catch — private-browsing mode
 *     or disabled storage must never crash the app.
 *   - Carts older than CART_TTL_MS (12 h) are discarded on read.
 *   - After a successful order the caller must invoke clearCart().
 */

import {
  CART_KEY,
  CART_SCHEMA_VERSION,
  LEGACY_CART_KEY,
  LEGACY_CAFE_CART_KEY,
} from '@/lib/storage-keys';

export { CART_KEY } from '@/lib/storage-keys';

// 12-hour TTL — stale carts from a previous visit are cleared automatically.
const CART_TTL_MS = 12 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoredCartItem = {
  id: string;
  lineKey?: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  note?: string | null;
  selectedOptions?: Array<{
    groupId: string;
    groupName: string;
    choiceId: string;
    choiceName: string;
    price: number;
  }> | null;
};

type CartPayload = {
  version: number;
  timestamp: number;
  table_number: string | null;
  items: StoredCartItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * safeGet — reads a raw string from localStorage without throwing.
 */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * safeSet — writes to localStorage without throwing.
 * Returns false when storage is unavailable (private mode, quota exceeded).
 */
function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * safeRemove — removes a key from localStorage without throwing.
 */
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * loadCart
 *
 * Reads the cart from localStorage, migrating from legacy formats if needed.
 * Returns an empty array if:
 *   - storage is unavailable
 *   - the stored data is invalid / unparseable
 *   - the payload is older than CART_TTL_MS
 */
export function loadCart(): StoredCartItem[] {
  // 1. Try current key first
  let raw = safeGet(CART_KEY);

  // 2. Fall back to legacy keys (in priority order) and migrate
  if (!raw) {
    const legacyRaw = safeGet(LEGACY_CAFE_CART_KEY) ?? safeGet(LEGACY_CART_KEY);
    if (legacyRaw) {
      raw = legacyRaw;
      // Migrate: write to new key and clean up old ones
      safeSet(CART_KEY, serializePayload(tryParseItems(legacyRaw), null));
      safeRemove(LEGACY_CAFE_CART_KEY);
      safeRemove(LEGACY_CART_KEY);
    }
  }

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    // Legacy format: plain array
    if (Array.isArray(parsed)) {
      return parsed as StoredCartItem[];
    }

    // Current versioned format
    if (parsed && typeof parsed === 'object' && parsed.version === CART_SCHEMA_VERSION) {
      const payload = parsed as CartPayload;
      // Discard carts older than TTL
      if (typeof payload.timestamp === 'number' && Date.now() - payload.timestamp > CART_TTL_MS) {
        safeRemove(CART_KEY);
        return [];
      }
      return Array.isArray(payload.items) ? payload.items : [];
    }
  } catch {
    // Unparseable — clear and start fresh
    safeRemove(CART_KEY);
  }

  return [];
}

/**
 * saveCart
 *
 * Persists the cart to localStorage in the versioned format.
 * Pass tableNumber when available so it can be restored on the checkout page.
 */
export function saveCart(items: StoredCartItem[], tableNumber?: string | null): void {
  const payload = serializePayload(items, tableNumber ?? null);
  safeSet(CART_KEY, payload);
}

/**
 * clearCart
 *
 * Removes the cart from localStorage. Call after a successful order.
 */
export function clearCart(): void {
  safeRemove(CART_KEY);
}

/**
 * validateCartAgainstMenu
 *
 * Given the currently loaded menu items, returns a pruned + price-updated
 * copy of the cart:
 *   - Items not found in the menu (deleted in admin) are removed.
 *   - Prices are updated to the current menu price.
 *
 * Does NOT mutate the input array. Does NOT write to storage — the caller
 * is responsible for calling saveCart() with the result if they want to persist.
 */
export function validateCartAgainstMenu(
  cart: StoredCartItem[],
  menuItems: Array<{ id: string; price: number; is_available?: boolean; sold_out?: boolean }>,
): StoredCartItem[] {
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));
  const updated: StoredCartItem[] = [];

  for (const item of cart) {
    const current = menuMap.get(item.id);
    if (!current) continue; // Item no longer exists — silently drop
    updated.push({ ...item, price: current.price });
  }

  return updated;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function serializePayload(items: StoredCartItem[], tableNumber: string | null): string {
  const payload: CartPayload = {
    version: CART_SCHEMA_VERSION,
    timestamp: Date.now(),
    table_number: tableNumber,
    items,
  };
  return JSON.stringify(payload);
}

function tryParseItems(raw: string): StoredCartItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.items && Array.isArray(parsed.items)) return parsed.items;
  } catch {}
  return [];
}
