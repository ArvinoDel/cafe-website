/**
 * lib/group-cart.ts
 *
 * Client-side helper and hooks for the "Pesan Bareng" group cart feature.
 *
 * - useGroupCart()          – polls GET /api/group-carts/[code]?since=<version>
 *                             every 4 s while the tab is active; pauses when hidden;
 *                             exponential backoff on 429 / server errors.
 * - getLocalGroupSession()  – reads the GROUP_CART_KEY from localStorage.
 * - saveLocalGroupSession() – writes to GROUP_CART_KEY.
 * - clearLocalGroupSession()– removes GROUP_CART_KEY.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GROUP_CART_KEY, LAST_DISPLAY_NAME_KEY } from '@/lib/storage-keys';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type GroupCartStatus = 'open' | 'submitted' | 'cancelled' | 'expired';

export type GroupMember = {
  id: string;
  name: string;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
};

export type GroupCartItem = {
  id: string;
  member_id: string;
  member_name: string;
  menu_item_id: string;
  name: string;
  price: number;
  effective_price: number;
  image_url: string | null;
  quantity: number;
  note: string | null;
  sold_out: boolean;
};

export type GroupCartState = {
  code: string;
  status: GroupCartStatus;
  table_number: string;
  branch_id: string;
  expires_at: string;
  version: number;
  members: GroupMember[];
  items: GroupCartItem[];
  subtotal: number;
  total: number;
  /** Present only when status === 'submitted' */
  order_code?: string;
};

/** What gets stored in localStorage under GROUP_CART_KEY */
export type LocalGroupSession = {
  code: string;
  member_id: string;
  member_token: string;
  name: string;
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function getLocalGroupSession(): LocalGroupSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GROUP_CART_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalGroupSession;
    if (!parsed.code || !parsed.member_id || !parsed.member_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalGroupSession(session: LocalGroupSession): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GROUP_CART_KEY, JSON.stringify(session));
    // Remember display name for convenience next time
    localStorage.setItem(LAST_DISPLAY_NAME_KEY, session.name);
  } catch {}
}

export function clearLocalGroupSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GROUP_CART_KEY);
  } catch {}
}

export function getLastDisplayName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(LAST_DISPLAY_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

// ─── Item mutation helpers ───────────────────────────────────────────────────

export async function setGroupCartItem(
  code: string,
  memberToken: string,
  menuItemId: string,
  quantity: number,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/group-carts/${encodeURIComponent(code)}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-token': memberToken,
      },
      body: JSON.stringify({
        action: 'set',
        menu_item_id: menuItemId,
        quantity,
        note: note ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || 'Gagal mengubah item.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Koneksi bermasalah.' };
  }
}

export async function removeGroupCartItem(
  code: string,
  memberToken: string,
  itemId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/group-carts/${encodeURIComponent(code)}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-token': memberToken,
      },
      body: JSON.stringify({
        action: 'remove',
        item_id: itemId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || 'Gagal menghapus item.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Koneksi bermasalah.' };
  }
}

// ─── Polling hook ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4_000;
const MAX_BACKOFF_MS   = 30_000;

type UseGroupCartOptions = {
  /** Disable polling (e.g. while the cart is in a terminal state). */
  enabled?: boolean;
};

type UseGroupCartResult = {
  cart: GroupCartState | null;
  loading: boolean;
  error: string | null;
  /** Force an immediate re-fetch (e.g. after optimistic update). */
  refresh: () => void;
};

export function useGroupCart(
  code: string | null | undefined,
  session: LocalGroupSession | null,
  options: UseGroupCartOptions = {},
): UseGroupCartResult {
  const { enabled = true } = options;

  const [cart, setCart]       = useState<GroupCartState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Refs so the interval callback can always read the latest value
  const versionRef   = useRef<number>(0);
  const backoffRef   = useRef<number>(POLL_INTERVAL_MS);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const enabledRef   = useRef(enabled);
  const codeRef      = useRef(code);
  const sessionRef   = useRef(session);
  const stoppedRef   = useRef(false);

  enabledRef.current  = enabled;
  codeRef.current     = code;
  sessionRef.current  = session;

  // Use a ref so scheduleNext can call fetchCart without closure issues
  const fetchCartRef = useRef<() => Promise<void>>(async () => {});

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (document.visibilityState === 'hidden') return;
    if (!enabledRef.current || stoppedRef.current) return;
    timerRef.current = setTimeout(() => fetchCartRef.current(), backoffRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCart = useCallback(async () => {
    const currentCode    = codeRef.current;
    const currentSession = sessionRef.current;
    if (!currentCode || !currentSession || !enabledRef.current || stoppedRef.current) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const url = `/api/group-carts/${encodeURIComponent(currentCode)}?since=${versionRef.current}`;
      const res = await fetch(url, {
        headers: { 'x-member-token': currentSession.member_token },
        signal: ctrl.signal,
      });

      if (ctrl.signal.aborted) return;

      if (res.status === 429) {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        setError('Terlalu banyak permintaan. Menunggu sebentar...');
        scheduleNext();
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string })?.error ?? 'Gagal memuat data grup.');
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        scheduleNext();
        return;
      }

      const json = await res.json();

      if ((json as { changed?: boolean })?.changed === false) {
        backoffRef.current = POLL_INTERVAL_MS;
        setError(null);
        scheduleNext();
        return;
      }

      const state = json as GroupCartState;
      versionRef.current = state.version;
      backoffRef.current = POLL_INTERVAL_MS;
      setCart(state);
      setError(null);
      setLoading(false);

      // Stop polling on terminal states
      if (state.status !== 'open') {
        stoppedRef.current = true;
        return;
      }

      scheduleNext();
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError('Koneksi bermasalah, mencoba lagi...');
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      scheduleNext();
    }
  }, [scheduleNext]);

  // Keep the ref up-to-date so scheduleNext can always call the latest fetchCart
  fetchCartRef.current = fetchCart;

  // Resume polling when tab becomes visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && enabledRef.current && codeRef.current && !stoppedRef.current) {
        fetchCart();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCart]);

  // Kick off initial fetch whenever code or session changes
  useEffect(() => {
    if (!code || !session || !enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      return;
    }
    versionRef.current = 0;
    backoffRef.current = POLL_INTERVAL_MS;
    stoppedRef.current = false;
    setLoading(true);
    fetchCart();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [code, session?.member_token, enabled, fetchCart]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    stoppedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    fetchCart();
  }, [fetchCart]);

  return { cart, loading, error, refresh };
}
