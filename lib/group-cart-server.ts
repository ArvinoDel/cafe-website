/**
 * lib/group-cart-server.ts
 *
 * Server-only shared utilities for all Group Cart (Pesan Bareng) API routes.
 * Never import this from client-side code.
 *
 * Exports:
 *   - getAdminClient()
 *   - getIP(request)
 *   - sanitizeName(raw)
 *   - errRes / err400 / err403 / err404 / err409 / err410 / err429 / err500 / pausedRes
 *   - checkGroupRateLimit(type, ip, code?)
 *   - generateGroupCode() / generateMemberToken()
 *   - findActiveCart(admin, code)   — only returns open & non-expired carts
 *   - findCart(admin, code)         — returns any cart (for GET polling)
 *   - requireMemberToken(req, admin, cartId)
 *   - auditCartItems(admin, branchId, cartItems)
 *   - bumpVersion(admin, cartId, currentVersion)
 */

import { createAdminClient } from '@/lib/supabase-server';
import { evaluatePriceLines } from '@/lib/order-pricing';
import type { SupabaseEnv } from '@supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

// Loose duck-type that avoids Supabase schema inference producing 'never'
type AdminClient = { from: (table: string) => any; rpc?: (fn: string, args: any) => any };

export type CartRow = {
  id: string;
  code: string;
  branch_id: string;
  table_number: string;
  host_member_id: string | null;
  status: 'open' | 'submitted' | 'cancelled';
  order_code: string | null;
  version: number;
  expires_at: string;
};

export type MemberRow = {
  id: string;
  cart_id: string;
  name: string;
  is_ready: boolean;
  joined_at: string;
};

export type AuditedItem = {
  id: string;           // group_cart_items.id
  member_id: string;
  member_name: string;
  menu_item_id: string;
  name: string;
  image_url: string | null;
  /** Server-authoritative unit price (custom override or global price). */
  unit_price: number;
  /** Alias for unit_price — matches the client-side GroupCartItem.price field. */
  price: number;
  /** Alias for unit_price — matches the client-side GroupCartItem.effective_price field. */
  effective_price: number;
  quantity: number;
  note: string | null;
  sold_out: boolean;
};

// ─── Env + Admin client ───────────────────────────────────────────────────────

function resolveEnv(): Partial<SupabaseEnv> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const env: Partial<SupabaseEnv> = {};
  if (url) env.url = url;
  if (publishableKey) env.publishableKeys = { default: publishableKey };
  if (secretKey) env.secretKeys = { default: secretKey };
  return env;
}

export function getAdminClient(): AdminClient {
  return createAdminClient({ env: resolveEnv() }) as unknown as AdminClient;
}

// ─── IP extraction ────────────────────────────────────────────────────────────

export function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

// ─── Name sanitization ────────────────────────────────────────────────────────

/** Strip ASCII control chars and trim. */
export function sanitizeName(raw: string): string {
  return raw.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function errRes(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}
export const err400 = (msg: string) => errRes(400, msg);
export const err403 = (msg: string) => errRes(403, msg);
export const err404 = (msg: string) => errRes(404, msg);
export const err409 = (msg: string, code?: string) => errRes(409, msg, code);
export const err410 = (msg: string) => errRes(410, msg);
export const err429 = () => errRes(429, 'Terlalu banyak permintaan. Coba lagi sebentar ya.');
export const err500 = (msg: string) => errRes(500, msg);
export const pausedRes = (msg: string | null) =>
  err409(
    msg || 'Maaf, pemesanan sedang dijeda sementara. Silakan hubungi barista ya.',
    'ORDERS_PAUSED',
  );

// ─── Rate limiting (in-memory, best-effort on serverless) ────────────────────

type RateLimitEntry = { count: number; windowStart: number };

// Separate maps per limit type so windows are independent
const createIpMap = new Map<string, RateLimitEntry>(); // 10/hour per IP
const joinIpMap   = new Map<string, RateLimitEntry>(); // 30/min per IP
const readIpMap   = new Map<string, RateLimitEntry>(); // 300/min per IP (shared-WiFi ceiling)
const readCodeMap = new Map<string, RateLimitEntry>(); // 60/min per IP+code
const mutateMap   = new Map<string, RateLimitEntry>(); // 60/min per IP+code

function rl(
  map: Map<string, RateLimitEntry>,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): boolean {
  const entry = map.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    map.set(key, { count: 1, windowStart: now });
    return false; // not limited
  }
  entry.count++;
  return entry.count > max; // true = rate limited
}

