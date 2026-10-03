import { NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/admin/newsletter-export
 *
 * Downloads all newsletter subscribers as a CSV file.
 * Only accessible by superadmin users.
 */

function formatCsvCell(val: unknown): string {
  const str = val == null ? '' : String(val);
  const neutralized = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export async function GET() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secretKey || !url) {
    console.error('[newsletter-export] SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL is missing');
    return NextResponse.json({ error: 'Terjadi kesalahan sistem.' }, { status: 500 });
  }

  // 1. Auth — superadmin only
  const { data: ctx, error: authErr } = await createSupabaseContext({ auth: 'user' });
  if (authErr || !ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('role')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (!profile || profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Fetch all subscribers using secret key (bypasses RLS read restriction)
  const serviceClient = createClient(url, secretKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await serviceClient
    .from('newsletter_subscribers')
    .select('email, subscribed_at, source')
    .order('subscribed_at', { ascending: false });

  if (error) {
    console.error('[newsletter-export] DB error:', error.message);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem.' }, { status: 500 });
  }

  // 3. Build CSV
  const rows = (data ?? []).map((row) => ({
    email:         row.email,
    subscribed_at: row.subscribed_at,
    source:        row.source ?? 'footer_form',
  }));

  const header = 'email,subscribed_at,source\n';
  const body   = rows
    .map((r) =>
      [
        formatCsvCell(r.email),
        formatCsvCell(r.subscribed_at),
        formatCsvCell(r.source),
      ].join(','),
    )
    .join('\n');

  const csv = header + body;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="newsletter-subscribers-${date}.csv"`,
    },
  });
}
