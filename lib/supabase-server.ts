/**
 * lib/supabase-server.ts
 *
 * Server-side Supabase utilities for Next.js App Router.
 * Composes @supabase/ssr (cookie session) with @supabase/server/core (JWT verification).
 *
 * Usage:
 *   const { data: ctx, error } = await createSupabaseContext({ auth: 'user' });
 *   if (error) redirect('/admin/login');
 *   const { supabase, supabaseAdmin } = ctx!;
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  verifyCredentials,
  createContextClient,
  createAdminClient,
} from '@supabase/server/core';
import type { AuthModeWithKey, SupabaseContext, SupabaseEnv } from '@supabase/server';

// ─── Env resolution ──────────────────────────────────────────────────────────

function resolveNextEnv(): Partial<SupabaseEnv> {
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

// ─── JWKS cache (module-scoped, reused across requests in the same process) ──

let cachedJwks: SupabaseEnv['jwks'] = null;

async function getJwks(supabaseUrl: string): Promise<SupabaseEnv['jwks']> {
  if (cachedJwks) return cachedJwks;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) return null;
    cachedJwks = await res.json();
    return cachedJwks;
  } catch {
    return null;
  }
}

// ─── Main adapter ─────────────────────────────────────────────────────────────

/**
 * createSupabaseContext — reads the SSR session cookie (already refreshed by
 * middleware), verifies the JWT, and returns typed Supabase clients.
 *
 * @param options.auth  Auth mode: 'user' (requires valid session), 'none' (no auth).
 */
export async function createSupabaseContext(
  options: { auth?: AuthModeWithKey | AuthModeWithKey[] } = { auth: 'user' },
): Promise<{ data: SupabaseContext; error: null } | { data: null; error: Error }> {
  const nextEnv = resolveNextEnv();

  if (!nextEnv.url || !nextEnv.publishableKeys?.default) {
    return {
      data: null,
      error: new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    };
  }

  const cookieStore = await cookies();
  const ssrClient = createServerClient(
    nextEnv.url,
    nextEnv.publishableKeys.default,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: opts }) =>
              cookieStore.set(name, value, opts),
            );
          } catch {
            // Server Components can't write cookies — middleware handles refresh.
          }
        },
      },
    },
  );

  const {
    data: { session },
  } = await ssrClient.auth.getSession();
  const token = session?.access_token ?? null;

  const jwks = await getJwks(nextEnv.url);
  const env: Partial<SupabaseEnv> = { ...nextEnv, jwks };

  const { data: auth, error } = await verifyCredentials(
    { token, apikey: null },
    { auth: options.auth ?? 'user', env },
  );

  if (error) {
    return { data: null, error };
  }

  const supabase = createContextClient({
    auth: { token: auth!.token },
    env,
  });
  const supabaseAdmin = createAdminClient({ env });

  return {
    data: {
      supabase,
      supabaseAdmin,
      userClaims: auth!.userClaims,
      jwtClaims: auth!.jwtClaims,
      authMode: auth!.authMode,
    },
    error: null,
  };
}

/**
 * createBrowserSupabaseClient — thin wrapper for client components that
 * already import from @/lib/supabase-client. This is kept separate so
 * server-only imports (next/headers, @supabase/server/core) are never bundled
 * into client-side code.
 */
export { createAdminClient };
