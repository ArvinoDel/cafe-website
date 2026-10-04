-- Migration: Add selected_options column to group_cart_items
-- Created: 2026-10-04
-- Purpose: Schema preparation for storing custom selected options in group cart items.

ALTER TABLE IF EXISTS group_cart_items
  ADD COLUMN IF NOT EXISTS selected_options jsonb;

-- Comment for documentation
COMMENT ON COLUMN group_cart_items.selected_options IS 'Array of selected options (groupId, choiceId, etc.) for item customization';
