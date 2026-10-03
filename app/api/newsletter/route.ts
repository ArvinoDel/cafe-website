import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

/**
 * POST /api/newsletter
 *
 * Subscribes an email address to the newsletter.
 *
 * Anti-abuse measures:
 *  - Honeypot field: `website` must be empty (invisible to humans, bots fill it)
 *  - Rate limit: max 3 subscriptions per IP per hour (via ip_hash dedup window)
 *  - Email uniqueness enforced at DB level (UNIQUE constraint)
 *  - No sensitive data stored — only a SHA-256 hash of the IP
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('[newsletter] SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL is missing');
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.IP_SALT || 'newsletter')).digest('hex');
}

export async function POST(req: NextRequest) {
  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email   = typeof body.email   === 'string' ? body.email.trim().toLowerCase() : '';
  const website = typeof body.website === 'string' ? body.website : ''; // honeypot

  // 2. Honeypot check — bots fill this field; real users leave it empty
  if (website) {
    // Silently succeed so bots don't learn they were caught
    return NextResponse.json({ ok: true });
  }

  // 3. Basic email validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email tidak valid.' }, { status: 422 });
  }

  // 4. IP rate limiting — max 3 attempts per hashed IP in the last hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const ipHash = hashIp(ip);

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Terjadi kesalahan. Coba lagi.' }, { status: 500 });
  }
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('newsletter_subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('subscribed_at', oneHourAgo);

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
      { status: 429 },
    );
  }

  // 5. Insert — UNIQUE constraint on email handles duplicate gracefully
  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({ email, ip_hash: ipHash, source: 'footer_form' });

  if (error) {
    // Unique violation — treat as success (don't leak "already subscribed")
    if (error.code === '23505') {
      return NextResponse.json({ ok: true });
    }
    console.error('[newsletter] DB error:', error.message);
    return NextResponse.json({ error: 'Terjadi kesalahan. Coba lagi.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
