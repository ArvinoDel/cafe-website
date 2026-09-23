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
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';
import { fadeInUp, staggerContainer } from '@/lib/animations';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MenuCategory = 'kopi' | 'non-kopi' | 'makanan' | 'snack';

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: MenuCategory;
  image_url: string | null;
  badge: string | null;
  is_available: boolean;
  sort_order: number;
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
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );
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
        .then(({ data }) => {
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

      const { error: err } = await supabase.from('branch_menu_items').upsert(
        {
          branch_id: activeBranch,
          menu_item_id: item.id,
          is_available: nextAvailable,
          is_enabled: existingBranchRow?.is_enabled ?? true,
          custom_price: existingBranchRow?.custom_price ?? null,
        },
        { onConflict: 'branch_id,menu_item_id' },
      );

      if (err) {
        // Rollback
        setBranchItemMap((prev) => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            is_available: currentAvailable,
          },
        }));
        setError(err.message);
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

    const { error: err } = await supabase.from('branch_menu_items').upsert(
      {
        branch_id: activeBranch,
        menu_item_id: item.id,
        is_enabled: nextEnabled,
        is_available: existingBranchRow?.is_available ?? item.is_available,
        custom_price: existingBranchRow?.custom_price ?? null,
      },
      { onConflict: 'branch_id,menu_item_id' },
    );

    if (err) {
      setBranchItemMap((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          is_enabled: currentEnabled,
        },
      }));
      setError(err.message);
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

  const enabledCount = processedItems.filter((i) => i.is_enabled).length;
  const availableCount = processedItems.filter((i) => i.is_enabled && i.is_available).length;
  const outOfStockCount = processedItems.filter((i) => i.is_enabled && !i.is_available).length;

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
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-3.5 sm:p-4">
          <p className="text-[11px] font-bold text-charcoal/50 uppercase tracking-wide">
            {isBranchView ? 'Menu Disajikan' : 'Total Master Menu'}
          </p>
          <p className="text-lg sm:text-2xl font-extrabold text-coffee-900 mt-1">
            {isBranchView ? enabledCount : totalCount}
          </p>
        </div>
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
                onToggleAvailability={() => handleToggleAvailability(item)}
                onToggleEnabled={() => handleToggleEnabled(item)}
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
                    Item <span className="font-semibold text-coffee-800">"{deleteTarget.name}"</span> akan dihapus dari seluruh cabang.
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
    onToggleAvailability: () => void;
    onToggleEnabled: () => void;
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
    onToggleAvailability,
    onToggleEnabled,
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

          {/* Master Edit / Delete (Superadmin only) */}
          {isSuperadmin && !isBranchView && (
            <div className="flex items-center gap-1 flex-shrink-0">
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

// ─── Add / Edit Master Modal ──────────────────────────────────────────────────

function MenuItemFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: MenuItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabase();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState<number | string>(initial?.price ?? '');
  const [category, setCategory] = useState<MenuCategory>(initial?.category ?? 'kopi');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [badge, setBadge] = useState(initial?.badge ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0);
  const [isAvailable, setIsAvailable] = useState<boolean>(initial?.is_available ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: numericPrice,
      category,
      image_url: imageUrl.trim() || null,
      badge: badge.trim() || null,
      sort_order: Number(sortOrder) || 0,
      is_available: isAvailable,
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

    onSaved();
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-soft-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5 border-b border-coffee-50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-coffee-50 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-coffee-700" />
            </div>
            <h3 className="font-bold text-coffee-900 text-base">
              {initial ? 'Edit Master Menu' : 'Tambah Master Menu Baru'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-charcoal/35 hover:text-charcoal/60 transition-colors p-1 rounded-lg hover:bg-coffee-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <ErrorAlert message={error} />}

        <form onSubmit={handleSave} className="space-y-4">
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

          <div>
            <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
              URL Gambar (opsional)
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.pexels.com/..."
              className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Badge (opsional)
              </label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="Contoh: Bestseller, New"
                className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
              />
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

          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="w-4 h-4 rounded text-coffee-700 focus:ring-coffee-500 border-coffee-200 accent-coffee-700"
              />
              <span className="text-sm font-semibold text-coffee-900">
                Menu Aktif &amp; Tersedia secara Global
              </span>
            </label>
          </div>

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
        </form>
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

    const { error: err } = await supabase.from('branch_menu_items').upsert(
      {
        branch_id: branchId,
        menu_item_id: item.id,
        is_available: branchItem?.is_available ?? item.is_available,
        is_enabled: branchItem?.is_enabled ?? true,
        custom_price: priceValue,
      },
      { onConflict: 'branch_id,menu_item_id' },
    );

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

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
