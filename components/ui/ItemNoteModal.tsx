'use client';

/**
 * ItemNoteModal
 *
 * Modal/bottom sheet for customizing a menu item before adding to cart,
 * or editing the note of an existing item in the cart.
 *
 * Features:
 * - Quick-tap chips (e.g. Less sugar, Normal ice, Hangat, Pedas)
 * - Free text input (max 100 chars)
 * - Quantity selector (when adding)
 * - Indonesian casual tone ("kamu", "Catatan Pesanan")
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, MessageSquare, Sparkles } from 'lucide-react';
import {
  MAX_ITEM_NOTE_LENGTH,
  getSuggestedChips,
  normalizeNote,
} from '@/lib/item-options';

export type ItemNoteModalTarget = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category?: string | null;
  description?: string | null;
};

interface ItemNoteModalProps {
  isOpen: boolean;
  item: ItemNoteModalTarget | null;
  initialNote?: string;
  initialQuantity?: number;
  isEditing?: boolean;
  onClose: () => void;
  onConfirm: (note: string, quantity: number) => void;
}

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

export default function ItemNoteModal({
  isOpen,
  item,
  initialNote = '',
  initialQuantity = 1,
  isEditing = false,
  onClose,
  onConfirm,
}: ItemNoteModalProps) {
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setNote(initialNote || '');
      setQuantity(Math.max(1, initialQuantity || 1));
    }
  }, [isOpen, initialNote, initialQuantity]);

  if (!isOpen || !item) return null;

  const chips = getSuggestedChips(item.category);

  function handleChipClick(chip: string) {
    // If the note already contains the chip, remove it; otherwise append/replace cleanly
    const current = note.trim();
    if (!current) {
      setNote(chip);
      return;
    }

    const parts = current.split(',').map((p) => p.trim()).filter(Boolean);
    const existingIndex = parts.findIndex((p) => p.toLowerCase() === chip.toLowerCase());

    if (existingIndex >= 0) {
      // Toggle off
      parts.splice(existingIndex, 1);
      setNote(parts.join(', '));
    } else {
      // Append if within limit
      const next = [...parts, chip].join(', ');
      if (next.length <= MAX_ITEM_NOTE_LENGTH) {
        setNote(next);
      }
    }
  }

  function isChipActive(chip: string): boolean {
    const parts = note.split(',').map((p) => p.trim().toLowerCase());
    return parts.includes(chip.toLowerCase());
  }

  function handleSave() {
    onConfirm(normalizeNote(note), quantity);
    onClose();
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal Sheet */}
        <motion.div
          initial={{ y: '100%', opacity: 0.8 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-coffee-100">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-12 h-12 rounded-xl bg-coffee-50 overflow-hidden flex-shrink-0 border border-coffee-100/60">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-coffee-400">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-coffee-900 text-base truncate">{item.name}</h3>
                <p className="text-coffee-700 font-extrabold text-sm">{formatPrice(item.price)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-coffee-50 hover:bg-coffee-100 text-charcoal/60 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {/* Quick chips */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-coffee-600" />
                <span>Pilihan Cepat</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((chip) => {
                  const active = isChipActive(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className={`
                        text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95 border
                        ${
                          active
                            ? 'bg-coffee-700 text-cream border-coffee-700 shadow-sm'
                            : 'bg-coffee-50/80 text-charcoal/70 border-coffee-100 hover:bg-coffee-100 hover:text-coffee-900'
                        }
                      `}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note Textarea */}
            <div>
              <label
                htmlFor="item-note-input"
                className="flex items-center justify-between text-xs font-bold text-coffee-900 mb-1.5"
              >
                <span>Catatan untuk Barista / Dapur</span>
                <span className="text-[11px] font-mono text-charcoal/40">
                  {note.length}/{MAX_ITEM_NOTE_LENGTH}
                </span>
              </label>
              <div className="relative">
                <textarea
                  id="item-note-input"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, MAX_ITEM_NOTE_LENGTH))}
                  placeholder="Contoh: Less sugar, es sedikit, jangan terlalu manis…"
                  className="w-full resize-none px-3.5 py-2.5 rounded-xl bg-coffee-50/50 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/35 focus:outline-none focus:border-coffee-400 focus:bg-white transition-colors"
                />
                {note.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setNote('')}
                    className="absolute top-2.5 right-2.5 text-xs text-charcoal/40 hover:text-charcoal/70 px-1.5 py-0.5 rounded"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </div>

            {/* Quantity Selector (only if not editing an existing cart line) */}
            {!isEditing && (
              <div className="flex items-center justify-between pt-2 border-t border-coffee-100/60">
                <span className="text-xs font-bold text-coffee-900">Jumlah Pesanan</span>
                <div className="flex items-center gap-3 bg-coffee-50 rounded-xl p-1 border border-coffee-100/60">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="w-8 h-8 rounded-lg bg-white text-coffee-800 flex items-center justify-center hover:bg-coffee-100 transition-colors disabled:opacity-40"
                    aria-label="Kurangi jumlah"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-extrabold text-coffee-900 w-6 text-center text-sm font-mono">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                    className="w-8 h-8 rounded-lg bg-white text-coffee-800 flex items-center justify-center hover:bg-coffee-100 transition-colors"
                    aria-label="Tambah jumlah"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="p-4 sm:p-5 border-t border-coffee-100 bg-coffee-50/40 flex items-center justify-between gap-3">
            {!isEditing && (
              <div className="min-w-0">
                <span className="text-[11px] text-charcoal/50 block font-semibold">Subtotal</span>
                <span className="text-base font-extrabold text-coffee-900 truncate">
                  {formatPrice(item.price * quantity)}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-3 px-5 rounded-xl bg-coffee-700 hover:bg-coffee-800 text-cream font-bold text-sm transition-all shadow-soft active:scale-95 flex items-center justify-center gap-2"
            >
              <span>{isEditing ? 'Simpan Catatan' : 'Tambah ke Pesanan'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
