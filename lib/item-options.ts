/**
 * lib/item-options.ts
 *
 * Shared utilities, types, and constants for per-item notes and customization.
 * Supports quick-tap chips, option groups/choices, and stable line identification
 * for cart items.
 */

export const MAX_ITEM_NOTE_LENGTH = 100;

export type ItemOptionChoice = {
  id: string;
  name: string;
  price: number; // in IDR (>= 0)
};

export type ItemOptionGroup = {
  id: string;
  name: string; // e.g. "Ukuran", "Level Pedas", "Topping Tambahan"
  type: 'single' | 'multiple';
  required: boolean;
  choices: ItemOptionChoice[];
};

export type SelectedOption = {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceName: string;
  price: number;
};

export function normalizeNote(note?: string | null): string {
  if (!note) return '';
  return note.trim().slice(0, MAX_ITEM_NOTE_LENGTH);
}

/**
 * Returns a stable unique identifier for a line item in the cart.
 * Two items with the same menu ID but different options or notes are distinct line items.
 * Backward compatible with existing (id, note) calls.
 */
export function getItemLineKey(
  id: string,
  note?: string | null,
  selectedOptions?: SelectedOption[] | null,
): string {
  const norm = normalizeNote(note).toLowerCase();
  if (!selectedOptions || selectedOptions.length === 0) {
    return `${id}___${norm}`;
  }
  const optsKey = selectedOptions
    .map((o) => `${o.groupId}:${o.choiceId}`)
    .sort()
    .join('|');
  return `${id}___${optsKey}___${norm}`;
}

/**
 * Calculates total additional price for an array of selected options.
 */
export function calculateOptionsTotal(selectedOptions?: SelectedOption[] | null): number {
  if (!selectedOptions || selectedOptions.length === 0) return 0;
  return selectedOptions.reduce((sum, opt) => sum + (Number(opt.price) || 0), 0);
}

/**
 * Validates that all required option groups have at least one choice selected.
 */
export function validateRequiredOptions(
  groups: ItemOptionGroup[] | undefined | null,
  selected: SelectedOption[] | undefined | null,
): { valid: boolean; missingGroups: string[] } {
  if (!groups || groups.length === 0) {
    return { valid: true, missingGroups: [] };
  }

  const selectedGroupIds = new Set((selected || []).map((s) => s.groupId));
  const missingGroups: string[] = [];

  for (const group of groups) {
    if (group.required && !selectedGroupIds.has(group.id)) {
      missingGroups.push(group.name);
    }
  }

  return {
    valid: missingGroups.length === 0,
    missingGroups,
  };
}

/**
 * Formats selected options into a human-readable string summary.
 * e.g. "Ukuran: Regular • Level Pedas: Sedang (+Rp 2.000)"
 */
export function formatItemOptionsSummary(selectedOptions?: SelectedOption[] | null): string {
  if (!selectedOptions || selectedOptions.length === 0) return '';
  return selectedOptions
    .map((opt) => {
      const priceText = opt.price > 0 ? ` (+Rp ${opt.price.toLocaleString('id-ID')})` : '';
      return `${opt.groupName}: ${opt.choiceName}${priceText}`;
    })
    .join(' • ');
}

/**
 * Builds a consolidated note string combining options and user note.
 * Useful for kitchen/barista tickets and backward compatibility with systems
 * that read line.note.
 */
export function buildCombinedNote(
  note?: string | null,
  selectedOptions?: SelectedOption[] | null,
): string {
  const optSummary = formatItemOptionsSummary(selectedOptions);
  const cleanNote = normalizeNote(note);

  if (optSummary && cleanNote) {
    return `[${optSummary}] ${cleanNote}`;
  }
  return optSummary || cleanNote;
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
