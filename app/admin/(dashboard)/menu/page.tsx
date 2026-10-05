'use client';

import { useEffect, useState, useCallback, useMemo, forwardRef, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  X,
  Loader2,
  AlertCircle,
  Search,
  Coffee,
  Sparkles,
  Layers,
  Building2,
  DollarSign,
  Tag,
  ToggleLeft,
  ToggleRight,
  SlidersHorizontal,
  Star,
  ChevronDown,
  Image as ImageIcon,
  Clock,
  Flame,
  Link,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { useAdminProfile } from '../../AdminShell';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { toast } from 'sonner';
import type { ItemOptionGroup, ItemOptionChoice } from '@/lib/item-options';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MenuCategory = 'kopi' | 'non-kopi' | 'makanan' | 'snack';

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: MenuCategory;
  image_url: string | null;
  image_urls?: string[] | null;
  badge: string | null;
  is_available: boolean;
  is_featured: boolean;
  is_sold_out?: boolean | null;
  sort_order: number;
  ingredients?: string | null;
  diet_tags?: string[] | null;
  allergen_tags?: string[] | null;
  prep_time_minutes?: number | null;
  portion_calories?: string | null;
  pairing_item_ids?: string[] | null;
  options?: ItemOptionGroup[] | null;
  created_at: string;
};

export type BranchMenuItem = {
  id: string;
  branch_id: string;
  menu_item_id: string;
  is_available: boolean;
  is_enabled: boolean;
  custom_price: number | null;
};

export type Branch = {
  id: string;
  name: string;
  address: string | null;
};

const CATEGORIES: { id: MenuCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'kopi', label: 'Kopi' },
  { id: 'non-kopi', label: 'Non-Kopi' },
  { id: 'makanan', label: 'Makanan' },
  { id: 'snack', label: 'Snack' },
];

const CATEGORY_LABELS: Record<MenuCategory, string> = {
  kopi: 'Kopi',
  'non-kopi': 'Non-Kopi',
  makanan: 'Makanan',
  snack: 'Snack',
};

const CATEGORY_COLORS: Record<MenuCategory, string> = {
  kopi: 'bg-amber-100 text-amber-800 border-amber-200/60',
  'non-kopi': 'bg-teal-100 text-teal-800 border-teal-200/60',
  makanan: 'bg-orange-100 text-orange-800 border-orange-200/60',
  snack: 'bg-purple-100 text-purple-800 border-purple-200/60',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

function getSupabase() {
  return getSupabaseBrowserClient();
}

async function updateBranchMenuItem(payload: {
  branch_id: string;
  menu_item_id: string;
  is_available?: boolean;
  is_enabled?: boolean;
  custom_price?: number | null;
}) {
  const res = await fetch('/api/admin/branch-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Gagal menyimpan perubahan menu cabang.');
  }
  return data;
}

