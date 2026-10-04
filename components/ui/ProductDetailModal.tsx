'use client';

/**
 * ProductDetailModal
 *
 * Rich product detail popup for menu items.
 *
 * Layout:
 * - Mobile (<640px): bottom sheet, slides up, max 90dvh, scrollable content,
 *   sticky bottom bar, safe-area inset respected.
 * - Tablet/Desktop (>=640px): centered modal max-w-2xl, two-column on wide screens.
 *
 * Features:
 * - Swipeable photo carousel (multiple images) or single image or placeholder
 * - Badge (Best Seller / New / Habis), name, base price
 * - Diet & allergen chips
 * - Description, ingredients (hidden if empty)
 * - Prep time & calories info row (hidden if empty)
 * - Options/add-ons: single-choice or multiple-choice, required validation
 * - Notes textarea with quick-tap chips (reusing getSuggestedChips)
 * - "Goes well with" pairing items
 * - Sticky bottom bar: quantity selector + live total CTA
 * - Sold out: disabled UI + "Stok Habis" button
 * - Accessibility: role=dialog, aria-modal, focus trap, Esc dismiss, scroll lock
 * - Respects prefers-reduced-motion
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
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
  onClose: () => void;
  /** Called when user confirms adding to cart */
  onAddToCart: (payload: {
    item: BranchMenuItem;
    note: string;
    quantity: number;
    selectedOptions: SelectedOption[];
  }) => void;
  /** Called when user quick-adds a pairing item without options/notes */
  onAddPairingItem?: (item: BranchMenuItem) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID');
}

