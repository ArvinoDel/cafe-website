/**
 * lib/storage-keys.ts
 *
 * Centralised localStorage key constants for the cafe ordering app.
 * All keys use a neutral "cafe-" prefix — no brand names in code.
 *
 * Usage:
 *   import { GROUP_CART_KEY, LAST_DISPLAY_NAME_KEY, ORDER_SNAPSHOT_PREFIX } from '@/lib/storage-keys';
 *   localStorage.setItem(GROUP_CART_KEY, JSON.stringify(data));
 */

// ─── Solo / table session keys ────────────────────────────────────────────────

/** The current table number (set by QR scan). */
export const TABLE_KEY = 'cafe-table';

/** The current branch UUID (set by QR scan). */
export const BRANCH_KEY = 'cafe-branch';

/** Solo cart items (array of CartItem). */
export const CART_KEY = 'cafe-cart';

// ─── Order history keys ───────────────────────────────────────────────────────

/** List of order codes the device has placed. */
export const ORDER_HISTORY_KEY = 'cafe-customer-history';

/** Prefix for per-order snapshots: `<ORDER_SNAPSHOT_PREFIX><order_code>`. */
export const ORDER_SNAPSHOT_PREFIX = 'cafe-order-';

/** Snapshot of the most recently placed order. */
export const LAST_ORDER_KEY = 'cafe-last-order';

// ─── Admin dashboard keys ─────────────────────────────────────────────────────

/** Sound notification toggle for admin dashboard. */
export const SOUND_KEY = 'cafe-sound-enabled';

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

// ─── Legacy keys (for read fallback during migration) ─────────────────────────

export const LEGACY_TABLE_KEY = 'kopi-nako-table';
export const LEGACY_BRANCH_KEY = 'kopi-nako-branch';
export const LEGACY_CART_KEY = 'kopi-nako-cart';
export const LEGACY_ORDER_HISTORY_KEYS = ['kopi-nako-customer-history', 'kopi-nako-order-history'];
export const LEGACY_ORDER_SNAPSHOT_PREFIX = 'kopi-nako-order-';
export const LEGACY_LAST_ORDER_KEY = 'kopi-nako-last-order';
export const LEGACY_SOUND_KEY = 'kopi-nako-sound-enabled';
