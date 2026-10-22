/**
 * lib/reservation-history.ts
 *
 * Client-side helper for managing customer reservation history in localStorage.
 * Allows reservations to appear alongside orders in /orders (Riwayat Pesanan).
 */

export const RESERVATION_HISTORY_KEY = 'cafe-reservation-history';
export const RESERVATION_SNAPSHOT_PREFIX = 'cafe-reservation-';

export type ReservationSnapshot = {
  code:             string;
  status:           string;
  table_code:       string;
  table_label?:     string | null;
  starts_at:        string;
  ends_at:          string;
  party_size:       number;
  customer_name:    string;
  total:            number;
  preorder_total?:  number;
  items?:           Array<{ id: string; name: string; price: number; quantity: number }>;
  created_at:       string;
};

/**
 * Get stored reservation codes on this device.
 */
export function getStoredReservationCodes(): string[] {
  if (typeof window === 'undefined') return [];

  const foundCodes = new Set<string>();

  try {
    // 1. Read main history array
    const raw = localStorage.getItem(RESERVATION_HISTORY_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            const code = typeof item === 'string' ? item : item?.code;
            if (code && typeof code === 'string') {
              foundCodes.add(code.trim().toUpperCase());
            }
          });
        }
      } catch {}
    }

    // 2. Read single last_reservation_code fallback
    const lastCode = localStorage.getItem('last_reservation_code');
    if (lastCode && typeof lastCode === 'string') {
      foundCodes.add(lastCode.trim().toUpperCase());
    }

    // 3. Scan for snapshot keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RESERVATION_SNAPSHOT_PREFIX)) {
        const c = key.replace(RESERVATION_SNAPSHOT_PREFIX, '').trim().toUpperCase();
        if (c) foundCodes.add(c);
      }
    }
  } catch {
    // ignore
  }

  return Array.from(foundCodes);
}

/**
 * Save reservation code and optional snapshot into localStorage.
 */
export function saveReservationToHistory(code: string, snapshot?: Partial<ReservationSnapshot>): string[] {
  if (typeof window === 'undefined') return [];
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return getStoredReservationCodes();

  try {
    const existing = getStoredReservationCodes();
    const updated = [cleanCode, ...existing.filter((c) => c !== cleanCode)].slice(0, 30);
    localStorage.setItem(RESERVATION_HISTORY_KEY, JSON.stringify(updated));
    localStorage.setItem('last_reservation_code', cleanCode);

    if (snapshot) {
      const snapToSave: ReservationSnapshot = {
        code:          cleanCode,
        status:        snapshot.status || 'confirmed',
        table_code:    snapshot.table_code || 'A-1',
        table_label:   snapshot.table_label,
        starts_at:     snapshot.starts_at || new Date().toISOString(),
        ends_at:       snapshot.ends_at || new Date().toISOString(),
        party_size:    snapshot.party_size || 2,
        customer_name: snapshot.customer_name || 'Pelanggan',
        total:         snapshot.total || snapshot.preorder_total || 0,
        preorder_total: snapshot.preorder_total || snapshot.total || 0,
        items:         snapshot.items,
        created_at:    snapshot.created_at || new Date().toISOString(),
      };
      localStorage.setItem(RESERVATION_SNAPSHOT_PREFIX + cleanCode, JSON.stringify(snapToSave));
    }

    return updated;
  } catch {
    return [cleanCode];
  }
}

/**
 * Remove reservation code from history.
 */
export function removeReservationFromHistory(code: string): string[] {
  if (typeof window === 'undefined') return [];
  const cleanCode = code.trim().toUpperCase();

  try {
    const existing = getStoredReservationCodes();
    const updated = existing.filter((c) => c !== cleanCode);
    localStorage.setItem(RESERVATION_HISTORY_KEY, JSON.stringify(updated));
    localStorage.removeItem(RESERVATION_SNAPSHOT_PREFIX + cleanCode);
    return updated;
  } catch {
    return [];
  }
}