async function triggerMenuRevalidate() {
  try {
    const res = await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'menu' }),
    });
    if (!res.ok) {
      toast('Tersimpan, tapi tampilan publik mungkin baru berubah dalam beberapa menit.');
    }
  } catch {
    toast('Tersimpan, tapi tampilan publik mungkin baru berubah dalam beberapa menit.');
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MenuManagementPage() {
  const profile = useAdminProfile();
  const supabase = getSupabase();

  const isSuperadmin = profile.role === 'superadmin';

  // State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isSuperadmin ? 'all' : profile.branch_id || '',
  );

  const [masterItems, setMasterItems] = useState<MenuItem[]>([]);
  const [branchItemMap, setBranchItemMap] = useState<Record<string, BranchMenuItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [itemModal, setItemModal] = useState<'create' | MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [priceModalTarget, setPriceModalTarget] = useState<{
    item: MenuItem;
    branchItem: BranchMenuItem | null;
  } | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 1. Fetch branches for superadmin
  useEffect(() => {
    if (isSuperadmin) {
      supabase
        .from('branches')
        .select('*')
        .order('name')
        .then(({ data }: any) => {
          if (data) setBranches(data as Branch[]);
        });
    }
  }, [isSuperadmin, supabase]);

  // 2. Fetch master menu items & branch overrides
  const fetchData = useCallback(async () => {
    setError(null);

    const activeBranch = isSuperadmin ? selectedBranchId : profile.branch_id;

    // Fetch master items
    const { data: menuData, error: menuErr } = await supabase
      .from('menu_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (menuErr) {
      setError(menuErr.message);
      setLoading(false);
      return;
    }

    setMasterItems((menuData as MenuItem[]) || []);

    // If viewing a specific branch, fetch branch_menu_items overrides
    if (activeBranch && activeBranch !== 'all') {
      const { data: branchData, error: branchErr } = await supabase
        .from('branch_menu_items')
        .select('*')
        .eq('branch_id', activeBranch);

      if (branchErr) {
        setError(branchErr.message);
      } else if (branchData) {
        const map: Record<string, BranchMenuItem> = {};
        branchData.forEach((b: any) => {
          map[b.menu_item_id] = b as BranchMenuItem;
        });
        setBranchItemMap(map);
      }
    } else {
      setBranchItemMap({});
    }

    setLoading(false);
  }, [isSuperadmin, selectedBranchId, profile.branch_id, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle availability (Stok Tersedia / Habis)
  async function handleToggleAvailability(item: MenuItem) {
    const activeBranch = isSuperadmin ? selectedBranchId : profile.branch_id;
    setTogglingId(item.id);

    if (!activeBranch || activeBranch === 'all') {
      // Global Master Toggle (Superadmin only)
      const nextAvailable = !item.is_available;
      setMasterItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: nextAvailable } : i)),
      );

      const { error: err } = await supabase
        .from('menu_items')
        .update({ is_available: nextAvailable })
        .eq('id', item.id);

      if (err) {
        setMasterItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i)),
        );
        setError(err.message);
      } else {
        triggerMenuRevalidate();
      }
    } else {
      // Branch-specific Toggle
      const existingBranchRow = branchItemMap[item.id];
      const currentAvailable = existingBranchRow ? existingBranchRow.is_available : item.is_available;
      const nextAvailable = !currentAvailable;

      // Optimistic update
      setBranchItemMap((prev) => ({
        ...prev,
        [item.id]: {
          ...(prev[item.id] || {
            id: '',
            branch_id: activeBranch,
            menu_item_id: item.id,
            is_enabled: true,
            custom_price: null,
          }),
          is_available: nextAvailable,
        },
      }));

      try {
        await updateBranchMenuItem({
          branch_id: activeBranch,
          menu_item_id: item.id,
          is_available: nextAvailable,
          is_enabled: existingBranchRow?.is_enabled ?? true,
          custom_price: existingBranchRow?.custom_price ?? null,
        });
        triggerMenuRevalidate();
      } catch (err: any) {
        // Rollback
        setBranchItemMap((prev) => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            is_available: currentAvailable,
          },
        }));
        setError(err?.message || 'Gagal mengubah ketersediaan menu di cabang.');
      }
    }

    setTogglingId(null);
  }

  // Toggle enablement (Disajikan di Cabang ini / Nonaktif di Cabang ini)
  async function handleToggleEnabled(item: MenuItem) {
    const activeBranch = isSuperadmin ? selectedBranchId : profile.branch_id;
    if (!activeBranch || activeBranch === 'all') return;

    const existingBranchRow = branchItemMap[item.id];
    const currentEnabled = existingBranchRow ? existingBranchRow.is_enabled : true;
    const nextEnabled = !currentEnabled;

    setBranchItemMap((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] || {
          id: '',
          branch_id: activeBranch,
          menu_item_id: item.id,
          is_available: item.is_available,
          custom_price: null,
        }),
        is_enabled: nextEnabled,
      },
    }));

    try {
      await updateBranchMenuItem({
        branch_id: activeBranch,
        menu_item_id: item.id,
        is_enabled: nextEnabled,
        is_available: existingBranchRow?.is_available ?? item.is_available,
        custom_price: existingBranchRow?.custom_price ?? null,
      });
      triggerMenuRevalidate();
    } catch (err: any) {
      setBranchItemMap((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          is_enabled: currentEnabled,
        },
      }));
      setError(err?.message || 'Gagal mengubah status penyajian menu di cabang.');
    }
  }

  // Delete Master Menu Item
  async function handleDelete(item: MenuItem) {
    setDeleting(true);
    const { error: err } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id);

    if (err) {
      setError(err.message);
      setDeleting(false);
      return;
    }

    setMasterItems((prev) => prev.filter((i) => i.id !== item.id));
    setDeleting(false);
    setDeleteTarget(null);
    triggerMenuRevalidate();
  }

  // Toggle is_featured (max 8, superadmin master view only)
  async function handleToggleFeatured(item: MenuItem) {
    const nextFeatured = !item.is_featured;

    if (nextFeatured && featuredCount >= 8) {
      setError('Maksimal 8 menu yang bisa ditampilkan di beranda. Hapus centang salah satu terlebih dahulu.');
      return;
    }

    // Optimistic update
    setMasterItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_featured: nextFeatured } : i)),
    );

    const { error: err } = await supabase
      .from('menu_items')
      .update({ is_featured: nextFeatured })
      .eq('id', item.id);

    if (err) {
      // Rollback
      setMasterItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_featured: item.is_featured } : i)),
      );
      setError(err.message);
    } else {
      triggerMenuRevalidate();
    }
  }

  // Compute processed items with branch overrides
  const processedItems = useMemo(() => {
    const activeBranch = isSuperadmin ? selectedBranchId : profile.branch_id;
    const isBranchView = Boolean(activeBranch && activeBranch !== 'all');

    return masterItems.map((item) => {
      const branchRow = isBranchView ? branchItemMap[item.id] : null;
      const isEnabled = branchRow ? branchRow.is_enabled : true;
      const isAvailable = branchRow ? branchRow.is_available : item.is_available;
      const effectivePrice =
        branchRow && branchRow.custom_price != null ? branchRow.custom_price : item.price;
      const hasCustomPrice = Boolean(branchRow && branchRow.custom_price != null);

      return {
        ...item,
        is_enabled: isEnabled,
        is_available: isAvailable,
        effectivePrice,
        hasCustomPrice,
        branchRow,
      };
    });
  }, [masterItems, branchItemMap, isSuperadmin, selectedBranchId, profile.branch_id]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return processedItems.filter((item) => {
      const matchCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      const matchQuery =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.badge && item.badge.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchQuery;
    });
  }, [processedItems, selectedCategory, searchQuery]);

  // Stats calculation
  const totalCount = processedItems.length;
  const activeBranch = isSuperadmin ? selectedBranchId : profile.branch_id;
  const isBranchView = Boolean(activeBranch && activeBranch !== 'all');

  const enabledCount   = processedItems.filter((i) => i.is_enabled).length;
  const availableCount = processedItems.filter((i) => i.is_enabled && i.is_available).length;
  const outOfStockCount = processedItems.filter((i) => i.is_enabled && !i.is_available).length;
  const featuredCount  = masterItems.filter((i) => i.is_featured).length;

  const currentBranchName = useMemo(() => {
    if (isSuperadmin) {
      if (selectedBranchId === 'all') return 'Master Menu (Semua Cabang)';
      return branches.find((b) => b.id === selectedBranchId)?.name ?? 'Cabang';
    }
    return profile.branch_name ?? 'Cabang Saya';
  }, [isSuperadmin, selectedBranchId, branches, profile.branch_name]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-coffee-900">Manajemen Menu</h1>
            {isBranchView && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-coffee-100 text-coffee-800 border border-coffee-200">
                {currentBranchName}
              </span>
            )}
          </div>
          <p className="text-sm text-charcoal/50 mt-0.5">
            {isSuperadmin && selectedBranchId === 'all'
              ? 'Kelola katalog master menu, foto, harga dasar, dan deskripsi produk.'
              : `Kelola ketersediaan stok harian dan menu aktif untuk ${currentBranchName}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Superadmin Branch Selector */}
          {isSuperadmin && (
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white border border-coffee-200/80 text-coffee-900 font-bold text-sm shadow-soft focus:outline-none focus:border-coffee-400 cursor-pointer pr-8"
              >
                <option value="all">🌐 Master Menu (Semua)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    📍 {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Add Master Menu Button (Superadmin only) */}
          {isSuperadmin && (
            <button
              onClick={() => setItemModal('create')}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-sm font-bold hover:bg-coffee-800 transition-colors active:scale-95 shadow-soft"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Master Menu</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats summary bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-3.5 sm:p-4">
          <p className="text-[11px] font-bold text-charcoal/50 uppercase tracking-wide">
            {isBranchView ? 'Menu Disajikan' : 'Total Master Menu'}
          </p>
          <p className="text-lg sm:text-2xl font-extrabold text-coffee-900 mt-1">
            {isBranchView ? enabledCount : totalCount}
          </p>
        </div>
        {!isBranchView && isSuperadmin && (
          <div className="bg-white rounded-2xl border border-amber-200/80 p-3.5 sm:p-4">
            <p className="text-[11px] font-bold text-amber-700/70 uppercase tracking-wide flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              Ditampilkan
            </p>
            <p className="text-lg sm:text-2xl font-extrabold text-amber-700 mt-1">{featuredCount}<span className="text-xs font-semibold text-amber-500/70 ml-1">/8</span></p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-3.5 sm:p-4">
          <p className="text-[11px] font-bold text-emerald-700/70 uppercase tracking-wide">Stok Tersedia</p>
          <p className="text-lg sm:text-2xl font-extrabold text-emerald-700 mt-1">{availableCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-3.5 sm:p-4">
          <p className="text-[11px] font-bold text-red-600/70 uppercase tracking-wide">Stok Habis</p>
          <p className="text-lg sm:text-2xl font-extrabold text-red-600 mt-1">{outOfStockCount}</p>
        </div>
      </div>

      {/* Global Error message */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200/80">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Search & Category Filter Controls */}
      <div className="bg-white rounded-2xl border border-coffee-100/80 p-3 sm:p-4 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-charcoal/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama menu, deskripsi, atau badge..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-charcoal/40 hover:text-charcoal transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            const count =
              cat.id === 'all'
                ? processedItems.length
                : processedItems.filter((i) => i.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                  active
                    ? 'bg-coffee-700 text-cream shadow-sm'
                    : 'text-charcoal/60 hover:bg-coffee-50 hover:text-coffee-900 border border-coffee-100/60'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    active ? 'bg-coffee-900/30 text-cream' : 'bg-coffee-100 text-charcoal/60'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-coffee-500 animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-coffee-100/80 p-8">
          <UtensilsCrossed className="w-12 h-12 text-coffee-200 mb-3" />
          <p className="text-coffee-900 font-bold">Tidak ada item menu</p>
          <p className="text-xs text-charcoal/40 mt-1 max-w-sm">
            {searchQuery
              ? `Tidak ditemukan menu yang sesuai dengan "${searchQuery}".`
              : 'Belum ada item dalam kategori ini.'}
          </p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                isBranchView={isBranchView}
                isSuperadmin={isSuperadmin}
                toggling={togglingId === item.id}
                featuredCount={featuredCount}
                onToggleAvailability={() => handleToggleAvailability(item)}
                onToggleEnabled={() => handleToggleEnabled(item)}
                onToggleFeatured={() => handleToggleFeatured(item)}
                onEditMaster={() => setItemModal(item)}
                onDeleteMaster={() => setDeleteTarget(item)}
                onOpenPriceModal={() =>
                  setPriceModalTarget({
                    item,
                    branchItem: item.branchRow,
                  })
                }
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Add / Edit Master Modal (Superadmin only) */}
      <AnimatePresence>
        {itemModal && (
          <MenuItemFormModal
            initial={itemModal === 'create' ? null : (itemModal as MenuItem)}
            allItems={masterItems}
            onClose={() => setItemModal(null)}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>

      {/* Branch Price Override Modal */}
      <AnimatePresence>
        {priceModalTarget && activeBranch && activeBranch !== 'all' && (
          <BranchPriceModal
            branchId={activeBranch}
            item={priceModalTarget.item}
            branchItem={priceModalTarget.branchItem}
            onClose={() => setPriceModalTarget(null)}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <ModalBackdrop onClose={() => !deleting && setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft-lg"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-coffee-900">Hapus Master Menu?</h3>
                  <p className="text-xs text-charcoal/50 mt-0.5">
                    Item <span className="font-semibold text-coffee-800">&quot;{deleteTarget.name}&quot;</span> akan dihapus dari seluruh cabang.
                  </p>
                </div>
              </div>
              <p className="text-xs text-charcoal/60 leading-relaxed bg-red-50/50 p-3 rounded-xl border border-red-100">
                Tindakan ini tidak dapat diurungkan dan menu akan hilang dari seluruh cabang &amp; pesanan.
              </p>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl border border-coffee-100 text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteTarget)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menghapus...</span>
                    </>
                  ) : (
                    <span>Ya, Hapus</span>
                  )}
                </button>
              </div>
            </motion.div>
          </ModalBackdrop>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Menu Item Card ───────────────────────────────────────────────────────────

const MenuItemCard = forwardRef<
  HTMLDivElement,
  {
    item: MenuItem & {
      is_enabled: boolean;
      is_available: boolean;
      effectivePrice: number;
      hasCustomPrice: boolean;
      branchRow: BranchMenuItem | null;
    };
    isBranchView: boolean;
    isSuperadmin: boolean;
    toggling: boolean;
    featuredCount: number;
    onToggleAvailability: () => void;
    onToggleEnabled: () => void;
    onToggleFeatured: () => void;
    onEditMaster: () => void;
    onDeleteMaster: () => void;
    onOpenPriceModal: () => void;
  }
>(function MenuItemCard(
  {
    item,
    isBranchView,
    isSuperadmin,
    toggling,
    featuredCount,
    onToggleAvailability,
    onToggleEnabled,
    onToggleFeatured,
    onEditMaster,
    onDeleteMaster,
    onOpenPriceModal,
  },
  ref
) {
  const [imgError, setImgError] = useState(false);

  const isServed = !isBranchView || item.is_enabled;

  return (
    <motion.div
      ref={ref}
      variants={fadeInUp}
      layout
      exit={{ opacity: 0, scale: 0.95 }}
      className={`bg-white rounded-2xl border transition-all flex flex-col justify-between overflow-hidden shadow-soft ${
        !isServed
          ? 'border-gray-200 bg-gray-50/70 opacity-60'
          : item.is_available
          ? 'border-coffee-100/80'
          : 'border-red-100/80 bg-stone-50/50'
      }`}
    >
      <div className="p-4 space-y-3">
        {/* Header: Badges & Master Controls */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[item.category]}`}
            >
              {CATEGORY_LABELS[item.category]}
            </span>
            {item.badge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {item.badge}
              </span>
            )}
            {item.is_featured && !isBranchView && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 fill-amber-400" />
                Beranda
              </span>
            )}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-coffee-50 text-coffee-600 border border-coffee-100 flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" />
              #{item.sort_order}
            </span>
            {item.hasCustomPrice && isBranchView && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                <Tag className="w-2.5 h-2.5" />
                Harga Cabang
              </span>
            )}
          </div>

          {/* Master Edit / Delete + Featured toggle (Superadmin only) */}
          {isSuperadmin && !isBranchView && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Star: Tampilkan di Beranda toggle */}
              <button
                onClick={onToggleFeatured}
                disabled={!item.is_featured && featuredCount >= 8}
                className={`p-1.5 rounded-lg transition-colors ${
                  item.is_featured
                    ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
                    : featuredCount >= 8
                    ? 'text-charcoal/20 cursor-not-allowed'
                    : 'text-charcoal/40 hover:text-amber-500 hover:bg-amber-50'
                }`}
                title={item.is_featured ? 'Hapus dari Beranda' : featuredCount >= 8 ? 'Maks. 8 item beranda' : 'Tampilkan di Beranda'}
              >
                <Star className={`w-3.5 h-3.5 ${item.is_featured ? 'fill-amber-400' : ''}`} />
              </button>
              <button
                onClick={onEditMaster}
                className="p-1.5 rounded-lg text-charcoal/40 hover:text-coffee-700 hover:bg-coffee-50 transition-colors"
                title="Edit master menu"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDeleteMaster}
                className="p-1.5 rounded-lg text-charcoal/40 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Hapus master menu"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Branch Custom Price Button */}
          {isBranchView && (
            <button
              onClick={onOpenPriceModal}
              className="p-1.5 rounded-lg text-charcoal/40 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              title="Atur harga khusus cabang"
            >
              <DollarSign className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Content row with image */}
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="w-16 h-16 rounded-xl bg-coffee-50 border border-coffee-100/80 overflow-hidden flex-shrink-0 flex items-center justify-center">
            {item.image_url && !imgError ? (
              <img
                src={item.image_url}
                alt={item.name}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Coffee className="w-6 h-6 text-coffee-300" />
            )}
          </div>

          {/* Text Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-coffee-900 text-sm leading-snug truncate">
              {item.name}
            </h3>
            <p className="text-xs text-charcoal/60 line-clamp-2 mt-0.5 leading-relaxed">
              {item.description || <span className="italic text-charcoal/30">Tidak ada deskripsi</span>}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-sm font-extrabold text-coffee-800">
                {formatPrice(item.effectivePrice)}
              </span>
              {item.hasCustomPrice && isBranchView && (
                <span className="text-[11px] text-charcoal/40 line-through">
                  {formatPrice(item.price)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="px-4 py-2.5 bg-cream/40 border-t border-coffee-100/60 flex items-center justify-between gap-2">
        {isBranchView ? (
          <>
            {/* Toggle Enablement (Disajikan di cabang ini) */}
            <button
              type="button"
              onClick={onToggleEnabled}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                item.is_enabled
                  ? 'text-coffee-800 hover:bg-coffee-100/60'
                  : 'text-charcoal/40 hover:bg-gray-100 line-through'
              }`}
              title={item.is_enabled ? 'Klik untuk nonaktifkan di cabang ini' : 'Klik untuk sajikan di cabang ini'}
            >
              {item.is_enabled ? (
                <ToggleRight className="w-4 h-4 text-emerald-600" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-gray-400" />
              )}
              <span>{item.is_enabled ? 'Disajikan' : 'Tidak Disajikan'}</span>
            </button>

            {/* Toggle Availability (Stok Tersedia / Habis) */}
            {item.is_enabled && (
              <button
                type="button"
                onClick={onToggleAvailability}
                disabled={toggling}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  item.is_available
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                } disabled:opacity-50`}
              >
                {toggling ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      item.is_available ? 'bg-emerald-600' : 'bg-red-500'
                    }`}
                  />
                )}
                <span>{item.is_available ? 'Tersedia' : 'Habis'}</span>
              </button>
            )}
          </>
        ) : (
          /* Master Global View Availability Toggle */
          <>
            <span className="text-xs font-semibold text-charcoal/60">
              Ketersediaan Master:
            </span>
            <button
              type="button"
              onClick={onToggleAvailability}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                item.is_available
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              } disabled:opacity-50`}
            >
              {toggling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span
                  className={`w-2 h-2 rounded-full ${
                    item.is_available ? 'bg-emerald-600' : 'bg-red-500'
                  }`}
                />
              )}
              <span>{item.is_available ? 'Aktif Global' : 'Nonaktif Global'}</span>
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
});

