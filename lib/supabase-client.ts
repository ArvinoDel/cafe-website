'use client';

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a shared singleton Supabase browser client.
 * This prevents creating multiple GoTrueClient instances under the same storage key.
 */
export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      supabaseUrl || 'https://placeholder-project.supabase.co',
      supabaseAnonKey || 'placeholder-anon-key',
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      supabaseUrl || 'https://placeholder-project.supabase.co',
      supabaseAnonKey || 'placeholder-anon-key',
      { isSingleton: true },
    );
  }
  return browserClient;
}

/**
 * Singleton proxy instance for direct imports (e.g. `import { supabase } from '@/lib/supabase-client'`).
 */
export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    const client = getSupabaseBrowserClient();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