function gcMaps(now: number) {
  const pairs: [Map<string, RateLimitEntry>, number][] = [
    [createIpMap, 3_600_000],
    [joinIpMap,   60_000],
    [readIpMap,   60_000],
    [readCodeMap, 60_000],
    [mutateMap,   60_000],
  ];
  for (const [map, windowMs] of pairs) {
    if (map.size > 2000) {
      map.forEach((v, k) => { if (now - v.windowStart > windowMs) map.delete(k); });
    }
  }
}

/**
 * Returns a 429 response if rate-limited, or null if the request is allowed.
 *
 * Limits:
 *   'create'  → 10 per hour per IP
 *   'join'    → 30 per minute per IP
 *   'read'    → 300/min per IP AND 60/min per IP+code
 *   'mutate'  → 60/min per IP+code
 */
export function checkGroupRateLimit(
  type: 'create' | 'join' | 'read' | 'mutate',
  ip: string,
  code?: string,
): NextResponse | null {
  const now = Date.now();
  gcMaps(now);

  if (type === 'create') {
    return rl(createIpMap, ip, 10, 3_600_000, now) ? err429() : null;
  }
  if (type === 'join') {
    return rl(joinIpMap, ip, 30, 60_000, now) ? err429() : null;
  }
  if (type === 'read') {
    if (rl(readIpMap, ip, 300, 60_000, now)) return err429();
    if (code && rl(readCodeMap, `${ip}:${code}`, 60, 60_000, now)) return err429();
    return null;
  }
  // mutate
  if (code && rl(mutateMap, `${ip}:${code}`, 60, 60_000, now)) return err429();
  return null;
}

// ─── Code + token generation ──────────────────────────────────────────────────

const GROUP_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Generates a 6-character unambiguous group invite code. */
export function generateGroupCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => GROUP_CODE_ALPHABET[b % GROUP_CODE_ALPHABET.length])
    .join('');
}

/** Generates a 64-char hex secret token (32 bytes). */
export function generateMemberToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Cart lookup helpers ──────────────────────────────────────────────────────

/**
 * Loads a group cart by invite code, returning 404 if missing and 410 if
 * closed or expired. Use this for mutation endpoints that require an open cart.
 */
export async function findActiveCart(
  supabaseAdmin: AdminClient,
  code: string,
): Promise<{ cart: CartRow } | { res: NextResponse }> {
  const { data, error } = await supabaseAdmin
    .from('group_carts')
    .select(
      'id, code, branch_id, table_number, host_member_id, status, order_code, version, expires_at',
    )
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error('[group-cart] findActiveCart error:', error);
    return { res: err500('Terjadi kesalahan. Coba lagi.') };
  }
  if (!data) return { res: err404('Keranjang bersama tidak ditemukan.') };

  if (data.status === 'submitted') return { res: err410('Pesanan bareng sudah dikirim.') };
  if (data.status === 'cancelled') return { res: err410('Keranjang bersama sudah dibatalkan.') };
  if (new Date(data.expires_at) < new Date()) {
    return { res: err410('Keranjang bersama sudah kedaluwarsa.') };
  }

  return { cart: data as CartRow };
}

/**
 * Loads a cart by invite code regardless of status. Used by GET polling so
 * members can detect when the cart has been submitted and redirect.
 */
