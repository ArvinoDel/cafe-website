/**
 * lib/order-history.ts
 *
 * Client-side helper for managing non-authenticated guest customer order history.
 * Persists order codes in localStorage and migrates any legacy order snapshots.
 */

export const ORDER_HISTORY_KEY = 'kopi-nako-customer-history';

export type StoredOrderRef = {
  code: string;
  createdAt: string;
};

/**
 * Get list of order codes stored on this device.
 * Automatically checks legacy keys (kopi-nako-order-*, kopi-nako-last-order)
 * to ensure no past orders are missed.
 */
export function getStoredOrderCodes(): string[] {
  if (typeof window === 'undefined') return [];

  const foundCodes = new Set<string>();

  try {
    // 1. Read main history array
    const raw = localStorage.getItem(ORDER_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const code = typeof item === 'string' ? item : item?.code;
          if (code && typeof code === 'string') {
            foundCodes.add(code.trim().toUpperCase());
          }
        });
      }
    }

    // 2. Scan for individual order snapshots
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith('kopi-nako-order-')) {
        const code = key.replace('kopi-nako-order-', '').trim().toUpperCase();
        if (code) foundCodes.add(code);
      } else if (key === 'kopi-nako-last-order') {
        try {
          const val = JSON.parse(localStorage.getItem(key) || '{}');
          if (val?.order_code) {
            foundCodes.add(String(val.order_code).trim().toUpperCase());
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore localStorage errors
  }

  return Array.from(foundCodes);
}

/**
 * Record an order code into local history.
 */
export function saveOrderToHistory(code: string): string[] {
  if (typeof window === 'undefined') return [];
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return getStoredOrderCodes();

  try {
    const existing = getStoredOrderCodes();
    const updated = [cleanCode, ...existing.filter((c) => c !== cleanCode)].slice(0, 50);
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [cleanCode];
  }
}

/**
 * Remove an order code from local history.
 */
export function removeOrderFromHistory(code: string): string[] {
  if (typeof window === 'undefined') return [];
  const cleanCode = code.trim().toUpperCase();

  try {
    const existing = getStoredOrderCodes();
    const updated = existing.filter((c) => c !== cleanCode);
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(updated));
    localStorage.removeItem('kopi-nako-order-' + cleanCode);
    return updated;
  } catch {
    return [];
  }
}

/**
 * Clear all history on this device.
 */
export function clearAllOrderHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    const codes = getStoredOrderCodes();
    codes.forEach((c) => localStorage.removeItem('kopi-nako-order-' + c));
    localStorage.removeItem(ORDER_HISTORY_KEY);
    localStorage.removeItem('kopi-nako-last-order');
  } catch {
    // ignore
  }
}
