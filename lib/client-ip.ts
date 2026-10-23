/**
 * lib/client-ip.ts
 *
 * Authoritative client IP resolution and HMAC hashing.
 *
 * Security Rules:
 * 1. Trusted proxy configuration via env TRUSTED_IP_HEADER:
 *    - 'netlify' -> trusts `x-nf-client-connection-ip` only
 *    - 'vercel'  -> trusts `x-vercel-forwarded-for`, falling back to `x-real-ip`
 *    - 'none'    -> rejected in production with a startup error
 * 2. In production, fails loudly if TRUSTED_IP_HEADER is unset or header is missing;
 *    NEVER falls back to a shared 'unknown' bucket.
 * 3. In dev, allows '127.0.0.1' fallback.
 * 4. Normalizes IPv6 addresses to their /64 prefix before hashing or rate limiting.
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

  const rawConfig = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();

  // Production configuration validation
  if (process.env.NODE_ENV === 'production') {
    if (!rawConfig) {
      throw new Error('[getClientIp] TRUSTED_IP_HEADER environment variable is required in production (e.g. "netlify" or "vercel").');
    }
    if (rawConfig === 'none') {
      throw new Error('[getClientIp] TRUSTED_IP_HEADER="none" is rejected in production mode.');
    }
  }

  let resolvedIp: string | null | undefined = null;

  if (rawConfig === 'netlify') {
    resolvedIp = headers.get('x-nf-client-connection-ip')?.trim();
  } else if (rawConfig === 'vercel') {
    const vercelForwarded = headers.get('x-vercel-forwarded-for')?.trim();
    if (vercelForwarded) {
      resolvedIp = vercelForwarded.split(',')[0].trim();
    } else {
      resolvedIp = headers.get('x-real-ip')?.trim();
    }
  } else if (rawConfig === 'none') {
    resolvedIp = '127.0.0.1';
  } else if (rawConfig) {
    // Custom header name support
    resolvedIp = headers.get(rawConfig)?.trim();
  } else {
    // Dev fallback when TRUSTED_IP_HEADER is unset
    const nfIp = headers.get('x-nf-client-connection-ip')?.trim();
    const vercelIp = headers.get('x-vercel-forwarded-for')?.trim()?.split(',')[0]?.trim();
    const realIp = headers.get('x-real-ip')?.trim();
    resolvedIp = nfIp || vercelIp || realIp;
  }

  if (resolvedIp) {
    return resolvedIp;
  }

  // In production, never fall back to a shared 'unknown' bucket; fail loudly
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[getClientIp] Trusted IP header (${rawConfig}) is missing in request.`);
  }

  // In dev allow 127.0.0.1
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
 * Throws in production if IP_HASH_SECRET is not configured (no fallback to Supabase key or hardcoded secret).
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
