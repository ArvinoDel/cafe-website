/*
 * Migration: Secure bump_group_cart_version function
 * Timestamp: 20261004000000
 *
 * Restricts execution of bump_group_cart_version(uuid) to service_role only.
 * Public, anon, and authenticated users cannot invoke it directly.
 */

REVOKE EXECUTE ON FUNCTION bump_group_cart_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_group_cart_version(uuid) TO service_role;