function formatPriceFull(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
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

function PhotoCarousel({ images, itemName, soldOut }: {
  images: string[];
  itemName: string;
  soldOut: boolean;
}) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => setIndex(0), [images]);

  if (images.length === 0) {
    return (
      <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-72 bg-coffee-50 flex flex-col items-center justify-center gap-2 text-coffee-200 flex-shrink-0">
        <UtensilsCrossed className="w-14 h-14" />
        <span className="text-xs text-coffee-300 font-medium">Belum ada foto</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-auto sm:h-72 overflow-hidden flex-shrink-0 bg-coffee-50">
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={index}
          src={images[index]}
          alt={`${itemName} — foto ${index + 1}`}
          className={`absolute inset-0 w-full h-full object-cover ${soldOut ? 'grayscale opacity-60' : ''}`}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 30 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          loading="eager"
          draggable={false}
        />
      </AnimatePresence>

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
                className={`rounded-full transition-all ${i === index ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
          <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm text-white text-xs font-semibold px-2 py-0.5 rounded-full z-10">
            {index + 1}/{images.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Option Group Selector ────────────────────────────────────────────────────

function OptionGroupSelector({
  group,
  selected,
  onChange,
  hasError,
  disabled,
}: {
  group: ItemOptionGroup;
  selected: SelectedOption[];
  onChange: (newSelected: SelectedOption[]) => void;
  hasError: boolean;
  disabled: boolean;
}) {
  const groupSelections = selected.filter((s) => s.groupId === group.id);
  const isSingleChosen = (choiceId: string) => groupSelections.some((s) => s.choiceId === choiceId);

  function handleSingleSelect(choiceId: string, choiceName: string, price: number) {
    const withoutGroup = selected.filter((s) => s.groupId !== group.id);
    // Toggle off if already selected
    if (isSingleChosen(choiceId)) {
      onChange(withoutGroup);
    } else {
      onChange([...withoutGroup, { groupId: group.id, groupName: group.name, choiceId, choiceName, price }]);
    }
  }

  function handleMultiSelect(choiceId: string, choiceName: string, price: number) {
    if (isSingleChosen(choiceId)) {
      onChange(selected.filter((s) => !(s.groupId === group.id && s.choiceId === choiceId)));
    } else {
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
          <AlertTriangle className="w-3 h-3" />
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductDetailModal({
  item,
  isOpen,
  allItems = [],
  isPaused = false,
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

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
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
      // Scroll to options section
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
  const canOrder = !isSoldOut && !isPaused;

  const mobileSheetVariants = {
    hidden: { y: '100%', opacity: shouldReduceMotion ? 0 : 0.9 },
    visible: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  };

  const desktopModalVariants = {
    hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : 10 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : 10 },
  };

  const springTransition: Transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, damping: 28, stiffness: 300 };

  if (!isOpen || !item) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
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

        {/* Mobile bottom sheet */}
        <motion.div
          key="sheet-mobile"
          ref={dialogRef}
          variants={mobileSheetVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={springTransition}
          className="sm:hidden relative w-full bg-white rounded-t-3xl shadow-2xl z-10 flex flex-col"
          style={{ maxHeight: '90dvh' }}
        >
          <MobileContent
            item={item}
            images={images}
            optionGroups={optionGroups}
            selectedOptions={selectedOptions}
            setSelectedOptions={setSelectedOptions}
            validationErrors={validationErrors}
            note={note}
            setNote={setNote}
            chips={chips}
            quantity={quantity}
            setQuantity={setQuantity}
            lineTotal={lineTotal}
            pairingItems={pairingItems}
            isSoldOut={isSoldOut}
            canOrder={canOrder}
            isPaused={isPaused}
            onClose={onClose}
            onAddToCart={handleAddToCart}
            onAddPairingItem={onAddPairingItem}
            dialogRef={dialogRef}
          />
        </motion.div>

        {/* Desktop / Tablet centered modal */}
        <motion.div
          key="modal-desktop"
          variants={desktopModalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={springTransition}
          className="hidden sm:flex relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl z-10 flex-col overflow-hidden mx-4"
          style={{ maxHeight: '90dvh' }}
        >
          <DesktopContent
            item={item}
            images={images}
            optionGroups={optionGroups}
            selectedOptions={selectedOptions}
            setSelectedOptions={setSelectedOptions}
            validationErrors={validationErrors}
            note={note}
            setNote={setNote}
            chips={chips}
            quantity={quantity}
            setQuantity={setQuantity}
            lineTotal={lineTotal}
            pairingItems={pairingItems}
            isSoldOut={isSoldOut}
            canOrder={canOrder}
            isPaused={isPaused}
            onClose={onClose}
            onAddToCart={handleAddToCart}
            onAddPairingItem={onAddPairingItem}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Shared inner content props ───────────────────────────────────────────────

type InnerContentProps = {
  item: BranchMenuItem;
  images: string[];
  optionGroups: ItemOptionGroup[];
  selectedOptions: SelectedOption[];
  setSelectedOptions: (v: SelectedOption[]) => void;
  validationErrors: string[];
  note: string;
  setNote: (v: string) => void;
  chips: string[];
  quantity: number;
  setQuantity: (v: number) => void;
  lineTotal: number;
  pairingItems: BranchMenuItem[];
  isSoldOut: boolean;
  canOrder: boolean;
  isPaused: boolean;
  onClose: () => void;
  onAddToCart: () => void;
  onAddPairingItem?: (item: BranchMenuItem) => void;
  dialogRef?: React.RefObject<HTMLElement>;
};

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
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
            item.badge === 'Bestseller' ? 'bg-coffee-700 text-cream' : 'bg-sand-300 text-coffee-900'
          }`}>
            {item.badge === 'Bestseller' ? '★ ' : '✦ '}{item.badge}
          </span>
        )}
      </div>

      {/* Name + price */}
      <div className="flex items-start justify-between gap-3">
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
  const hasPrepTime = !!item.prep_time_minutes;
  const hasCalories = !!item.portion_calories;
  if (!hasPrepTime && !hasCalories) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-charcoal/55 font-medium">
      {hasPrepTime && (
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-coffee-400" />
          ~{item.prep_time_minutes} menit
        </span>
      )}
      {hasCalories && (
        <span className="flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-coffee-400" />
          {item.portion_calories}
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
  isSoldOut,
}: {
  optionGroups: ItemOptionGroup[];
  selectedOptions: SelectedOption[];
  setSelectedOptions: (v: SelectedOption[]) => void;
  validationErrors: string[];
  isSoldOut: boolean;
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
          disabled={isSoldOut}
        />
      ))}
    </div>
  );
}

function NotesSection({
  note,
  setNote,
  chips,
  isSoldOut,
}: {
  note: string;
  setNote: (v: string) => void;
  chips: string[];
  isSoldOut: boolean;
}) {
  function handleChipClick(chip: string) {
    const current = note.trim();
    if (!current) { setNote(chip); return; }
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
              disabled={isSoldOut}
              onClick={() => handleChipClick(chip)}
              className={`text-xs font-semibold px-3 py-1.5 min-h-[36px] rounded-full transition-all active:scale-95 border ${
                active
                  ? 'bg-coffee-700 text-cream border-coffee-700 shadow-sm'
                  : 'bg-coffee-50/80 text-charcoal/70 border-coffee-100 hover:bg-coffee-100 hover:text-coffee-900'
              } ${isSoldOut ? 'opacity-40 cursor-not-allowed' : ''}`}
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
          disabled={isSoldOut}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_ITEM_NOTE_LENGTH))}
          placeholder="Contoh: less sugar, no vegetables, extra pedas…"
          className="w-full resize-none px-3.5 py-2.5 rounded-xl bg-coffee-50/50 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/35 focus:outline-none focus:border-coffee-400 focus:bg-white transition-colors disabled:opacity-40"
        />
        <div className="absolute bottom-2 right-2.5 flex items-center gap-2">
          {note.length > 0 && !isSoldOut && (
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
        {pairingItems.slice(0, 4).map((pairing) => (
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
              >
                {pairing.sold_out ? 'Habis' : '+ Tambah'}
              </button>
            </div>
          </div>
        ))}
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
      <div className={`flex items-center gap-2 bg-coffee-50 rounded-xl p-1 border border-coffee-100/60 flex-shrink-0 ${!canOrder ? 'opacity-40' : ''}`}>
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
        className={`flex-1 min-h-[48px] py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
          isSoldOut
            ? 'bg-charcoal/10 text-charcoal/40 cursor-not-allowed'
            : isPaused
            ? 'bg-charcoal/10 text-charcoal/40 cursor-not-allowed'
            : 'bg-coffee-700 hover:bg-coffee-800 text-cream shadow-sm'
        }`}
        aria-label={
          isSoldOut
            ? 'Stok habis'
            : `Tambah ke pesanan — ${formatPriceFull(lineTotal)}`
        }
      >
        {isSoldOut ? (
          <span>Stok Habis</span>
        ) : isPaused ? (
          <span>Pemesanan Dijeda</span>
        ) : (
          <>
            <ShoppingCart className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Tambah ke Pesanan — {formatPriceFull(lineTotal)}</span>
          </>
        )}
      </button>
    </div>
  );
}

