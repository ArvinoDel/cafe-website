/**
 * lib/db-rate-limiter.ts
 *
 * Distributed DB-backed atomic rate limiter using PostgreSQL `rate_limits` table
 * and `check_rate_limit` RPC.
 */

import { createAdminClient } from '@/lib/supabase-server';

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  reset_at: string;
};

export async function checkDbRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  adminClient?: any,
): Promise<RateLimitResult> {
  const admin = adminClient || createAdminClient();

  const { data, error } = await (admin as any).rpc('check_rate_limit', {
    p_key:            key,
    p_limit:          limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[checkDbRateLimit] DB error:', error.message);
    // Fail open or allow on transient database error so legitimate users aren't locked out
    return {
      allowed: true,
      count: 1,
      limit,
      remaining: limit - 1,
      reset_at: new Date(Date.now() + windowSeconds * 1000).toISOString(),
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
