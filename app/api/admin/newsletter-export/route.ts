import { NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/admin/newsletter-export
 *
 * Downloads all newsletter subscribers as a CSV file.
 * Only accessible by superadmin users.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export async function GET() {
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

  // 2. Fetch all subscribers using service role (bypasses RLS read restriction)
  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await serviceClient
    .from('newsletter_subscribers')
    .select('email, subscribed_at, source')
    .order('subscribed_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
        `"${r.email.replace(/"/g, '""')}"`,
        `"${r.subscribed_at}"`,
        `"${(r.source ?? '').replace(/"/g, '""')}"`,
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