export async function findCart(
  supabaseAdmin: AdminClient,
  code: string,
): Promise<{ cart: CartRow & { submitted_at?: string | null } } | { res: NextResponse }> {
  const { data, error } = await supabaseAdmin
    .from('group_carts')
    .select(
      'id, code, branch_id, table_number, host_member_id, status, order_code, version, expires_at, submitted_at',
    )
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error('[group-cart] findCart error:', error);
    return { res: err500('Terjadi kesalahan. Coba lagi.') };
  }
  if (!data) return { res: err410('Keranjang bersama tidak ditemukan.') };

  return { cart: data as CartRow & { submitted_at?: string | null } };
}

// ─── Member token verification ────────────────────────────────────────────────

/**
 * Reads the x-member-token header and verifies it belongs to the given cart.
 * Returns the member row or a 401/403 response.
 */
export async function requireMemberToken(
  req: NextRequest,
  supabaseAdmin: AdminClient,
  cartId: string,
): Promise<{ member: MemberRow } | { res: NextResponse }> {
  const token = req.headers.get('x-member-token');
  if (!token?.trim()) return { res: errRes(401, 'Token anggota wajib disertakan.') };

  const { data, error } = await supabaseAdmin
    .from('group_cart_members')
    .select('id, cart_id, name, is_ready, joined_at')
    .eq('cart_id', cartId)
    .eq('token', token.trim())
    .maybeSingle();

  if (error) {
    console.error('[group-cart] requireMemberToken error:', error.message);
    return { res: err500('Gagal memverifikasi anggota.') };
  }
  if (!data) return { res: errRes(403, 'Token tidak valid.') };

  return { member: data as MemberRow };
}

// ─── Cart item auditing (for GET — non-fatal on sold-out) ─────────────────────

/**
 * Returns current prices and availability for each cart item.
 * Unlike priceOrderLines, this NEVER errors on sold-out items — it marks them.
 */
export async function auditCartItems(
  supabaseAdmin: AdminClient,
  branchId: string,
  cartItems: Array<{
    id: string;
    member_id: string;
    member_name?: string;
    menu_item_id: string;
    quantity: number;
    note: string | null;
  }>,
): Promise<AuditedItem[]> {
  if (cartItems.length === 0) return [];

  const evalResult = await evaluatePriceLines(
    supabaseAdmin as any,
    branchId,
    cartItems,
  );

  if ('error' in evalResult) {
    console.error('[group-cart] auditCartItems evaluation error:', evalResult.error);
    return cartItems.map((item) => ({
      id:              item.id,
      member_id:       item.member_id,
      member_name:     item.member_name ?? '',
      menu_item_id:    item.menu_item_id,
      name:            '(Menu tidak tersedia)',
      image_url:       null,
      unit_price:      0,
      price:           0,
      effective_price: 0,
      quantity:        item.quantity,
      note:            item.note,
      sold_out:        true,
    }));
  }

  return evalResult.lines.map((line) => ({
    id:              line.id,
    member_id:       line.member_id,
    member_name:     line.member_name ?? '',
    menu_item_id:    line.menu_item_id,
    name:            line.name,
    image_url:       line.image_url,
    unit_price:      line.unit_price,
    price:           line.unit_price,
    effective_price: line.unit_price,
    quantity:        line.quantity,
    note:            line.note,
    sold_out:        line.sold_out,
  }));
}

// ─── Version bump ─────────────────────────────────────────────────────────────

/**
 * Atomically increments the cart version via the bump_group_cart_version RPC.
 */
export async function bumpVersion(
  supabaseAdmin: AdminClient,
  cartId: string,
): Promise<number | null> {
  const { data, error } = await (supabaseAdmin as any).rpc('bump_group_cart_version', {
    p_cart_id: cartId,
  });

  if (error) {
    console.error('[group-cart] bumpVersion RPC error:', error.message);
    return null;
  }
  return data as number;
}