// ─── Add / Edit Master Modal — helper components ──────────────────────────────

const PRESET_DIET_TAGS = ['Halal', 'Vegetarian', 'Vegan', 'Bebas Gluten', 'Bebas Laktosa', 'Rendah Kalori', 'Pedas'];
const PRESET_ALLERGEN_TAGS = ['Kacang', 'Susu', 'Telur', 'Gluten', 'Kedelai', 'Seafood', 'Wijen'];

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function FormSection({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-coffee-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-coffee-50/70 text-left hover:bg-coffee-100/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-[11px] font-bold text-coffee-900 uppercase tracking-wide">
          {icon}
          {title}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-charcoal/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-coffee-100/60">
          {children}
        </div>
      )}
    </div>
  );
}

function TagChipSelector({
  label,
  hint,
  presets,
  selected,
  onChange,
}: {
  label: string;
  hint?: string;
  presets: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [customInput, setCustomInput] = useState('');

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (trimmed && !selected.includes(trimmed)) onChange([...selected, trimmed]);
    setCustomInput('');
  }

  const customTags = selected.filter((t) => !presets.includes(t));

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-charcoal/60">
        {label}
        {hint && <span className="font-normal ml-1 text-charcoal/40">{hint}</span>}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                active
                  ? 'bg-coffee-700 text-cream border-coffee-700'
                  : 'bg-white text-charcoal/70 border-coffee-200 hover:border-coffee-400 hover:text-coffee-900'
              }`}
            >
              {tag}
            </button>
          );
        })}
        {customTags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-coffee-700 text-cream"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(selected.filter((t) => t !== tag))}
              className="hover:opacity-70"
              aria-label={`Hapus tag ${tag}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={`Tambah tag kustom...`}
          className="flex-1 px-3 py-1.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-xs focus:outline-none focus:border-coffee-400 transition-colors"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!customInput.trim()}
          className="px-3 py-1.5 rounded-xl bg-coffee-100 text-coffee-800 text-xs font-bold hover:bg-coffee-200 disabled:opacity-40 transition-colors"
        >
          + Tambah
        </button>
      </div>
    </div>
  );
}

