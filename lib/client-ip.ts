/**
 * lib/client-ip.ts
 *
 * Authoritative client IP resolution and HMAC hashing.
 *
 * Security Rules:
 * 1. Trusts `x-nf-client-connection-ip` only.
 * 2. If absent in production, returns fixed 'unknown' bucket and logs a warning.
 *    (Does not trust x-real-ip or X-Forwarded-For).
 * 3. In dev, allows '127.0.0.1'.
 * 4. Normalizes IPv6 addresses to their /64 prefix before hashing.
 * 5. computeClientIpHash throws in production if IP_HASH_SECRET is not set.
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

  // 1. Trust Netlify edge-verified client connection IP only
  const nfIp = headers.get('x-nf-client-connection-ip')?.trim();
  if (nfIp) return nfIp;

  // 2. In production, never trust untrusted proxy headers; return fixed unknown bucket
  if (process.env.NODE_ENV === 'production') {
    console.warn('[getClientIp] x-nf-client-connection-ip absent in production; using unknown bucket');
    return 'unknown';
  }

  // 3. In dev allow 127.0.0.1
  return '127.0.0.1';
}

/**
 * Normalizes an IP address. For IPv6, truncates to its /64 prefix (first 4 hextets)
 * so that IPv6 privacy extensions and rotation within the same /64 subnet map to the same bucket.
 */
export function normalizeIp(ip: string): string {
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!clean.includes(':')) {
    // IPv4 or special string (e.g. 'unknown')
    return clean;
  }

  try {
    // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.0.2.128)
    const ipv4Match = clean.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (ipv4Match) {
      return ipv4Match[1];
    }

    let parts: string[];
    if (clean.includes('::')) {
      const halves = clean.split('::');
      const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
      const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
      const missing = Math.max(0, 8 - (left.length + right.length));
      parts = [...left, ...Array(missing).fill('0'), ...right];
    } else {
      parts = clean.split(':').filter(Boolean);
    }

    while (parts.length < 8) {
      parts.push('0');
    }

    const prefixHextets = parts.slice(0, 4).map((h) => h.padStart(4, '0').toLowerCase());
    return `${prefixHextets.join(':')}::/64`;
  } catch {
    return clean;
  }
}

/**
 * Computes SHA-256 HMAC of client IP with a server secret to protect privacy.
 * Throws in production if IP_HASH_SECRET is not configured.
 */
export function computeClientIpHash(rawIp: string, customSecret?: string): string {
  const secret = customSecret || process.env.IP_HASH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('computeClientIpHash: IP_HASH_SECRET environment variable is required in production');
    }
  }

  const effectiveSecret = secret || 'dev-ip-hash-secret';
  const normalized = normalizeIp(rawIp);
  return crypto.createHmac('sha256', effectiveSecret).update(normalized).digest('hex');
}