// ─── Mobile Content ───────────────────────────────────────────────────────────

function MobileContent(props: InnerContentProps & { dialogRef?: React.RefObject<HTMLElement> }) {
  const { item, images, onClose, isSoldOut, ...rest } = props;
  return (
    <>
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-coffee-200" aria-hidden="true" />
      </div>

      {/* Header: close button + image */}
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-3 z-20 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
        <PhotoCarousel images={images} itemName={item.name} soldOut={isSoldOut} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        <BadgesAndMeta item={item} isSoldOut={isSoldOut} />
        <DietAllergenChips item={item} />
        <InfoRow item={item} />
        <DescriptionIngredients item={item} />
        <OptionsSection
          optionGroups={rest.optionGroups}
          selectedOptions={rest.selectedOptions}
          setSelectedOptions={rest.setSelectedOptions}
          validationErrors={rest.validationErrors}
          isSoldOut={isSoldOut}
        />
        <NotesSection
          note={rest.note}
          setNote={rest.setNote}
          chips={rest.chips}
          isSoldOut={isSoldOut}
        />
        <PairingsSection
          pairingItems={rest.pairingItems}
          onAddPairingItem={rest.onAddPairingItem}
        />
        {/* Safe area spacer */}
        <div style={{ height: '1px' }} />
      </div>

      {/* Sticky bottom bar */}
      <StickyBottomBar
        item={item}
        quantity={rest.quantity}
        setQuantity={rest.setQuantity}
        lineTotal={rest.lineTotal}
        isSoldOut={isSoldOut}
        canOrder={rest.canOrder}
        isPaused={rest.isPaused}
        onAddToCart={rest.onAddToCart}
      />
    </>
  );
}

// ─── Desktop Content ──────────────────────────────────────────────────────────

function DesktopContent(props: InnerContentProps) {
  const { item, images, onClose, isSoldOut } = props;
  return (
    <>
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-xl bg-coffee-50 hover:bg-coffee-100 text-charcoal/60 flex items-center justify-center transition-colors"
        aria-label="Tutup"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex flex-col overflow-hidden flex-1">
        {/* Two columns on wide, stacked on medium */}
        <div className="flex flex-col lg:flex-row overflow-hidden flex-1">
          {/* Left: photo */}
          <div className="lg:w-72 xl:w-80 flex-shrink-0">
            <PhotoCarousel images={images} itemName={item.name} soldOut={isSoldOut} />
          </div>

          {/* Right: scrollable detail */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-4">
              <BadgesAndMeta item={item} isSoldOut={isSoldOut} />
              <DietAllergenChips item={item} />
              <InfoRow item={item} />
              <DescriptionIngredients item={item} />
              <OptionsSection
                optionGroups={props.optionGroups}
                selectedOptions={props.selectedOptions}
                setSelectedOptions={props.setSelectedOptions}
                validationErrors={props.validationErrors}
                isSoldOut={isSoldOut}
              />
              <NotesSection
                note={props.note}
                setNote={props.setNote}
                chips={props.chips}
                isSoldOut={isSoldOut}
              />
              <PairingsSection
                pairingItems={props.pairingItems}
                onAddPairingItem={props.onAddPairingItem}
              />
            </div>

            {/* Bottom bar inside the modal */}
            <StickyBottomBar
              item={item}
              quantity={props.quantity}
              setQuantity={props.setQuantity}
              lineTotal={props.lineTotal}
              isSoldOut={isSoldOut}
              canOrder={props.canOrder}
              isPaused={props.isPaused}
              onAddToCart={props.onAddToCart}
            />
          </div>
        </div>
      </div>
    </>
  );
}
