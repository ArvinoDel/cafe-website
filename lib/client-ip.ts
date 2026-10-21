/**
 * lib/client-ip.ts
 *
 * Authoritative client IP resolution and HMAC hashing.
 *
 * Security Rules:
 * 1. Checks `x-nf-client-connection-ip` first (Netlify edge verified client IP).
 * 2. Checks `x-real-ip` second.
 * 3. If `x-forwarded-for` is present, takes the RIGHTMOST IP, NEVER the leftmost,
 *    preventing spoofing attacks via prepended headers.
 * 4. Falls back to '127.0.0.1'.
 */

import crypto from 'crypto';

export function getClientIp(requestOrHeaders: Request | Headers | { headers: Headers }): string {
  let headers: Headers;
  if (requestOrHeaders instanceof Headers) {
    headers = requestOrHeaders;
  } else if ('headers' in requestOrHeaders && requestOrHeaders.headers instanceof Headers) {
    headers = requestOrHeaders.headers;
  } else {
    headers = (requestOrHeaders as Request).headers;
  }

  // 1. Netlify edge-verified connection IP (cannot be spoofed by client)
  const nfIp = headers.get('x-nf-client-connection-ip')?.trim();
  if (nfIp) return nfIp;

  // 2. Real IP header from upstream reverse proxy
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // 3. X-Forwarded-For: take RIGHTMOST IP to prevent spoofing
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const ips = xff.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) {
      return ips[ips.length - 1];
    }
  }

  return '127.0.0.1';
}

/**
 * Computes SHA-256 HMAC of client IP with a server secret to protect privacy.
 */
export function computeClientIpHash(rawIp: string, secret?: string): string {
  const salt =
    secret ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SESSION_SECRET ||
    'cafe-ip-salt-fallback';

  return crypto.createHmac('sha256', salt).update(rawIp).digest('hex');
}
