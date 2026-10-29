/**
 * lib/table-session-server.ts
 *
 * Server-only helpers for managing table claim sessions.
 * Never import from client-side code.
 *
 * Exports:
 *   - TABLE_SESSION_COOKIE  — cookie name constant
 *   - getSessionToken()     — reads or generates the token from cookies
 *   - getActiveSession()    — queries the current active session
 *   - ClaimResult           — type for claim_table RPC response
 */

import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-server';
import type { SupabaseEnv } from '@supabase/server';

// ─── Constants ────────────────────────────────────────────────────────────────

export const TABLE_SESSION_COOKIE = 'table_session_token';
export const RESERVATION_OWNER_COOKIE = 'reservation_owner_token';

/** Max age: 30 days. The token is long-lived; the session inside DB expires sooner. */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// ─── Env helper (mirrors pattern used in API routes) ─────────────────────────

export function resolveAdminEnv(): Partial<SupabaseEnv> {
  const url           = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const env: Partial<SupabaseEnv> = {};
  if (url)           env.url             = url;
  if (publishableKey) env.publishableKeys = { default: publishableKey };
  if (secretKey)     env.secretKeys      = { default: secretKey };
  return env;
}

import crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableSessionRow = {
  id:            string;
  table_id:      string;
  branch_id:     string;
  session_token: string;
  status:        'active' | 'released' | 'expired';
  started_at:    string;
  expires_at:    string;
  released_at:   string | null;
  released_reason: string | null;
  upgraded_at:   string | null;
  ip_hash:       string | null;
  /** Joined from the tables table */
  tables: {
    id:       string;
    code:     string;
    label:    string | null;
    seats:    number;
    branch_id: string;
  } | null;
};

export type ActiveTableSession = {
  sessionId:   string;
  tableId:     string;
  tableCode:   string;
  tableLabel:  string | null;
  tableSeats:  number;
  branchId:    string;
  expiresAt:   string;
  startedAt:   string;
  remainingSeconds: number;
  upgraded:    boolean;
  upgradedAt:  string | null;
};

export type ClaimResult =
  | { ok: true;  session: ActiveTableSession; isExisting: boolean }
  | {
      ok: false;
      code: 'TABLE_TAKEN' | 'TABLE_RESERVED' | 'TABLE_RESERVED_SOON' | 'TABLE_NOT_FOUND' | 'TOO_MANY_HOLDS' | 'CONCURRENT_CLAIM';
      startsAt?: string;
      endsAt?: string;
      availableUntil?: string;
      error?: string;
    };

// ─── Token Hash Helper ────────────────────────────────────────────────────────


/**
 * Computes deterministic HMAC-SHA256 of owner token using server secret.
 * In production mode, throws an error if SUPABASE_SECRET_KEY is not configured
 * to prevent falling back to a static hardcoded secret.
 */
export function computeTokenHash(token: string): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('computeTokenHash: SUPABASE_SECRET_KEY is required in production');
    }
  }
  const effectiveSecret = secret || 'dev-token-hash-secret';
  return crypto.createHmac('sha256', effectiveSecret).update(token.trim()).digest('hex');
}

// ─── Token helpers ────────────────────────────────────────────────────────────

/** Generates a cryptographically random 32-byte hex token. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads the session token from the httpOnly cookie.
 * Returns the existing token or null if not set.
 * Does NOT create a new token here — creation happens in the API route so it
 * can set the cookie on the response.
 */
export async function getSessionTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TABLE_SESSION_COOKIE)?.value ?? null;
}

/**
 * Builds the cookie options for the session token.
 * httpOnly, SameSite=Lax, Secure in production.
 */
export function buildSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   COOKIE_MAX_AGE_SECONDS,
    path:     '/',
  };
}

/** Generates a new token value. */
export function newSessionToken(): string {
  return generateToken();
}

// ─── Session query helpers ────────────────────────────────────────────────────

/**
 * Loads the current active session for a given token from the database.
 * Returns null if no active session exists or if the session has expired.
 */
export async function getActiveSession(
  token: string,
): Promise<ActiveTableSession | null> {
  const env          = resolveAdminEnv();
  const supabaseAdmin = createAdminClient({ env });

  const { data, error } = await supabaseAdmin
    .from('table_sessions')
    .select(`
      id, table_id, branch_id, session_token,
      status, started_at, expires_at, released_at, released_reason,
      upgraded_at, ip_hash,
      tables!table_id ( id, code, label, seats, branch_id )
    `)
    .eq('session_token', token)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  // Supabase infers the join as an array type due to !hint syntax.
  // We cast via unknown to avoid the incompatible-type error, then normalise.
  const raw = data as unknown as {
    id: string;
    table_id: string;
    branch_id: string;
    session_token: string;
    status: string;
    started_at: string;
    expires_at: string;
    released_at: string | null;
    released_reason: string | null;
    upgraded_at: string | null;
    ip_hash: string | null;
    tables: { id: string; code: string; label: string | null; seats: number; branch_id: string } | { id: string; code: string; label: string | null; seats: number; branch_id: string }[] | null;
  };

  // Normalise: Supabase may return the related row as object or single-element array
  const tableData = Array.isArray(raw.tables) ? raw.tables[0] ?? null : raw.tables;
  if (!tableData) return null;

  return {
    sessionId:        raw.id,
    tableId:          raw.table_id,
    tableCode:        tableData.code,
    tableLabel:       tableData.label,
    tableSeats:       tableData.seats,
    branchId:         raw.branch_id,
    expiresAt:        raw.expires_at,
    startedAt:        raw.started_at,
    remainingSeconds: Math.max(0, Math.floor((new Date(raw.expires_at).getTime() - Date.now()) / 1000)),
    upgraded:         raw.upgraded_at !== null,
    upgradedAt:       raw.upgraded_at,
  };
}

