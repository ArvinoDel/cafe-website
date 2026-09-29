/**
 * lib/item-options.ts
 *
 * Shared utilities, types, and constants for per-item notes and customization.
 * Supports quick-tap chips and stable line identification for cart items.
 */

export const MAX_ITEM_NOTE_LENGTH = 100;

export function normalizeNote(note?: string | null): string {
  if (!note) return '';
  return note.trim().slice(0, MAX_ITEM_NOTE_LENGTH);
}

/**
 * Returns a stable unique identifier for a line item in the cart.
 * Two items with the same menu ID but different notes are distinct line items.
 */
export function getItemLineKey(id: string, note?: string | null): string {
  const norm = normalizeNote(note).toLowerCase();
  return `${id}___${norm}`;
}

/**
 * Suggestion chips tailored to menu categories.
 * All guest-facing text in casual Indonesian.
 */
export function getSuggestedChips(category?: string | null): string[] {
  const cat = (category || '').toLowerCase();
  if (
    cat.includes('kopi') ||
    cat.includes('coffee') ||
    cat.includes('non-kopi') ||
    cat.includes('minum') ||
    cat.includes('drink') ||
    cat.includes('beverage')
  ) {
    return ['Less sugar', 'Normal ice', 'Less ice', 'No ice', 'Hangat', 'Manis sedang', 'Tanpa gula'];
  }

  if (
    cat.includes('makan') ||
    cat.includes('food') ||
    cat.includes('snack') ||
    cat.includes('nasi') ||
    cat.includes('mie')
  ) {
    return ['Pedas', 'Sedang', 'Tidak pedas', 'Pisah sambal', 'Tanpa bawang'];
  }

  // General fallback chips
  return ['Less sugar', 'Normal ice', 'Less ice', 'No ice', 'Hangat', 'Pedas', 'Tidak pedas'];
}
