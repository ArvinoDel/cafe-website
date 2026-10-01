'use client';

/**
 * lib/branch-info.ts
 *
 * Client-side helper for fetching GET /api/branch-info with:
 *   - 30-second TTL in-memory cache keyed by branch ID (or '' for auto-resolve)
 *   - In-flight request deduplication (one Promise shared across concurrent callers)
 *   - `refresh()` to force a bypass of the TTL
 *
 * The exported `BranchInfo` type intentionally covers all fields that any
 * consumer (WifiInfoCard, /checkout, /status, /menu, /receipt) might read.
 * Fields added by later parts (accepting_orders, pause_message, etc.) are
 * declared optional so Part 0 compiles cleanly and later parts simply fill them.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Type ────────────────────────────────────────────────────────────────────

export type BranchInfo = {
  // Core fields (always returned)
  wifi_name?: string | null;
  wifi_password?: string | null;
  opening_hours?: string | null;
  est_wait_minutes?: number | null;
  // Added in Part 1
  accepting_orders?: boolean;
  pause_message?: string | null;
  // Added in Part 2
  name?: string | null;
  address?: string | null;
  // Added in Part 3
  wait_per_order_minutes?: number;
  queue_count?: number;
  est_wait_now?: number | null;
};

// ─── Cache & in-flight deduplication ────────────────────────────────────────

const CACHE_TTL_MS = 30_000; // 30 seconds

type CacheEntry = { data: BranchInfo; timestamp: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<BranchInfo | null>>();

// ─── Core fetch helper ───────────────────────────────────────────────────────

/**
 * fetchBranchInfo
 *
 * Fetches /api/branch-info for the given branch ID (or auto-resolves when
 * branchId is null/undefined). Shares in-flight promises and respects the
 * 30-second TTL.
 *
 * @param branchId  UUID string, or null/undefined for single-branch auto-resolve.
 * @param forceRefresh  When true, bypasses the TTL and fetches fresh data.
 */
export async function fetchBranchInfo(
  branchId?: string | null,
  forceRefresh = false,
): Promise<BranchInfo | null> {
  const key = branchId ?? '';

  // Return cached data if still fresh
  if (!forceRefresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
      return hit.data;
    }
  }

  // Deduplicate in-flight requests for the same key
  const existing = inflight.get(key);
  if (existing) return existing;

  const url = branchId
    ? `/api/branch-info?branch_id=${encodeURIComponent(branchId)}`
    : `/api/branch-info`;

  const promise = (async (): Promise<BranchInfo | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data: BranchInfo = await res.json();
      cache.set(key, { data, timestamp: Date.now() });
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

// ─── React hook ──────────────────────────────────────────────────────────────

export type UseBranchInfoResult = {
  info: BranchInfo | null;
  loading: boolean;
  error: boolean;
  /** Force a fresh fetch regardless of cache TTL */
  refresh: () => void;
};

/**
 * useBranchInfo
 *
 * React hook that returns branch info for the given branch ID.
 *
 * If `branchId` is undefined/null, the hook reads `localStorage.getItem('kopi-nako-branch')`
 * on mount (matching the previous WifiInfoCard behaviour) and uses that as the key.
 * This means callers that don't yet have the branch ID available can pass null and
 * still get data once localStorage is available client-side.
 *
 * Returns: { info, loading, error, refresh }
 */
export function useBranchInfo(branchId?: string | null): UseBranchInfoResult {
  const [info, setInfo] = useState<BranchInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Increment to trigger re-fetch imperatively (refresh())
  const [refreshCounter, setRefreshCounter] = useState(0);
  // Stable ref so we can avoid stale-closure issues
  const branchIdRef = useRef(branchId);

  useEffect(() => {
    branchIdRef.current = branchId;
  }, [branchId]);

  // Resolve the effective branch ID (prop → localStorage fallback)
  const getEffectiveBranchId = useCallback((): string | null => {
    const fromProp = branchIdRef.current;
    if (fromProp) return fromProp;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kopi-nako-branch');
    }
    return null;
  }, []);

  const load = useCallback(
    async (forceRefresh = false) => {
      const effectiveId = getEffectiveBranchId();
      if (effectiveId === null && branchIdRef.current !== undefined) {
        // branchId explicitly passed (possibly null during loading); wait
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const data = await fetchBranchInfo(effectiveId, forceRefresh);
        setInfo(data);
        if (!data) setError(true);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [getEffectiveBranchId],
  );

  // Re-fetch whenever branchId changes or refresh() is called
  useEffect(() => {
    const forceRefresh = refreshCounter > 0;
    load(forceRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, refreshCounter, load]);

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  return { info, loading, error, refresh };
}
