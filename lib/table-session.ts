/**
 * lib/table-session.ts
 *
 * Client-side utilities for the table claim session.
 * The session token lives in a httpOnly cookie (inaccessible to JS).
 * This module provides:
 *   - A React hook `useTableSession` that polls GET /api/tables/session
 *     and holds the current display state.
 *   - A helper `claimTable` that calls POST /api/tables/claim.
 *
 * LocalStorage remains a display cache only; the server is the source of truth.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TABLE_KEY, BRANCH_KEY } from '@/lib/storage-keys';
import { formatHHMM } from '@/lib/datetime';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableSessionInfo = {
  tableCode:        string;
  tableLabel:       string | null;
  tableSeats:       number;
  branchId:         string;
  expiresAt:        string;
  startedAt:        string;
  remainingSeconds: number;
  upgraded:         boolean;
};

export type ClaimTableResult =
  | { ok: true;  session: TableSessionInfo; isExisting: boolean }
  | {
      ok: false;
      code: string;
      error: string;
      startsAt?: string;
      availableUntil?: string;
      remaining_minutes?: number;
      remaining_seconds?: number;
      until?: string;
    };

// ─── Claim helper ─────────────────────────────────────────────────────────────

/**
 * Calls POST /api/tables/claim.
 * On success, also writes table + branch to localStorage as a display cache.
 */
export async function claimTable(params: {
  branchId?: string;
  code:      string;
  reservationCode?: string;
}): Promise<ClaimTableResult> {
  try {
    const res = await fetch('/api/tables/claim', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        branch_id:        params.branchId,
        code:             params.code,
        reservation_code: params.reservationCode,
      }),
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      return {
        ok:    false,
        code:  'NETWORK_ERROR',
        error: `Server mengalami gangguan (${res.status || '500'}). Silakan coba lagi sebentar.`,
      };
    }

    if (!json || typeof json !== 'object') {
      return {
        ok:    false,
        code:  'NETWORK_ERROR',
        error: 'Respon server tidak valid.',
      };
    }

    if (json.ok && json.session) {
      // Write display cache to localStorage
      try {
        localStorage.setItem(TABLE_KEY,  json.session.tableCode);
        localStorage.setItem(BRANCH_KEY, json.session.branchId);
      } catch {}
    }

    return json as ClaimTableResult;
  } catch (err: any) {
    return {
      ok:    false,
      code:  'NETWORK_ERROR',
      error: err?.message || 'Gagal terhubung ke server.',
    };
  }
}

// ─── Poll interval ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useTableSession
 *
 * Reads the current active table session from the server.
 * Polls every 30 seconds to keep the countdown fresh.
 *
 * Returns:
 *   - session:   the current active session or null
 *   - loading:   true on the initial fetch
 *   - refresh(): trigger a manual re-fetch (e.g., after a claim)
 *   - expiryLabel: human-readable "aktif sampai HH.MM" string
 */
export function useTableSession(enabled = true) {
  const [session, setSession]   = useState<TableSessionInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res  = await fetch('/api/tables/session', { cache: 'no-store' });
      const json = await res.json();
      setSession(json.session ?? null);
    } catch {
      // Network error: keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void fetchSession();

    intervalRef.current = setInterval(fetchSession, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fetchSession]);

  const expiryLabel: string | null = session
    ? session.upgraded
      ? `aktif sampai ${formatHHMM(session.expiresAt)}`
      : `ditahan sampai ${formatHHMM(session.expiresAt)}, selesaikan pesanan agar meja terkunci`
    : null;

  return { session, loading, refresh, expiryLabel };
}
