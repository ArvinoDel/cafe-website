/**
 * lib/db-rate-limiter.ts
 *
 * Distributed DB-backed atomic rate limiter using PostgreSQL `rate_limits` table
 * and `check_rate_limit` RPC.
 *
 * Security:
 * - Fail closed for write-type routes (reservation create, payment, claim) to protect DB
 * - Fail open for read-only routes so transient errors do not block legitimate lookups
 */

import { createAdminClient } from '@/lib/supabase-server';

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  reset_at: string;
};

export type CheckDbRateLimitOptions = {
  adminClient?: any;
  failClosed?: boolean;
};

function isWriteRouteKey(key: string): boolean {
  return (
    key.startsWith('res_create') ||
    key.startsWith('res_pay') ||
    key.startsWith('claim') ||
    key.startsWith('proof_upload')
  );
}

export async function checkDbRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  adminClientOrOptions?: any,
  explicitFailClosed?: boolean,
): Promise<RateLimitResult> {
  let admin: any;
  let failClosed: boolean;

  if (adminClientOrOptions && typeof adminClientOrOptions === 'object' && !('from' in adminClientOrOptions) && !('rpc' in adminClientOrOptions)) {
    const opts = adminClientOrOptions as CheckDbRateLimitOptions;
    admin = opts.adminClient || createAdminClient();
    failClosed = opts.failClosed ?? isWriteRouteKey(key);
  } else {
    admin = adminClientOrOptions || createAdminClient();
    failClosed = explicitFailClosed ?? isWriteRouteKey(key);
  }

  let data: any;
  let error: any;
  try {
    const res = await (admin as any).rpc('check_rate_limit', {
      p_key:            key,
      p_limit:          limit,
      p_window_seconds: windowSeconds,
    });
    data = res.data;
    error = res.error;
  } catch (err: any) {
    error = { message: err?.message || 'RPC invocation failed' };
  }

  if (error) {
    console.error('[checkDbRateLimit] DB error:', error.message);
    if (failClosed) {
      // Fail closed for write routes: reject request on DB outage/error
      return {
        allowed:   false,
        count:     limit,
        limit,
        remaining: 0,
        reset_at:  new Date(Date.now() + windowSeconds * 1000).toISOString(),
      };
    }

    // Fail open for read-only routes so legitimate users aren't locked out on transient errors
    return {
      allowed:   true,
      count:     1,
      limit,
      remaining: limit - 1,
      reset_at:  new Date(Date.now() + windowSeconds * 1000).toISOString(),
    };
  }

  const result = typeof data === 'string' ? JSON.parse(data) : data;
  return {
    allowed:   Boolean(result?.allowed),
    count:     Number(result?.count ?? 1),
    limit:     Number(result?.limit ?? limit),
    remaining: Number(result?.remaining ?? 0),
    reset_at:  String(result?.reset_at ?? new Date().toISOString()),
  };
}
