'use client';

/**
 * ProductDetailModal
 *
 * Rich product detail popup for menu items.
 *
 * Layout:
 * - Single responsive dialog layout that transitions between mobile bottom sheet
 *   and desktop centered 2-column modal via responsive classes.
 * - Single ref (dialogRef), single set of IDs, images load once.
 * - Focus trap, Esc dismiss, and scroll-to-missing-option work on all viewports.
 *
 * Features:
 * - Swipeable photo carousel (drag="x") with counter at top-left.
 * - Swipe-down-to-close on mobile sheet handle/header.
 * - Height capped by viewport (max-h-[35dvh] on short screens) so scrollable
 *   area and sticky bottom bar stay visible in landscape (667x375, 844x390).
 * - Shortened CTA button ("Tambah - Rp 125.000") that fits at 320px width.
 * - Options, notes, and quantity disabled when paused or sold out.
 * - Exit animation preserved with mounted AnimatePresence wrapper.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import {
  X,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  Clock,
  Flame,
  Leaf,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  ShoppingCart,
} from 'lucide-react';
import {
  type ItemOptionGroup,
  type SelectedOption,
  getSuggestedChips,
  normalizeNote,
  MAX_ITEM_NOTE_LENGTH,
  calculateOptionsTotal,
  validateRequiredOptions,
} from '@/lib/item-options';
import type { BranchMenuItem } from '@/lib/menu-availability';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductDetailModalProps = {
  item: BranchMenuItem | null;
  isOpen: boolean;
  /** All loaded menu items — used for "Goes well with" pairings */
  allItems?: BranchMenuItem[];
  isPaused?: boolean;
  isGroupMode?: boolean;
  onClose: () => void;
  /** Called when user confirms adding to cart */
  onAddToCart: (payload: {
    item: BranchMenuItem;
    note: string;
    quantity: number;
    selectedOptions: SelectedOption[];
  }) => void;
  /** Called when user quick-adds a pairing item */
  onAddPairingItem?: (item: BranchMenuItem) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID');
}

function formatPriceFull(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID');
}

const DIET_ICONS: Record<string, React.ReactNode> = {
  halal: <ShieldCheck className="w-3 h-3" />,
  vegetarian: <Leaf className="w-3 h-3" />,
  vegan: <Leaf className="w-3 h-3" />,
  spicy: <Flame className="w-3 h-3" />,
  pedas: <Flame className="w-3 h-3" />,
};

function getDietIcon(tag: string) {
  return DIET_ICONS[tag.toLowerCase()] ?? <ShieldCheck className="w-3 h-3" />;
}

// ─── Focus Trap Hook ──────────────────────────────────────────────────────────

function useFocusTrap(isOpen: boolean, containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const container = containerRef.current;
    const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));

    if (focusables.length === 0) return;
    // Focus first focusable on open
    setTimeout(() => focusables[0]?.focus(), 50);

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const current = document.activeElement as HTMLElement | null;
      const currentIndex = focusables.indexOf(current!);
      if (e.shiftKey) {
        if (currentIndex <= 0) {
          e.preventDefault();
          focusables[focusables.length - 1]?.focus();
        }
      } else {
        if (currentIndex === focusables.length - 1) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, containerRef]);
}

// ─── Photo Carousel ───────────────────────────────────────────────────────────

