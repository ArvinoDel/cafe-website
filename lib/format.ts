/**
 * lib/format.ts
 *
 * Shared formatting utilities for currency and numbers used across
 * guest-facing pages and admin screens.
 *
 * Rules:
 *  - Currency is always displayed in IDR / Rupiah.
 *  - No decimals (minimumFractionDigits: 0).
 *  - Locale: id-ID (dots as thousands separator, e.g. "Rp 27.000").
 */

/**
 * Formats a number as Indonesian Rupiah.
 * Example: formatRupiah(27000) → "Rp 27.000"
 */
export function formatRupiah(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}
