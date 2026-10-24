/**
 * app/api/admin/branches/trusted-ip/route.ts
 *
 * Manages trusted Wi-Fi IP hashes for branches:
 * - GET: list trusted Wi-Fi entries { id, hash_prefix, added_by, added_at, label } (omits full hash)
 * - POST: adds caller's current IP hash as a trusted Wi-Fi entry (max 5 entries per branch)
 * - DELETE: removes a trusted Wi-Fi entry by id
 *
 * Auth & RBAC:
 * - superadmin: may view/add/delete for any branch
 * - admin: may only view/add/delete for their own assigned branch (callerProfile.branch_id === branch_id)
 * - other / unauthenticated: 403 / 401
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseContext, createAdminClient } from '@/lib/supabase-server';
import { getClientIp, computeClientIpHash } from '@/lib/client-ip';

export interface TrustedWifiEntry {
  id: string;
  hash: string;
  hash_prefix: string;
  added_by: string;
  added_at: string;
  label: string;
}

export type TrustedWifiPublicEntry = Omit<TrustedWifiEntry, 'hash'>;

const PostSchema = z.object({
  branch_id: z.string().uuid('branch_id harus berupa UUID yang valid.'),
  label:     z.string().trim().max(60, 'Label maksimal 60 karakter.').optional(),
});

const DeleteSchema = z.object({
  id:        z.string().min(1, 'ID entri Wi-Fi wajib diisi.'),
  branch_id: z.string().uuid('branch_id harus berupa UUID yang valid.'),
});

function normalizeStoredEntries(raw: unknown): TrustedWifiEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => {
    if (typeof item === 'string') {
      return {
        id:          item,
        hash:        item,
        hash_prefix: item.slice(0, 8),
        added_by:    'System (migrated)',
        added_at:    new Date().toISOString(),
        label:       'Wi-Fi Kafe',
      };
    }
    const hash = String(item.hash ?? '');
    return {
      id:          String(item.id ?? hash),
      hash:        hash,
      hash_prefix: String(item.hash_prefix ?? hash.slice(0, 8)),
      added_by:    String(item.added_by ?? 'Admin'),
      added_at:    String(item.added_at ?? new Date().toISOString()),
      label:       String(item.label ?? 'Wi-Fi Kafe'),
    };
  });
}

function toPublicEntry(entry: TrustedWifiEntry): TrustedWifiPublicEntry {
  return {
    id:          entry.id,
    hash_prefix: entry.hash_prefix,
    added_by:    entry.added_by,
    added_at:    entry.added_at,
    label:       entry.label,
  };
}

async function verifyStaffCaller() {
  const { data: ctx, error: authError } = await createSupabaseContext({ auth: 'user' });
  if (authError || !ctx || !ctx.userClaims) {
    return { error: NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 }) };
  }

  const { data: callerProfile } = await ctx.supabase
    .from('profiles')
    .select('id, role, branch_id, full_name')
    .eq('id', ctx.userClaims.id)
    .single();

  const isSuperadmin = callerProfile?.role === 'superadmin';
  const isAdmin       = callerProfile?.role === 'admin';

  if (!isSuperadmin && !isAdmin) {
    return { error: NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 }) };
  }

  return { ctx, callerProfile, isSuperadmin };
}

// ─── GET: List trusted Wi-Fi entries for branch ───────────────────────────────

export async function GET(request: NextRequest) {
  const authRes = await verifyStaffCaller();
  if ('error' in authRes) return authRes.error;
  const { callerProfile, isSuperadmin } = authRes;

  const branchId = request.nextUrl.searchParams.get('branch_id');
  if (!branchId) {
    return NextResponse.json({ error: 'branch_id wajib disertakan.' }, { status: 400 });
  }

  // Branch isolation
  if (!isSuperadmin && callerProfile?.branch_id !== branchId) {
    return NextResponse.json(
      { error: 'Anda hanya dapat melihat Wi-Fi kafe untuk cabang Anda sendiri.' },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  const { data: branch, error: fetchError } = await adminClient
    .from('branches')
    .select('id, trusted_ip_hashes')
    .eq('id', branchId)
    .single();

  if (fetchError || !branch) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 404 });
  }

  const entries = normalizeStoredEntries(branch.trusted_ip_hashes).map(toPublicEntry);
  return NextResponse.json({ ok: true, entries });
}

// ─── POST: Add current IP hash as trusted Wi-Fi (max 5) ───────────────────────

export async function POST(request: NextRequest) {
  const authRes = await verifyStaffCaller();
  if ('error' in authRes) return authRes.error;
  const { callerProfile, isSuperadmin } = authRes;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format JSON tidak valid.' }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Input tidak valid.' },
      { status: 400 },
    );
  }

  const { branch_id, label } = parsed.data;

  // Branch isolation
  if (!isSuperadmin && callerProfile?.branch_id !== branch_id) {
    return NextResponse.json(
      { error: 'Anda hanya dapat mengatur Wi-Fi kafe untuk cabang Anda sendiri.' },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  const { data: branch, error: fetchError } = await adminClient
    .from('branches')
    .select('id, trusted_ip_hashes')
    .eq('id', branch_id)
    .single();

  if (fetchError || !branch) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 404 });
  }

  const currentEntries = normalizeStoredEntries(branch.trusted_ip_hashes);

  // Max 5 entries check
  if (currentEntries.length >= 5) {
    return NextResponse.json(
      { error: 'Batas maksimal 5 Wi-Fi terpercaya per cabang telah tercapai. Hapus entri lama terlebih dahulu.' },
      { status: 400 },
    );
  }

  // Resolve client IP and compute IP hash
  const rawIp = getClientIp(request);
  const ipHash = computeClientIpHash(rawIp);

  // Check if this hash is already registered
  const existing = currentEntries.find((e) => e.hash === ipHash);
  if (existing) {
    return NextResponse.json({
      ok: true,
      entry: toPublicEntry(existing),
      message: 'IP Wi-Fi ini sudah terdaftar sebelumnya.',
    });
  }

  const newEntry: TrustedWifiEntry = {
    id:          crypto.randomUUID(),
    hash:        ipHash,
    hash_prefix: ipHash.slice(0, 8),
    added_by:    callerProfile?.full_name || 'Admin',
    added_at:    new Date().toISOString(),
    label:       label?.trim() || 'Wi-Fi Kafe',
  };

  const updatedEntries = [...currentEntries, newEntry];

  const { error: updateError } = await adminClient
    .from('branches')
    .update({ trusted_ip_hashes: updatedEntries })
    .eq('id', branch_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    entry:   toPublicEntry(newEntry),
    message: 'Wi-Fi kafe berhasil disimpan.',
  });
}

// ─── DELETE: Delete a trusted Wi-Fi entry by id ───────────────────────────────

export async function DELETE(request: NextRequest) {
  const authRes = await verifyStaffCaller();
  if ('error' in authRes) return authRes.error;
  const { callerProfile, isSuperadmin } = authRes;

  let id = request.nextUrl.searchParams.get('id');
  let branchId = request.nextUrl.searchParams.get('branch_id');

  if (!id || !branchId) {
    try {
      const body = await request.json();
      const parsed = DeleteSchema.safeParse(body);
      if (parsed.success) {
        id = parsed.data.id;
        branchId = parsed.data.branch_id;
      }
    } catch {
      // Keep search params
    }
  }

  if (!id || !branchId) {
    return NextResponse.json(
      { error: 'id dan branch_id wajib disertakan.' },
      { status: 400 },
    );
  }

  // Branch isolation
  if (!isSuperadmin && callerProfile?.branch_id !== branchId) {
    return NextResponse.json(
      { error: 'Anda hanya dapat menghapus Wi-Fi kafe untuk cabang Anda sendiri.' },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  const { data: branch, error: fetchError } = await adminClient
    .from('branches')
    .select('id, trusted_ip_hashes')
    .eq('id', branchId)
    .single();

  if (fetchError || !branch) {
    return NextResponse.json({ error: 'Cabang tidak ditemukan.' }, { status: 404 });
  }

  const currentEntries = normalizeStoredEntries(branch.trusted_ip_hashes);
  const updatedEntries = currentEntries.filter((e) => e.id !== id && e.hash !== id);

  const { error: updateError } = await adminClient
    .from('branches')
    .update({ trusted_ip_hashes: updatedEntries })
    .eq('id', branchId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    message: 'Wi-Fi kafe berhasil dihapus.',
  });
}