function PhotoCarousel({
  images,
  itemName,
  soldOut,
}: {
  images: string[];
  itemName: string;
  soldOut: boolean;
}) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  const imagesKey = images.join('|');
  useEffect(() => setIndex(0), [imagesKey]);

  if (images.length === 0) {
    return (
      <div className="w-full h-44 sm:h-56 lg:h-full min-h-[160px] bg-coffee-50 flex flex-col items-center justify-center gap-2 text-coffee-200 flex-shrink-0">
        <UtensilsCrossed className="w-12 h-12" />
        <span className="text-xs text-coffee-300 font-medium">Belum ada foto</span>
      </div>
    );
  }

  return (
    <motion.div
      className="relative w-full h-48 sm:h-64 lg:h-full min-h-[160px] max-h-[35dvh] lg:max-h-none overflow-hidden flex-shrink-0 bg-coffee-50 touch-pan-y"
      drag={images.length > 1 ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={(_e, info) => {
        if (images.length <= 1) return;
        const threshold = 40;
        if (info.offset.x < -threshold) {
          next();
        } else if (info.offset.x > threshold) {
          prev();
        }
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={index}
          src={images[index]}
          alt={`${itemName} — foto ${index + 1}`}
          className={`absolute inset-0 w-full h-full object-cover select-none ${soldOut ? 'grayscale opacity-60' : ''}`}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 25 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -25 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          loading="eager"
          draggable={false}
        />
      </AnimatePresence>

      {/* Top-left photo counter */}
      {images.length > 1 && (
        <div className="absolute top-2.5 left-2.5 bg-black/40 backdrop-blur-sm text-white text-xs font-semibold px-2 py-0.5 rounded-full z-10 select-none">
          {index + 1}/{images.length}
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Foto sebelumnya"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Foto berikutnya"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Lihat foto ${i + 1}`}
                className={`rounded-full transition-all ${
                  i === index ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── Option Group Selector ────────────────────────────────────────────────────

function OptionGroupSelector({
  group,
  selected,
  onChange,
  hasError,
  disabled,
  onErrorClear,
}: {
  group: ItemOptionGroup;
  selected: SelectedOption[];
  onChange: (newSelected: SelectedOption[]) => void;
  hasError: boolean;
  disabled: boolean;
  onErrorClear?: (groupName: string) => void;
}) {
  const groupSelections = selected.filter((s) => s.groupId === group.id);
  const isSingleChosen = (choiceId: string) => groupSelections.some((s) => s.choiceId === choiceId);

  function handleSingleSelect(choiceId: string, choiceName: string, price: number) {
    if (disabled) return;
    const withoutGroup = selected.filter((s) => s.groupId !== group.id);
    if (isSingleChosen(choiceId)) {
      onChange(withoutGroup);
    } else {
      onErrorClear?.(group.name);
      onChange([...withoutGroup, { groupId: group.id, groupName: group.name, choiceId, choiceName, price }]);
    }
  }

  function handleMultiSelect(choiceId: string, choiceName: string, price: number) {
    if (disabled) return;
    if (isSingleChosen(choiceId)) {
      onChange(selected.filter((s) => !(s.groupId === group.id && s.choiceId === choiceId)));
    } else {
      onErrorClear?.(group.name);
      onChange([...selected, { groupId: group.id, groupName: group.name, choiceId, choiceName, price }]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-coffee-900 flex items-center gap-1.5">
          {group.name}
          {group.required && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-coffee-100 text-coffee-700 rounded-full">
              Wajib
            </span>
          )}
        </span>
        {group.type === 'multiple' && (
          <span className="text-[10px] text-charcoal/45 font-medium">Pilih beberapa</span>
        )}
      </div>

      {hasError && (
        <p className="text-xs text-red-600 font-semibold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          Pilih salah satu opsi untuk {group.name}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {group.choices.map((choice) => {
          const isActive = isSingleChosen(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() =>
                group.type === 'single'
                  ? handleSingleSelect(choice.id, choice.name, choice.price)
                  : handleMultiSelect(choice.id, choice.name, choice.price)
              }
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border ${
                isActive
                  ? 'bg-coffee-700 text-cream border-coffee-700 shadow-sm'
                  : 'bg-coffee-50/80 text-charcoal/80 border-coffee-100 hover:bg-coffee-100 hover:text-coffee-900'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              aria-pressed={isActive}
            >
              <span>{choice.name}</span>
              {choice.price > 0 && (
                <span className={`text-[10px] font-medium ${isActive ? 'text-cream/80' : 'text-coffee-600'}`}>
                  + {formatPrice(choice.price)}
                </span>
              )}
              {choice.price === 0 && (
                <span className={`text-[10px] font-medium ${isActive ? 'text-cream/60' : 'text-charcoal/35'}`}>
                  Gratis
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail Content Sections ──────────────────────────────────────────────────

function BadgesAndMeta({ item, isSoldOut }: { item: BranchMenuItem; isSoldOut: boolean }) {
  return (
    <div className="space-y-2">
      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        {isSoldOut && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-charcoal/85 text-white">
            Stok Habis
          </span>
        )}
        {!isSoldOut && item.badge && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
              item.badge === 'Bestseller' ? 'bg-coffee-700 text-cream' : 'bg-sand-300 text-coffee-900'
            }`}
          >
            {item.badge === 'Bestseller' ? '★ ' : '✦ '}
            {item.badge}
          </span>
        )}
      </div>

      {/* Name + price row: reserved right padding on sm+ to prevent close button collision */}
      <div className="flex items-start justify-between gap-3 sm:pr-12">
        <h2 className="text-xl font-bold text-coffee-900 leading-tight">{item.name}</h2>
        <span className="text-xl font-extrabold text-coffee-700 flex-shrink-0 mt-0.5">
          {formatPriceFull(item.price)}
        </span>
      </div>
    </div>
  );
}

function DietAllergenChips({ item }: { item: BranchMenuItem }) {
  const dietTags = item.diet_tags?.filter(Boolean) ?? [];
  const allergenTags = item.allergen_tags?.filter(Boolean) ?? [];
  if (dietTags.length === 0 && allergenTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {dietTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200/70"
        >
          {getDietIcon(tag)}
          {tag}
        </span>
      ))}
      {allergenTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200/70"
        >
          <AlertTriangle className="w-3 h-3" />
          {tag}
        </span>
      ))}
    </div>
  );
}

function InfoRow({ item }: { item: BranchMenuItem }) {
  const hasPrep = Boolean(item.prep_time_minutes);
  const hasCal = Boolean(item.portion_calories);
  if (!hasPrep && !hasCal) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-charcoal/60 bg-coffee-50/60 rounded-xl px-3 py-2 border border-coffee-100/60">
      {hasPrep && (
        <span className="flex items-center gap-1 font-medium">
          <Clock className="w-3.5 h-3.5 text-coffee-600" />
          {item.prep_time_minutes} menit penyajian
        </span>
      )}
      {hasPrep && hasCal && <span className="text-coffee-200">•</span>}
      {hasCal && (
        <span className="flex items-center gap-1 font-medium">
          <Flame className="w-3.5 h-3.5 text-amber-600" />
          {item.portion_calories} kkal
        </span>
      )}
    </div>
  );
}

function DescriptionIngredients({ item }: { item: BranchMenuItem }) {
  return (
    <div className="space-y-3">
      {item.description && (
        <p className="text-sm text-charcoal/70 leading-relaxed">{item.description}</p>
      )}
      {item.ingredients && (
        <div>
          <p className="text-xs font-bold text-coffee-900 mb-1 flex items-center gap-1.5">
            <UtensilsCrossed className="w-3.5 h-3.5 text-coffee-500" />
            Bahan-bahan
          </p>
          <p className="text-xs text-charcoal/60 leading-relaxed">{item.ingredients}</p>
        </div>
      )}
    </div>
  );
}

function OptionsSection({
  optionGroups,
  selectedOptions,
  setSelectedOptions,
  validationErrors,
  setValidationErrors,
  disabled,
}: {
  optionGroups: ItemOptionGroup[];
  selectedOptions: SelectedOption[];
  setSelectedOptions: (v: SelectedOption[]) => void;
  validationErrors: string[];
  setValidationErrors: (v: string[]) => void;
  disabled: boolean;
}) {
  if (optionGroups.length === 0) return null;

  return (
    <div className="space-y-4" data-options-section>
      <h3 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">Pilihan & Tambahan</h3>
      {optionGroups.map((group) => (
        <OptionGroupSelector
          key={group.id}
          group={group}
          selected={selectedOptions}
          onChange={setSelectedOptions}
          hasError={validationErrors.includes(group.name)}
          disabled={disabled}
          onErrorClear={(name) => setValidationErrors(validationErrors.filter((e) => e !== name))}
        />
      ))}
    </div>
  );
}

function NotesSection({
  note,
  setNote,
  chips,
  disabled,
}: {
  note: string;
  setNote: (v: string) => void;
  chips: string[];
  disabled: boolean;
}) {
  function handleChipClick(chip: string) {
    if (disabled) return;
    const current = note.trim();
    if (!current) {
      setNote(chip);
      return;
    }
    const parts = current.split(',').map((p) => p.trim()).filter(Boolean);
    const existingIdx = parts.findIndex((p) => p.toLowerCase() === chip.toLowerCase());
    if (existingIdx >= 0) {
      parts.splice(existingIdx, 1);
      setNote(parts.join(', '));
    } else {
      const next = [...parts, chip].join(', ');
      if (next.length <= MAX_ITEM_NOTE_LENGTH) setNote(next);
    }
  }

  const isChipActive = (chip: string) =>
    note.split(',').map((p) => p.trim().toLowerCase()).includes(chip.toLowerCase());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-coffee-900">
        <Sparkles className="w-3.5 h-3.5 text-coffee-500" />
        Catatan untuk Barista / Dapur
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const active = isChipActive(chip);
          return (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              onClick={() => handleChipClick(chip)}
              className={`text-xs font-semibold px-3 py-1.5 min-h-[36px] rounded-full transition-all active:scale-95 border ${
                active
                  ? 'bg-coffee-700 text-cream border-coffee-700 shadow-sm'
                  : 'bg-coffee-50/80 text-charcoal/70 border-coffee-100 hover:bg-coffee-100 hover:text-coffee-900'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              aria-pressed={active}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Note textarea */}
      <div className="relative">
        <textarea
          id="product-detail-note"
          rows={3}
          disabled={disabled}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_ITEM_NOTE_LENGTH))}
          placeholder="Contoh: less sugar, no vegetables, extra pedas…"
          className="w-full resize-none px-3.5 py-2.5 rounded-xl bg-coffee-50/50 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/35 focus:outline-none focus:border-coffee-400 focus:bg-white transition-colors disabled:opacity-40"
        />
        <div className="absolute bottom-2 right-2.5 flex items-center gap-2">
          {note.length > 0 && !disabled && (
            <button
              type="button"
              onClick={() => setNote('')}
              className="text-[10px] text-charcoal/40 hover:text-charcoal/70 px-1 py-0.5 rounded"
            >
              Hapus
            </button>
          )}
          <span className="text-[10px] font-mono text-charcoal/35">
            {note.length}/{MAX_ITEM_NOTE_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}

function PairingsSection({
  pairingItems,
  onAddPairingItem,
}: {
  pairingItems: BranchMenuItem[];
  onAddPairingItem?: (item: BranchMenuItem) => void;
}) {
  if (pairingItems.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">Cocok Dipadukan</h3>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {pairingItems.slice(0, 4).map((pairing) => {
          const rawOptions = Array.isArray(pairing.options) ? (pairing.options as ItemOptionGroup[]) : [];
          const hasRequired = rawOptions.some((g) => g.required);

          return (
            <div
              key={pairing.id}
              className="flex-shrink-0 w-28 bg-coffee-50 rounded-2xl overflow-hidden border border-coffee-100/80"
            >
              <div className="aspect-square bg-coffee-100/50 overflow-hidden">
                {pairing.image_url ? (
                  <img
                    src={pairing.image_url}
                    alt={pairing.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-coffee-200">
                    <UtensilsCrossed className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="text-[11px] font-bold text-coffee-900 leading-tight line-clamp-2 mb-1">{pairing.name}</p>
                <p className="text-[10px] text-coffee-600 font-semibold mb-1.5">{formatPrice(pairing.price)}</p>
                <button
                  type="button"
                  disabled={pairing.sold_out}
                  onClick={() => !pairing.sold_out && onAddPairingItem?.(pairing)}
                  className={`w-full py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    pairing.sold_out
                      ? 'bg-charcoal/10 text-charcoal/40 cursor-not-allowed'
                      : 'bg-coffee-700 text-cream hover:bg-coffee-800 active:scale-95'
                  }`}
                  aria-label={
                    pairing.sold_out
                      ? `${pairing.name}, habis`
                      : hasRequired
                      ? `Pilih opsi untuk ${pairing.name}`
                      : `Tambah ${pairing.name}`
                  }
                >
                  {pairing.sold_out ? 'Habis' : '+ Tambah'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StickyBottomBar({
  item,
  quantity,
  setQuantity,
  lineTotal,
  isSoldOut,
  canOrder,
  isPaused,
  onAddToCart,
}: {
  item: BranchMenuItem;
  quantity: number;
  setQuantity: (v: number) => void;
  lineTotal: number;
  isSoldOut: boolean;
  canOrder: boolean;
  isPaused: boolean;
  onAddToCart: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 border-t border-coffee-100 bg-white/95 backdrop-blur-sm px-4 sm:px-5 py-3 flex items-center gap-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Quantity selector */}
      <div
        className={`flex items-center gap-2 bg-coffee-50 rounded-xl p-1 border border-coffee-100/60 flex-shrink-0 ${
          !canOrder ? 'opacity-40' : ''
        }`}
      >
        <button
          type="button"
          disabled={!canOrder || quantity <= 1}
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="w-9 h-9 rounded-lg bg-white text-coffee-800 flex items-center justify-center hover:bg-coffee-100 transition-colors disabled:opacity-40"
          aria-label="Kurangi jumlah"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-extrabold text-coffee-900 w-6 text-center text-sm font-mono tabular-nums">
          {quantity}
        </span>
        <button
          type="button"
          disabled={!canOrder || quantity >= 99}
          onClick={() => setQuantity(Math.min(99, quantity + 1))}
          className="w-9 h-9 rounded-lg bg-white text-coffee-800 flex items-center justify-center hover:bg-coffee-100 transition-colors disabled:opacity-40"
          aria-label="Tambah jumlah"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Main CTA */}
      <button
        type="button"
        disabled={!canOrder}
        onClick={onAddToCart}
        className={`flex-1 min-h-[48px] py-3 px-3 sm:px-4 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
          isSoldOut || isPaused || !canOrder
            ? 'bg-charcoal/10 text-charcoal/40 cursor-not-allowed'
            : 'bg-coffee-700 hover:bg-coffee-800 text-cream shadow-sm'
        }`}
        aria-label={
          isSoldOut
            ? 'Stok habis'
            : isPaused
            ? 'Pemesanan dijeda'
            : !canOrder
            ? 'Pemesanan tidak tersedia'
            : `Tambah - ${formatPrice(lineTotal)}`
        }
      >
        {isSoldOut ? (
          <span>Stok Habis</span>
        ) : isPaused ? (
          <span>Pemesanan Dijeda</span>
        ) : !canOrder ? (
          <span>Tidak Tersedia</span>
        ) : (
          <>
            <ShoppingCart className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Tambah - {formatPrice(lineTotal)}</span>
          </>
        )}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductDetailModal({
  item,
  isOpen,
  allItems = [],
  isPaused = false,
  isGroupMode = false,
  onClose,
  onAddToCart,
  onAddPairingItem,
}: ProductDetailModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [note, setNote] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useFocusTrap(isOpen, dialogRef);

  // Reset state on open/item change
  useEffect(() => {
    if (isOpen && item) {
      setQuantity(1);
      setSelectedOptions([]);
      setNote('');
      setValidationErrors([]);
    }
  }, [isOpen, item?.id]);

  // Save/restore focus
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    } else {
      setTimeout(() => previouslyFocusedRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Ref-counted scroll lock with scrollbar width compensation
  useEffect(() => {
    if (!isOpen) return;
    const prev = parseInt(document.body.dataset.scrollLockCount ?? '0', 10);
    const count = prev + 1;
    document.body.dataset.scrollLockCount = String(count);

    if (count === 1) {
      const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    }
    return () => {
      const current = parseInt(document.body.dataset.scrollLockCount ?? '1', 10);
      const next = Math.max(0, current - 1);
      document.body.dataset.scrollLockCount = String(next);
      if (next === 0) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    };
  }, [isOpen]);

  // Esc key dismiss
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleAddToCart = useCallback(() => {
    if (!item) return;
    const optionGroups: ItemOptionGroup[] = Array.isArray(item.options) ? item.options as ItemOptionGroup[] : [];
    const { valid, missingGroups } = validateRequiredOptions(optionGroups, selectedOptions);
    if (!valid) {
      setValidationErrors(missingGroups);
      // Scroll to options section inside dialogRef
      dialogRef.current?.querySelector('[data-options-section]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setValidationErrors([]);
    onAddToCart({ item, note: normalizeNote(note), quantity, selectedOptions });
    onClose();
  }, [item, note, quantity, selectedOptions, onAddToCart, onClose]);

  const chips = getSuggestedChips(item?.category);
  const optionGroups: ItemOptionGroup[] = (item && Array.isArray(item.options)) ? item.options as ItemOptionGroup[] : [];
  const optionsTotal = calculateOptionsTotal(selectedOptions);
  const lineTotal = item ? (item.price + optionsTotal) * quantity : 0;

  // Build full image list: image_urls first, fall back to image_url
  const images: string[] = item
    ? [
        ...((item.image_urls && item.image_urls.length > 0) ? item.image_urls : []),
        ...((item.image_url && !(item.image_urls?.includes(item.image_url))) ? [item.image_url] : []),
      ]
    : [];

  // Resolve pairing items
  const pairingItems: BranchMenuItem[] = item?.pairing_item_ids?.length
    ? item.pairing_item_ids
        .map((id) => allItems.find((m) => m.id === id))
        .filter((m): m is BranchMenuItem => !!m)
    : [];

  const isSoldOut = item?.sold_out ?? false;
  const isGroupBlocked = isGroupMode && optionGroups.length > 0;
  const canOrder = !isSoldOut && !isPaused && !isGroupBlocked;

  const dialogVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 24, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1 },
    exit: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 24, scale: 0.98 },
  };

  const springTransition: Transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring', damping: 28, stiffness: 300 };

  return (
    <AnimatePresence>
      {isOpen && item && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          aria-modal="true"
          role="dialog"
          aria-label={item.name}
        >
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Single responsive dialog container */}
          <motion.div
            key="dialog-container"
            ref={dialogRef}
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={springTransition}
            className="relative w-full max-h-[92dvh] sm:max-h-[90dvh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl z-10 flex flex-col overflow-hidden sm:max-w-2xl lg:max-w-4xl"
          >
            {/* Mobile swipe-down drag handle */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 60 || info.velocity.y > 300) {
                  onClose();
                }
              }}
              className="cursor-grab active:cursor-grabbing touch-none flex justify-center pt-3 pb-1 flex-shrink-0 sm:hidden z-20"
              aria-label="Tarik ke bawah untuk menutup"
            >
              <div className="w-10 h-1 rounded-full bg-coffee-200" aria-hidden="true" />
            </motion.div>

            {/* Close button: absolute top-right, never overlapping price */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2.5 right-3 sm:top-4 sm:right-4 z-30 w-8 h-8 sm:w-9 sm:h-9 rounded-full sm:rounded-xl bg-black/30 sm:bg-coffee-50 sm:hover:bg-coffee-100 text-white sm:text-charcoal/60 flex items-center justify-center backdrop-blur-sm sm:backdrop-blur-none transition-colors"
              aria-label="Tutup"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Body: stacked on mobile, 2-column on desktop */}
            <div className="flex flex-col lg:flex-row overflow-hidden flex-1 min-h-0">
              {/* Photo column */}
              <div className="relative flex-shrink-0 w-full lg:w-80 xl:w-96 flex flex-col bg-coffee-50 max-h-[35dvh] lg:max-h-none lg:h-full">
                <PhotoCarousel images={images} itemName={item.name} soldOut={isSoldOut} />
              </div>

              {/* Detail content column */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
                  <BadgesAndMeta item={item} isSoldOut={isSoldOut} />
                  <DietAllergenChips item={item} />
                  <InfoRow item={item} />
                  <DescriptionIngredients item={item} />

                  {isGroupBlocked && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>Pesan Bareng belum mendukung menu dengan opsi tambahan. Silakan pesan menu ini secara terpisah.</span>
                    </div>
                  )}

                  <OptionsSection
                    optionGroups={optionGroups}
                    selectedOptions={selectedOptions}
                    setSelectedOptions={setSelectedOptions}
                    validationErrors={validationErrors}
                    setValidationErrors={setValidationErrors}
                    disabled={isSoldOut || isPaused}
                  />

                  <NotesSection
                    note={note}
                    setNote={setNote}
                    chips={chips}
                    disabled={isSoldOut || isPaused}
                  />

                  <PairingsSection
                    pairingItems={pairingItems}
                    onAddPairingItem={onAddPairingItem}
                  />

                  <div style={{ height: '1px' }} />
                </div>

                {/* Sticky bottom bar */}
                <StickyBottomBar
                  item={item}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  lineTotal={lineTotal}
                  isSoldOut={isSoldOut}
                  canOrder={canOrder}
                  isPaused={isPaused}
                  onAddToCart={handleAddToCart}
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
