/**
 * lib/storage-keys.ts
 *
 * Centralised localStorage key constants for the cafe ordering app.
 * All keys use a neutral "cafe-" prefix — no brand names in code.
 *
 * Usage:
 *   import { GROUP_CART_KEY, LAST_DISPLAY_NAME_KEY } from '@/lib/storage-keys';
 *   localStorage.setItem(GROUP_CART_KEY, JSON.stringify(data));
 */

// ─── Solo / table session keys ────────────────────────────────────────────────

/** The current table number (set by QR scan). */
export const TABLE_KEY = 'kopi-nako-table';

/** The current branch UUID (set by QR scan). */
export const BRANCH_KEY = 'kopi-nako-branch';

/** Solo cart items (array of CartItem). */
export const CART_KEY = 'kopi-nako-cart';

// ─── Order history keys ───────────────────────────────────────────────────────

/** Comma-separated list of order codes the device has placed. */
export const ORDER_HISTORY_KEY = 'kopi-nako-order-history';

/** Prefix for per-order snapshots: `<ORDER_SNAPSHOT_PREFIX><order_code>`. */
export const ORDER_SNAPSHOT_PREFIX = 'kopi-nako-order-';

/** Snapshot of the most recently placed order. */
export const LAST_ORDER_KEY = 'kopi-nako-last-order';

// ─── Group (Pesan Bareng) keys ────────────────────────────────────────────────

/**
 * The active group-cart session for this device.
 *
 * Shape:
 *   {
 *     code:         string;   // 6-char invite code
 *     member_id:    string;   // UUID — public, shared in GET responses
 *     member_token: string;   // secret — never exposed to other members
 *     name:         string;   // display name chosen at join time
 *   }
 */
export const GROUP_CART_KEY = 'cafe-group-cart';

/**
 * The last display name the user typed when joining or creating a group cart.
 * Pre-fills the name input next time for convenience.
 */
export const LAST_DISPLAY_NAME_KEY = 'cafe-display-name';
