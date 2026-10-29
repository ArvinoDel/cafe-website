/*
# Migration: 20261029000000_revoke_get_order_by_code
#
# Context:
#   get_order_by_code was created in 20260917010000_secure_order_lookup.sql
#   with SECURITY DEFINER and granted execute permissions to the anon role.
#   Order lookups now execute authoritatively through the Next.js server-side API
#   (/api/orders/lookup) with IP normalization, HMAC hashing, and rate limiting.
#   Revoking and dropping get_order_by_code eliminates direct anonymous RPC access
#   to customer order data via the public Supabase REST API.
*/

DO $$
BEGIN
  -- Revoke permissions if function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_order_by_code'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_order_by_code(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.get_order_by_code(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.get_order_by_code(text) FROM authenticated;
    DROP FUNCTION public.get_order_by_code(text);
  END IF;
END $$;

