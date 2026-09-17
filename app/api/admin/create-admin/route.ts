/**
 * app/api/admin/create-admin/route.ts
 *
 * Server-side route handler that creates a new branch admin account.
 * Uses SUPABASE_SECRET_KEY (server-only, never sent to the client).
 *
 * Security: verifies the caller has a valid session with role='superadmin' before acting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseContext } from '@/lib/supabase-server';
import { createAdminClient } from '@supabase/server/core';
import type { SupabaseEnv } from '@supabase/server';

function resolveEnv(): Partial<SupabaseEnv> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  const env: Partial<SupabaseEnv> = {};
  if (url) env.url = url;
  if (publishableKey) env.publishableKeys = { default: publishableKey };
  if (secretKey) env.secretKeys = { default: secretKey };
  return env;
}

export async function POST(request: NextRequest) {
  // 1. Verify that the caller has a valid admin session
  const { data: ctx, error: authError } = await createSupabaseContext({ auth: 'user' });

  if (authError || !ctx) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }

  // 2. Check that caller is a superadmin
  const { data: callerProfile } = await ctx.supabase
    .from('profiles')
    .select('role')
    .eq('id', ctx.userClaims!.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Akses ditolak. Hanya superadmin yang dapat membuat akun admin.' }, { status: 403 });
  }

  // 3. Parse and validate the request body
  let body: { email: string; password: string; fullName?: string; branchId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { email, password, fullName, branchId } = body;

  if (!email?.trim() || !password?.trim() || !branchId?.trim()) {
    return NextResponse.json(
      { error: 'Email, password, dan branchId wajib diisi.' },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password minimal 8 karakter.' },
      { status: 400 },
    );
  }

  // 4. Create the auth user using the service-role (admin) client
  const env = resolveEnv();
  const supabaseAdmin = createAdminClient({ env });

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });

  if (createError || !newUser?.user) {
    return NextResponse.json(
      { error: createError?.message ?? 'Gagal membuat akun pengguna.' },
      { status: 500 },
    );
  }

  // 5. Insert the profiles row
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: newUser.user.id,
      role: 'admin',
      branch_id: branchId.trim(),
      full_name: fullName?.trim() || null,
    });

  if (profileError) {
    // Rollback: delete the created auth user to avoid orphans
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json(
      { error: 'Gagal membuat profil admin: ' + profileError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, userId: newUser.user.id });
}
