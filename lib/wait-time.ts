/**
 * lib/wait-time.ts
 *
 * Pure utilities for smart order wait-time calculation.
 * Accounts for both base preparation time (est_wait_minutes) and active queue depth.
 */

export const WAIT_CAP_MINUTES = 60;

/**
 * Computes estimated wait minutes given base prep time, increment per order ahead,
 * and count of orders ahead in line.
 *
 * Returns null when base is empty, <= 0, or not configured.
 * Otherwise returns min(WAIT_CAP_MINUTES, base + perOrder * ahead).
 */
export function computeWaitMinutes({
  base,
  perOrder,
  ahead,
}: {
  base: number | null | undefined;
  perOrder?: number | null | undefined;
  ahead?: number | null | undefined;
}): number | null {
  if (base == null || base <= 0) {
    return null;
  }

  const per = Math.max(0, perOrder ?? 0);
  const count = Math.max(0, ahead ?? 0);

  return Math.min(WAIT_CAP_MINUTES, base + per * count);
}

/**
 * Rounds minutes to the nearest multiple of 5 (minimum 5).
 * e.g., 3 -> 5, 7 -> 5, 8 -> 10, 12 -> 10, 14 -> 15.
 */
export function roundToFiveMinutes(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}