function OptionGroupsEditor({
  groups,
  onChange,
}: {
  groups: ItemOptionGroup[];
  onChange: (groups: ItemOptionGroup[]) => void;
}) {
  function addGroup() {
    const newGroup: ItemOptionGroup = {
      id: makeId(),
      name: '',
      type: 'single',
      required: false,
      choices: [{ id: makeId(), name: '', price: 0 }],
    };
    onChange([...groups, newGroup]);
  }

  function updateGroup(idx: number, patch: Partial<ItemOptionGroup>) {
    onChange(groups.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }

  function removeGroup(idx: number) {
    onChange(groups.filter((_, i) => i !== idx));
  }

  function addChoice(gIdx: number) {
    const newChoice: ItemOptionChoice = { id: makeId(), name: '', price: 0 };
    updateGroup(gIdx, { choices: [...groups[gIdx].choices, newChoice] });
  }

  function updateChoice(gIdx: number, cIdx: number, patch: Partial<ItemOptionChoice>) {
    updateGroup(gIdx, {
      choices: groups[gIdx].choices.map((c, i) => (i === cIdx ? { ...c, ...patch } : c)),
    });
  }

  function removeChoice(gIdx: number, cIdx: number) {
    updateGroup(gIdx, { choices: groups[gIdx].choices.filter((_, i) => i !== cIdx) });
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gIdx) => (
        <div
          key={group.id}
          className="bg-coffee-50/50 rounded-xl border border-coffee-100 p-3 space-y-3"
        >
          {/* Group name + delete */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={group.name}
              onChange={(e) => updateGroup(gIdx, { name: e.target.value })}
              placeholder="Nama grup (mis. Ukuran, Level Pedas, Topping)"
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-coffee-200 text-charcoal text-xs font-semibold focus:outline-none focus:border-coffee-400"
            />
            <button
              type="button"
              onClick={() => removeGroup(gIdx)}
              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Hapus grup"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Type toggle + required */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center rounded-lg bg-white border border-coffee-200 overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => updateGroup(gIdx, { type: 'single' })}
                className={`px-2.5 py-1.5 transition-colors ${
                  group.type === 'single'
                    ? 'bg-coffee-700 text-cream'
                    : 'text-charcoal/60 hover:bg-coffee-50'
                }`}
              >
                Pilih Satu
              </button>
              <button
                type="button"
                onClick={() => updateGroup(gIdx, { type: 'multiple' })}
                className={`px-2.5 py-1.5 transition-colors border-l border-coffee-200 ${
                  group.type === 'multiple'
                    ? 'bg-coffee-700 text-cream'
                    : 'text-charcoal/60 hover:bg-coffee-50'
                }`}
              >
                Pilih Banyak
              </button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold text-charcoal/70">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => updateGroup(gIdx, { required: e.target.checked })}
                className="w-3.5 h-3.5 accent-coffee-700"
              />
              Wajib dipilih
            </label>
          </div>

          {/* Choices */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-charcoal/40 uppercase tracking-wide">Pilihan</p>
            {group.choices.map((choice, cIdx) => (
              <div key={choice.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={choice.name}
                  onChange={(e) => updateChoice(gIdx, cIdx, { name: e.target.value })}
                  placeholder={`Pilihan ${cIdx + 1} (mis. Regular, Large)`}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-coffee-200 text-charcoal text-xs focus:outline-none focus:border-coffee-400"
                />
                <div className="relative flex-shrink-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-charcoal/40">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={choice.price}
                    onChange={(e) =>
                      updateChoice(gIdx, cIdx, { price: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-24 pl-6 pr-2 py-1.5 rounded-lg bg-white border border-coffee-200 text-charcoal text-xs focus:outline-none focus:border-coffee-400"
                  />
                </div>
                {group.choices.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChoice(gIdx, cIdx)}
                    className="p-1 rounded-lg text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    aria-label="Hapus pilihan"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => addChoice(gIdx)}
              className="text-xs font-semibold text-coffee-700 hover:text-coffee-900 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-coffee-100 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Tambah Pilihan
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addGroup}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-coffee-200 text-coffee-700 text-xs font-bold hover:bg-coffee-50 hover:border-coffee-400 transition-all flex items-center justify-center gap-2"
      >
        <Plus className="w-3.5 h-3.5" />
        Tambah Grup Opsi Baru
      </button>
    </div>
  );
}

function PairingItemsSelector({
  allItems,
  currentItemId,
  selected,
  onChange,
}: {
  allItems: MenuItem[];
  currentItemId: string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');

  const available = allItems.filter(
    (i) =>
      i.id !== currentItemId &&
      (!search.trim() || i.name.toLowerCase().includes(search.toLowerCase()))
  );

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (selected.length < 4) {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-charcoal/50">
        Pilih hingga <strong>4</strong> item yang direkomendasikan bersama produk ini di popup detail pelanggan.
      </p>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const it = allItems.find((i) => i.id === id);
            return it ? (
              <span
                key={id}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-coffee-700 text-cream"
              >
                {it.name}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="hover:opacity-70"
                  aria-label={`Hapus ${it.name} dari pairing`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ) : null;
          })}
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari nama menu..."
        className="w-full px-3 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-xs focus:outline-none focus:border-coffee-400 transition-colors"
      />

      <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-xl border border-coffee-100 bg-white p-1">
        {available.slice(0, 30).map((it) => {
          const isSelected = selected.includes(it.id);
          const isDisabled = !isSelected && selected.length >= 4;
          return (
            <button
              key={it.id}
              type="button"
              disabled={isDisabled}
              onClick={() => toggle(it.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors text-xs ${
                isSelected
                  ? 'bg-coffee-700 text-cream'
                  : isDisabled
                  ? 'opacity-40 cursor-not-allowed text-charcoal/60'
                  : 'hover:bg-coffee-50 text-charcoal'
              }`}
            >
              {it.image_url ? (
                <img
                  src={it.image_url}
                  alt=""
                  className="w-6 h-6 rounded-md object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-md bg-coffee-100 flex-shrink-0" />
              )}
              <span className="flex-1 font-semibold truncate">{it.name}</span>
              <span
                className={`flex-shrink-0 font-mono ${
                  isSelected ? 'text-cream/70' : 'text-charcoal/40'
                }`}
              >
                {formatPrice(it.price)}
              </span>
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="text-center text-xs text-charcoal/40 py-4">Tidak ada item yang sesuai.</p>
        )}
      </div>
    </div>
  );
}

// ─── Add / Edit Master Modal ──────────────────────────────────────────────────

function MenuItemFormModal({
  initial,
  allItems,
  onClose,
  onSaved,
}: {
  initial: MenuItem | null;
  allItems: MenuItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabase();

  // ── Basic info ──
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState<number | string>(initial?.price ?? '');
  const [category, setCategory] = useState<MenuCategory>(initial?.category ?? 'kopi');
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0);

  // ── Visibilitas & badge ──
  const [badge, setBadge] = useState(initial?.badge ?? '');
  const [isAvailable, setIsAvailable] = useState<boolean>(initial?.is_available ?? true);
  const [isFeatured, setIsFeatured] = useState<boolean>(initial?.is_featured ?? false);
  const [isSoldOut, setIsSoldOut] = useState<boolean>(initial?.is_sold_out ?? false);

  // ── Media ──
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.image_urls ?? []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [imgPreviewError, setImgPreviewError] = useState(false);

  // ── Detail produk ──
  const [ingredients, setIngredients] = useState(initial?.ingredients ?? '');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number | string>(
    initial?.prep_time_minutes ?? ''
  );
  const [portionCalories, setPortionCalories] = useState(initial?.portion_calories ?? '');
  const [dietTags, setDietTags] = useState<string[]>(initial?.diet_tags ?? []);
  const [allergenTags, setAllergenTags] = useState<string[]>(initial?.allergen_tags ?? []);

  // ── Pairing items ──
  const [pairingItemIds, setPairingItemIds] = useState<string[]>(
    initial?.pairing_item_ids ?? []
  );

  // ── Option groups ──
  const [optionGroups, setOptionGroups] = useState<ItemOptionGroup[]>(
    (initial?.options as ItemOptionGroup[]) ?? []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addExtraImageUrl() {
    const trimmed = newImageUrl.trim();
    if (trimmed && imageUrls.length < 5) {
      setImageUrls((prev) => [...prev, trimmed]);
    }
    setNewImageUrl('');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError('Nama menu wajib diisi.');
      return;
    }

    const numericPrice = typeof price === 'string' ? parseInt(price, 10) : price;
    if (isNaN(numericPrice) || numericPrice < 0) {
      setError('Harga harus berupa angka yang valid (minimal 0).');
      return;
    }

    for (const group of optionGroups) {
      if (!group.name.trim()) {
        setError('Nama grup opsi tidak boleh kosong.');
        return;
      }
      for (const choice of group.choices) {
        if (!choice.name.trim()) {
          setError(`Nama pilihan dalam grup "${group.name}" tidak boleh kosong.`);
          return;
        }
      }
    }

    setSaving(true);
    setError(null);

    const primaryUrl = imageUrl.trim() || null;
    const allImageUrls = [
      ...(primaryUrl ? [primaryUrl] : []),
      ...imageUrls.filter((u) => u && u !== primaryUrl),
    ];

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: numericPrice,
      category,
      image_url: primaryUrl,
      image_urls: allImageUrls.length > 0 ? allImageUrls : null,
      badge: badge.trim() || null,
      sort_order: Number(sortOrder) || 0,
      is_available: isAvailable,
      is_featured: isFeatured,
      is_sold_out: isSoldOut,
      ingredients: ingredients.trim() || null,
      prep_time_minutes:
        prepTimeMinutes === '' ? null : Number(prepTimeMinutes) || null,
      portion_calories: portionCalories.trim() || null,
      diet_tags: dietTags.length > 0 ? dietTags : null,
      allergen_tags: allergenTags.length > 0 ? allergenTags : null,
      pairing_item_ids: pairingItemIds.length > 0 ? pairingItemIds : null,
      options: optionGroups.length > 0 ? optionGroups : null,
    };

    if (initial) {
      const { error: err } = await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', initial.id);

      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await supabase.from('menu_items').insert(payload);

      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    }

    triggerMenuRevalidate();
    onSaved();
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-soft-lg flex flex-col"
        style={{ maxHeight: '90dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-coffee-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-coffee-50 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-coffee-700" />
            </div>
            <h3 className="font-bold text-coffee-900 text-base">
              {initial ? 'Edit Master Menu' : 'Tambah Master Menu Baru'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-charcoal/35 hover:text-charcoal/60 transition-colors p-1 rounded-lg hover:bg-coffee-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {error && <ErrorAlert message={error} />}

          <form id="menu-item-form" onSubmit={handleSave} className="space-y-3">

            {/* ── 1. Informasi Dasar ── */}
            <FormSection
              title="Informasi Dasar"
              icon={<UtensilsCrossed className="w-3.5 h-3.5" />}
              defaultOpen
            >
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  Nama Menu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Signature Iced Latte"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    Kategori <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MenuCategory)}
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors cursor-pointer"
                  >
                    <option value="kopi">Kopi</option>
                    <option value="non-kopi">Non-Kopi</option>
                    <option value="makanan">Makanan</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    Harga Master (IDR) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-charcoal/40">
                      Rp
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="27000"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  Deskripsi (opsional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsi singkat mengenai rasa atau bahan menu..."
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors resize-none"
                />
              </div>
            </FormSection>

            {/* ── 2. Foto & Media ── */}
            <FormSection
              title="Foto & Media"
              icon={<ImageIcon className="w-3.5 h-3.5" />}
              defaultOpen
            >
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  URL Foto Utama
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImgPreviewError(false);
                  }}
                  placeholder="https://images.pexels.com/..."
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
                {imageUrl && !imgPreviewError && (
                  <img
                    src={imageUrl}
                    alt="Preview foto utama"
                    className="mt-2 h-20 w-auto rounded-xl object-cover border border-coffee-100"
                    onError={() => setImgPreviewError(true)}
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  Foto Tambahan
                  <span className="font-normal ml-1 text-charcoal/40">(carousel — maks. 5 total)</span>
                </label>
                {imageUrls.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {imageUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Link className="w-3.5 h-3.5 text-charcoal/30 flex-shrink-0" />
                        <span className="flex-1 truncate text-xs text-charcoal/60 bg-coffee-50 px-2.5 py-1.5 rounded-lg border border-coffee-100 font-mono">
                          {url}
                        </span>
                        <button
                          type="button"
                          onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}
                          className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                          aria-label="Hapus foto ini"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {imageUrls.length < 5 && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addExtraImageUrl();
                        }
                      }}
                      placeholder="URL foto tambahan (Enter untuk tambah)"
                      className="flex-1 px-3 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-xs focus:outline-none focus:border-coffee-400 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={addExtraImageUrl}
                      disabled={!newImageUrl.trim() || imageUrls.length >= 5}
                      className="px-3 py-2 rounded-xl bg-coffee-100 text-coffee-800 text-xs font-bold hover:bg-coffee-200 disabled:opacity-40 transition-colors"
                    >
                      + Tambah
                    </button>
                  </div>
                )}
              </div>
            </FormSection>

            {/* ── 3. Visibilitas & Badge ── */}
            <FormSection
              title="Visibilitas & Badge"
              icon={<Tag className="w-3.5 h-3.5" />}
              defaultOpen
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">Badge</label>
                  <select
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors cursor-pointer"
                  >
                    <option value="">Tidak ada</option>
                    <option value="Bestseller">★ Bestseller</option>
                    <option value="New">✦ New</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    Urutan (Sort Order)
                  </label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="w-4 h-4 rounded accent-coffee-700"
                  />
                  <span className="text-sm font-semibold text-coffee-900">
                    Menu Aktif &amp; Tersedia secara Global
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSoldOut}
                    onChange={(e) => setIsSoldOut(e.target.checked)}
                    className="w-4 h-4 rounded accent-red-500"
                  />
                  <span className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Tandai Stok Habis (Global)
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-500"
                  />
                  <span className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    Tampilkan di Beranda (maks. 8)
                  </span>
                </label>
              </div>
            </FormSection>

            {/* ── 4. Detail Produk ── */}
            <FormSection
              title="Detail Produk"
              icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
              defaultOpen={false}
            >
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  Bahan-bahan / Ingredients (opsional)
                </label>
                <textarea
                  rows={2}
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  placeholder="Contoh: Espresso, susu segar, gula aren, es batu..."
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    <Clock className="inline w-3 h-3 mr-1" />
                    Estimasi Waktu Saji (menit)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={prepTimeMinutes}
                    onChange={(e) => setPrepTimeMinutes(e.target.value)}
                    placeholder="Contoh: 5"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    <Flame className="inline w-3 h-3 mr-1" />
                    Kalori / Porsi (opsional)
                  </label>
                  <input
                    type="text"
                    value={portionCalories}
                    onChange={(e) => setPortionCalories(e.target.value)}
                    placeholder="Contoh: 250 kcal"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>
              </div>

              <TagChipSelector
                label="Diet Tags"
                hint="(mis. Halal, Vegan)"
                presets={PRESET_DIET_TAGS}
                selected={dietTags}
                onChange={setDietTags}
              />
              <TagChipSelector
                label="Allergen Tags"
                hint="(peringatan bahan alergen)"
                presets={PRESET_ALLERGEN_TAGS}
                selected={allergenTags}
                onChange={setAllergenTags}
              />
            </FormSection>

            {/* ── 5. Opsi & Tambahan ── */}
            <FormSection
              title="Opsi & Tambahan"
              icon={<Layers className="w-3.5 h-3.5" />}
              defaultOpen={false}
            >
              <p className="text-xs text-charcoal/50 leading-relaxed">
                Tambah grup opsi seperti ukuran, level pedas, atau topping tambahan. Pilihan dengan harga
                tambahan akan ditampilkan langsung kepada pelanggan di popup produk.
              </p>
              <OptionGroupsEditor groups={optionGroups} onChange={setOptionGroups} />
            </FormSection>

            {/* ── 6. Cocok Dipadukan ── */}
            <FormSection
              title="Cocok Dipadukan"
              icon={<Coffee className="w-3.5 h-3.5" />}
              defaultOpen={false}
            >
              <PairingItemsSelector
                allItems={allItems}
                currentItemId={initial?.id ?? null}
                selected={pairingItemIds}
                onChange={setPairingItemIds}
              />
            </FormSection>

          </form>
        </div>

        {/* Sticky footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-coffee-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-coffee-100 text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="menu-item-form"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <span>{initial ? 'Simpan Perubahan' : 'Tambah Menu'}</span>
            )}
          </button>
        </div>
      </motion.div>
    </ModalBackdrop>
  );
}

// ─── Branch Custom Price Modal ────────────────────────────────────────────────

function BranchPriceModal({
  branchId,
  item,
  branchItem,
  onClose,
  onSaved,
}: {
  branchId: string;
  item: MenuItem;
  branchItem: BranchMenuItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabase();
  const [customPrice, setCustomPrice] = useState<string>(
    branchItem?.custom_price != null ? String(branchItem.custom_price) : '',
  );
  const [useDefault, setUseDefault] = useState<boolean>(branchItem?.custom_price == null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const priceValue = useDefault || !customPrice.trim() ? null : parseInt(customPrice, 10);
    if (!useDefault && (isNaN(priceValue as number) || (priceValue as number) < 0)) {
      setError('Harga khusus harus berupa angka yang valid.');
      setSaving(false);
      return;
    }

    try {
      await updateBranchMenuItem({
        branch_id: branchId,
        menu_item_id: item.id,
        is_available: branchItem?.is_available ?? item.is_available,
        is_enabled: branchItem?.is_enabled ?? true,
        custom_price: priceValue,
      });
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan harga khusus.');
      setSaving(false);
      return;
    }

    triggerMenuRevalidate();
    onSaved();
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft-lg"
      >
        <div className="flex items-center justify-between mb-4 border-b border-coffee-50 pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-coffee-700" />
            <h3 className="font-bold text-coffee-900">Atur Harga Cabang</h3>
          </div>
          <button onClick={onClose} className="text-charcoal/40 hover:text-charcoal transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <ErrorAlert message={error} />}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-charcoal/50">Item Menu:</p>
            <p className="text-sm font-bold text-coffee-900 mt-0.5">{item.name}</p>
            <p className="text-xs text-charcoal/50 mt-1">
              Harga Master: <span className="font-bold text-coffee-800">{formatPrice(item.price)}</span>
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-coffee-50">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="radio"
                name="priceOption"
                checked={useDefault}
                onChange={() => setUseDefault(true)}
                className="text-coffee-700 accent-coffee-700"
              />
              <span className="text-sm text-charcoal font-medium">
                Gunakan Harga Master ({formatPrice(item.price)})
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="radio"
                name="priceOption"
                checked={!useDefault}
                onChange={() => setUseDefault(false)}
                className="text-coffee-700 accent-coffee-700"
              />
              <span className="text-sm text-charcoal font-medium">
                Gunakan Harga Khusus Cabang
              </span>
            </label>
          </div>

          {!useDefault && (
            <div className="pt-1">
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Nominal Harga Khusus (IDR) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-charcoal/40">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder={String(item.price)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t border-coffee-50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-coffee-100 text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Simpan</span>}
            </button>
          </div>
        </form>
      </motion.div>
    </ModalBackdrop>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      key="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-charcoal/30 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </motion.div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200/80 mb-4">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
