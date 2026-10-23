/**
 * POST /api/admin/branches/trusted-ip
 *
 * Adds the caller's current IP hash to branches.trusted_ip_hashes.
 * Used on the admin page ("Wi-Fi kafe" section) so staff connecting to the cafe Wi-Fi
 * can register the router/proxy's public IP hash, skipping the per-IP soft hold cap.
 *
 * Auth: session-based (createSupabaseContext({ auth: 'user' })) + profiles lookup.
 *   - superadmin  → may update any branch
 *   - admin       → may only update their own profiles.branch_id
 *   - other / unauthenticated → 403 / 401
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseContext, createAdminClient } from '@/lib/supabase-server';
import { getClientIp, computeClientIpHash } from '@/lib/client-ip';

const Schema = z.object({
  branch_id: z.string().uuid('branch_id harus berupa UUID yang valid.'),
});

export async function POST(request: NextRequest) {
  // 1. Verify caller session
  const { data: ctx, error: authError } = await createSupabaseContext({ auth: 'user' });

  if (authError || !ctx || !ctx.userClaims) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  // 2. Lookup caller profile for RBAC
  const { data: callerProfile } = await ctx.supabase
    .from('profiles')
    .select('role, branch_id')
    .eq('id', ctx.userClaims.id)
    .single();

  const isSuperadmin = callerProfile?.role === 'superadmin';
  const isAdmin       = callerProfile?.role === 'admin';

  if (!isSuperadmin && !isAdmin) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  // 3. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format JSON tidak valid.' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Input tidak valid.' },
      { status: 400 },
    );
  }

  const { branch_id } = parsed.data;

  // Branch isolation
  if (!isSuperadmin && callerProfile?.branch_id !== branch_id) {
    return NextResponse.json(
      { error: 'Anda hanya dapat mengatur Wi-Fi kafe untuk cabang Anda sendiri.' },
      { status: 403 },
    );
  }

  // 4. Resolve client IP and compute IP hash
  const rawIp = getClientIp(request);
  const ipHash = computeClientIpHash(rawIp);

  // 5. Update branch trusted_ip_hashes via admin client
  const adminClient = createAdminClient();

  const { data: branch, error: fetchError } = await adminClient
    .from('branches')
    .select('id, trusted_ip_hashes')
    .eq('id', branch_id)
    .single();

  if (fetchError || !branch) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 404 });
  }

  const currentHashes: string[] = Array.isArray(branch.trusted_ip_hashes)
    ? branch.trusted_ip_hashes
    : [];

  const updatedHashes = currentHashes.includes(ipHash)
    ? currentHashes
    : [...currentHashes, ipHash];

  const { error: updateError } = await adminClient
    .from('branches')
    .update({ trusted_ip_hashes: updatedHashes })
    .eq('id', branch_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ip_hash: ipHash,
    trusted_ip_hashes: updatedHashes,
    message: 'Hash IP Wi-Fi kafe berhasil disimpan.',
  });
}
