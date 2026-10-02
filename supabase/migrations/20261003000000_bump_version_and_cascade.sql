/*
 * Migration: Atomic group cart version bump RPC & cascade delete for menu_item_id
 * Timestamp: 20261003000000
 *
 * 1. Defines bump_group_cart_version(p_cart_id uuid) to atomically increment cart version.
 * 2. Idempotently drops and re-adds group_cart_items.menu_item_id foreign key with ON DELETE CASCADE.
 */

-- 1. SQL function bump_group_cart_version
CREATE OR REPLACE FUNCTION bump_group_cart_version(p_cart_id uuid)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE group_carts
  SET version = version + 1
  WHERE id = p_cart_id
  RETURNING version;
$$;

-- 2. Make group_cart_items.menu_item_id ON DELETE CASCADE (idempotent drop & re-add)
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'group_cart_items'
      AND kcu.column_name = 'menu_item_id'
  LOOP
    EXECUTE 'ALTER TABLE group_cart_items DROP CONSTRAINT ' || quote_ident(v_conname);
  END LOOP;

  ALTER TABLE group_cart_items
    ADD CONSTRAINT group_cart_items_menu_item_id_fkey
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
END $$;
