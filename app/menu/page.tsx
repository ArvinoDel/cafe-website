'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Plus, Minus, ShoppingCart, X, ArrowLeft, Search, Lock, AlertCircle, Camera, Receipt, RefreshCw, CheckCircle2, MessageSquare, Pencil, Trash2, Clock } from 'lucide-react';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import QrScannerModal from '@/components/ui/QrScannerModal';
import WifiInfoCard from '@/components/ui/WifiInfoCard';
import ItemNoteModal from '@/components/ui/ItemNoteModal';
import TableRequestModal from '@/components/ui/TableRequestModal';
import { getItemLineKey, normalizeNote } from '@/lib/item-options';
import { CART_KEY } from '@/lib/cart';
import { useBrand } from '@/components/providers/BrandProvider';
import { fetchBranchMenu, type BranchMenuItem } from '@/lib/menu-availability';
import { useBranchInfo } from '@/lib/branch-info';
import { roundToFiveMinutes } from '@/lib/wait-time';

type MenuItem = BranchMenuItem;

type CartItem = MenuItem & {
  lineKey: string;
  quantity: number;
  note?: string | null;
};

const categories = [
  { id: 'all', label: 'Semua' },
  { id: 'kopi', label: 'Kopi' },
  { id: 'non-kopi', label: 'Non-Kopi' },
  { id: 'makanan', label: 'Makanan' },
  { id: 'snack', label: 'Snack' },
];

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

const TABLE_KEY = 'kopi-nako-table';
const BRANCH_KEY = 'kopi-nako-branch';

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brandName } = useBrand();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showQrGuide, setShowQrGuide] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [tableChangeNotice, setTableChangeNotice] = useState<string | null>(null);

  // Branch info (wifi, wait time, accepting_orders)
  const { info: branchInfo, refresh: refreshBranchInfo } = useBranchInfo(branchId);
  const isPaused = branchInfo?.accepting_orders === false;
  const pauseMsg = branchInfo?.pause_message || 'Maaf, pemesanan sedang dijeda sementara. Silakan hubungi barista ya.';

  // Note modal state
  const [noteModalTarget, setNoteModalTarget] = useState<{
    item: MenuItem;
    initialNote?: string;
    initialQuantity?: number;
    lineKeyToEdit?: string;
    isEditing: boolean;
  } | null>(null);

  // Restore cart from localStorage on mount (with lineKey backward compatibility)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCart(
            parsed.map((item: any) => ({
              ...item,
              lineKey: item.lineKey || getItemLineKey(item.id, item.note),
              note: item.note || undefined,
            })),
          );
        }
      }
    } catch {
      // ignore parse error
    }
  }, []);

  // Auto-dismiss table notice after 6 seconds
  useEffect(() => {
    if (!tableChangeNotice) return;
    const timer = setTimeout(() => {
      setTableChangeNotice(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [tableChangeNotice]);

  const handleScanSuccess = useCallback(
    (scanned: string, scannedBranchId: string | null) => {
      const prevTable = localStorage.getItem(TABLE_KEY);
      setTableNumber(scanned);
      localStorage.setItem(TABLE_KEY, scanned);
      if (scannedBranchId) {
        setBranchId(scannedBranchId);
        localStorage.setItem(BRANCH_KEY, scannedBranchId);
      }
      if (prevTable && prevTable !== scanned) {
        setTableChangeNotice(
          `Meja berhasil dipindahkan dari Meja ${prevTable} ke Meja ${scanned}! Keranjang belanja kamu tetap tersimpan.`,
        );
      } else {
        setTableChangeNotice(`Terhubung ke Meja ${scanned}! Selamat memesan.`);
      }
      const url = scannedBranchId
        ? `/menu?table=${scanned}&branch=${scannedBranchId}`
        : `/menu?table=${scanned}`;
      router.replace(url);
    },
    [router],
  );

  // Table-aware QR: `/menu?table=A-12&branch=<uuid>` from a scanned table QR code wins and
  // is remembered; otherwise fall back to whatever table/branch was set last time.
  // Users cannot manually edit the table code; it must come from QR scanning.
  useEffect(() => {
    const fromQr = searchParams.get('table');
    const fromBranch = searchParams.get('branch');
    if (fromQr && fromQr.trim()) {
      const clean = fromQr.trim().toUpperCase();
      const stored = localStorage.getItem(TABLE_KEY);
      if (stored && stored !== clean) {
        setTableChangeNotice(
          `Meja berhasil dipindahkan dari Meja ${stored} ke Meja ${clean}! Keranjang belanja kamu tetap tersimpan.`,
        );
      }
      setTableNumber(clean);
      localStorage.setItem(TABLE_KEY, clean);
    } else {
      const stored = localStorage.getItem(TABLE_KEY);
      if (stored) setTableNumber(stored);
    }
    if (fromBranch && fromBranch.trim()) {
      setBranchId(fromBranch.trim());
      localStorage.setItem(BRANCH_KEY, fromBranch.trim());
    } else {
      const storedBranch = localStorage.getItem(BRANCH_KEY);
      if (storedBranch) setBranchId(storedBranch);
    }
  }, [searchParams]);

  const fetchMenu = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const data = await fetchBranchMenu(branchId);
        setItems(data);
        setMenuLoaded(true);
        setError(null);
      } catch {
        setError('Gagal memuat menu. Coba lagi nanti.');
        setMenuLoaded(false);
      } finally {
        setLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // Refetch menu when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMenu(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchMenu]);

  // Refresh branch info (accepting_orders) every 60s and on tab visibility
  useEffect(() => {
    const interval = setInterval(() => {
      refreshBranchInfo();
    }, 60_000);

    const handleVisible = () => {
      if (document.visibilityState === 'visible') refreshBranchInfo();
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [refreshBranchInfo]);

  const filteredItems = items.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesCategory && matchesSearch;
  });

  // Sold-out items stay searchable and stay in their category, but are listed after available ones (stable sort)
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.sold_out === b.sold_out) return 0;
    return a.sold_out ? 1 : -1;
  });

  // Mark cart lines whose menu id is sold out OR missing from loaded list as unavailable
  const isLineUnavailable = useCallback(
    (itemId: string) => {
      if (!menuLoaded || loading || Boolean(error)) return false;
      const menuItem = items.find((i) => i.id === itemId);
      return !menuItem || menuItem.sold_out;
    },
    [menuLoaded, loading, error, items],
  );

  const hasUnavailableItems =
    menuLoaded && !loading && !error && cart.some((c) => isLineUnavailable(c.id));

  const removeUnavailableItems = useCallback(() => {
    setCart((prev) => {
      const next = prev.filter((c) => !isLineUnavailable(c.id));
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [isLineUnavailable]);

  const addToCartWithNote = useCallback(
    (item: MenuItem, note?: string | null, qty = 1) => {
      // Defense in depth: refuse sold-out items
      if (item.sold_out) return;

      const cleanNote = normalizeNote(note);
      const lineKey = getItemLineKey(item.id, cleanNote);

      setCart((prev) => {
        const existing = prev.find((c) => c.lineKey === lineKey);
        let next: CartItem[];
        if (existing) {
          next = prev.map((c) =>
            c.lineKey === lineKey ? { ...c, quantity: c.quantity + qty } : c,
          );
        } else {
          next = [
            ...prev,
            {
              ...item,
              lineKey,
              quantity: qty,
              note: cleanNote || undefined,
            },
          ];
        }
        try {
          localStorage.setItem(CART_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  const addToCart = useCallback(
    (item: MenuItem) => {
      // Defense in depth: refuse sold-out items
      if (item.sold_out) return;
      addToCartWithNote(item, null, 1);
    },
    [addToCartWithNote],
  );

  const removeFromCart = useCallback((lineKey: string) => {
    setCart((prev) => {
      const next = prev.filter((c) => c.lineKey !== lineKey);
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const updateQuantity = useCallback((lineKey: string, delta: number) => {
    setCart((prev) => {
      const next = prev
        .map((c) => (c.lineKey === lineKey ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0);
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const editCartItemNote = useCallback((oldLineKey: string, newNote: string) => {
    const cleanNote = normalizeNote(newNote);
    setCart((prev) => {
      const target = prev.find((c) => c.lineKey === oldLineKey);
      if (!target) return prev;

      const newLineKey = getItemLineKey(target.id, cleanNote);
      let next: CartItem[];

      if (oldLineKey === newLineKey) {
        return prev;
      }

      // If another line already has this exact lineKey, merge quantities
      const existingWithNewKey = prev.find((c) => c.lineKey === newLineKey);
      if (existingWithNewKey) {
        next = prev
          .filter((c) => c.lineKey !== oldLineKey)
          .map((c) =>
            c.lineKey === newLineKey
              ? { ...c, quantity: c.quantity + target.quantity }
              : c,
          );
      } else {
        next = prev.map((c) =>
          c.lineKey === oldLineKey
            ? { ...c, lineKey: newLineKey, note: cleanNote || undefined }
            : c,
        );
      }

      try {
        localStorage.setItem(CART_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const goToCheckout = useCallback(() => {
    if (hasUnavailableItems) return;
    if (isPaused) return;
    if (!tableNumber) {
      setScannerOpen(true);
      return;
    }
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(TABLE_KEY, tableNumber);
    if (branchId) localStorage.setItem(BRANCH_KEY, branchId);

    const params = new URLSearchParams();
    if (tableNumber) params.set('table', tableNumber);
    if (branchId) params.set('branch', branchId);
    const qs = params.toString();
    router.push(qs ? `/checkout?${qs}` : '/checkout');
  }, [cart, tableNumber, branchId, router, hasUnavailableItems, isPaused]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a
              href="/"
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm hidden sm:inline">Kembali ke Home</span>
            </a>

            <div className="flex items-center gap-2">
              {tableNumber ? (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coffee-50 border border-coffee-200/70 text-coffee-800 text-xs sm:text-sm font-semibold hover:bg-coffee-100/80 transition-all active:scale-95 group"
                  title={`Terhubung ke Meja ${tableNumber}. Klik untuk scan meja baru jika pindah meja.`}
                >
                  <QrCode className="w-4 h-4 text-coffee-600" />
                  <span className="hidden sm:inline">Meja {tableNumber}</span>
                  <span className="sm:hidden">{tableNumber}</span>
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-coffee-700 font-medium bg-coffee-100/90 px-1.5 py-0.5 rounded border border-coffee-200/50 ml-0.5 group-hover:bg-coffee-200/70">
                    <RefreshCw className="w-2.5 h-2.5 text-coffee-600" /> Pindah
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-800 text-xs sm:text-sm font-medium hover:bg-amber-100/70 transition-colors"
                  title="Scan QR code di meja untuk memesan"
                >
                  <Camera className="w-4 h-4 text-amber-600" />
                  <span className="hidden sm:inline">Scan Meja</span>
                  <span className="sm:hidden">Scan</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/orders')}
                className="flex items-center justify-center gap-1.5 px-3 h-10 rounded-xl bg-coffee-50 border border-coffee-200/70 text-coffee-800 hover:bg-coffee-100/70 transition-colors active:scale-95"
                title="Riwayat Pesanan Saya"
                aria-label="Riwayat Pesanan"
              >
                <Receipt className="w-4 h-4 text-coffee-700" />
                <span className="hidden sm:inline text-xs font-bold text-coffee-900">Riwayat</span>
              </button>

              <button
                onClick={() => setCartOpen(true)}
                className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-coffee-700 text-cream hover:bg-coffee-800 transition-colors active:scale-95"
                aria-label="Cart"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table status banner */}
      {tableNumber ? (
        <div className="bg-coffee-50/70 border-b border-coffee-100/60 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs text-coffee-800">
            <div className="flex items-center gap-2">
              <QrCode className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
              <span>
                Terhubung ke <strong>Meja {tableNumber}</strong> via scan QR code.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="hidden sm:inline text-[11px] text-coffee-600/70">Pindah tempat?</span>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-coffee-100 hover:bg-coffee-200/80 text-coffee-900 font-bold text-xs transition-colors active:scale-95 shadow-2xs"
                title="Pindah meja dan scan stiker QR di meja baru"
              >
                <RefreshCw className="w-3 h-3 text-coffee-700" />
                <span>Pindah Meja</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50/90 border-b border-amber-200/60 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Belum scan QR meja.</strong> Pemesanan hanya dapat dilakukan setelah memindai QR code di meja.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors shadow-soft"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan di Web</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrGuide(true)}
                className="whitespace-nowrap font-bold underline hover:text-amber-950 text-xs"
              >
                Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause banner — ordering temporarily closed */}
      {isPaused && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border-b-2 border-amber-300 px-4 py-3"
        >
          <div className="max-w-7xl mx-auto flex items-start gap-2.5 text-sm text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Pemesanan Sedang Dijeda ☕</strong>{' '}
              <span className="font-normal">{pauseMsg}</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Table change toast / notice */}
      <AnimatePresence>
        {tableChangeNotice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 text-emerald-900 text-xs sm:text-sm overflow-hidden"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="font-semibold">{tableChangeNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setTableChangeNotice(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1 flex-shrink-0"
                aria-label="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero header */}
      <div className="bg-gradient-to-b from-sand-100/60 to-cream pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-sm font-semibold text-coffee-600 uppercase tracking-wider">
              Menu {brandName}
            </span>
            <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight">
              Pilih kesukaanmu
            </h1>
            <p className="mt-3 text-charcoal/60 text-base sm:text-lg max-w-2xl">
              Scan barcode di meja, pilih menu, bayar dari HP. Pesanan
              langsung dibuat barista dan diantar ke meja kamu.
            </p>

            {/* Smart queue wait time display */}
            {branchInfo?.est_wait_minutes && branchInfo.est_wait_minutes > 0 && branchInfo.est_wait_now != null && (
              <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-coffee-200/80 shadow-2xs text-xs font-semibold text-coffee-900">
                <Clock className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
                <span>
                  {(branchInfo.queue_count ?? 0) > 0
                    ? `Antrean saat ini: ${branchInfo.queue_count} pesanan · perkiraan ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`
                    : `Perkiraan waktu tunggu: ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`}
                </span>
              </div>
            )}

            {/* Wi-Fi & Jam Buka card — only shown when a branch is known */}
            {/* {branchId && (
              <div className="mt-5 max-w-md">
                <WifiInfoCard branchId={branchId} />
              </div>
            )} */}
          </motion.div>

          {/* Search */}
          <div className="relative mt-6 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal/40" />
            <input
              type="text"
              placeholder="Cari menu... (kopi, nasi, lassi)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-white border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="sticky top-16 z-30 bg-cream/90 backdrop-blur-md border-b border-coffee-100/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  activeCategory === cat.id
                    ? 'bg-coffee-700 text-cream shadow-soft'
                    : 'bg-white text-charcoal/60 hover:bg-coffee-50 border border-coffee-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-coffee-100/80 animate-pulse">
                <div className="aspect-[4/5] bg-coffee-50" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-coffee-50 rounded w-3/4" />
                  <div className="h-3 bg-coffee-50 rounded w-full" />
                  <div className="h-3 bg-coffee-50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-charcoal/60 text-lg">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-3 rounded-xl bg-coffee-700 text-cream font-semibold hover:bg-coffee-800 transition-colors"
            >
              Coba lagi
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-charcoal/50 text-lg">Menu tidak ditemukan. Coba kata kunci lain.</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          >
            {sortedItems.map((item) => (
              <motion.div
                key={item.id}
                variants={fadeInUp}
                whileHover={item.sold_out ? undefined : { y: -6 }}
                className={`group bg-white rounded-2xl overflow-hidden border border-coffee-100/80 transition-shadow duration-300 flex flex-col ${
                  item.sold_out ? 'opacity-75' : 'hover:shadow-soft-lg'
                }`}
                aria-disabled={item.sold_out ? true : undefined}
                aria-label={item.sold_out ? `${item.name}, habis` : undefined}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-coffee-50">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className={`w-full h-full object-cover transition-transform duration-500 ${
                        item.sold_out ? 'grayscale contrast-75 opacity-70' : 'group-hover:scale-110'
                      }`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-coffee-200">
                      <QrCode className="w-12 h-12" />
                    </div>
                  )}
                  {item.sold_out ? (
                    <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold bg-charcoal/85 text-white backdrop-blur-sm shadow-xs border border-white/20 flex items-center gap-1">
                      Habis
                    </span>
                  ) : item.badge ? (
                    <span
                      className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
                        item.badge === 'Bestseller'
                          ? 'bg-coffee-700 text-cream'
                          : 'bg-sand-300 text-coffee-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3
                    className={`font-bold text-base leading-snug mb-1 ${
                      item.sold_out ? 'text-charcoal/40' : 'text-coffee-900'
                    }`}
                  >
                    {item.name}
                  </h3>
                  <p
                    className={`text-sm leading-relaxed mb-4 line-clamp-2 flex-1 ${
                      item.sold_out ? 'text-charcoal/35' : 'text-charcoal/50'
                    }`}
                  >
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-lg font-extrabold ${
                        item.sold_out ? 'text-charcoal/40' : 'text-coffee-700'
                      }`}
                    >
                      {formatPrice(item.price)}
                    </span>
                    {item.sold_out ? (
                      <span
                        className="px-3 py-1.5 rounded-xl bg-charcoal/10 text-charcoal/50 text-xs font-bold cursor-not-allowed select-none"
                        aria-hidden="true"
                      >
                        Habis
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isPaused}
                          onClick={() =>
                            !isPaused &&
                            setNoteModalTarget({
                              item,
                              initialNote: '',
                              isEditing: false,
                            })
                          }
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors active:scale-95 ${
                            isPaused
                              ? 'bg-charcoal/10 text-charcoal/35 cursor-not-allowed'
                              : 'bg-coffee-50/80 hover:bg-coffee-100 text-coffee-700'
                          }`}
                          title={isPaused ? 'Pemesanan sedang dijeda' : 'Atur catatan (gula, es, level pedas, dll)'}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Catatan</span>
                        </button>
                        <button
                          disabled={isPaused}
                          onClick={() => !isPaused && addToCart(item)}
                          className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all active:scale-90 ${
                            isPaused
                              ? 'bg-charcoal/10 text-charcoal/35 cursor-not-allowed'
                              : 'bg-coffee-50 text-coffee-700 hover:bg-coffee-700 hover:text-cream'
                          }`}
                          aria-label={isPaused ? 'Pemesanan dijeda' : `Tambah ${item.name} ke keranjang`}
                          title={isPaused ? 'Pemesanan sedang dijeda' : 'Tambah langsung'}
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Cart drawer */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-cream z-50 flex flex-col shadow-soft-xl"
            >
              {/* Cart header */}
              <div className="flex items-center justify-between p-5 border-b border-coffee-100">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-coffee-700" />
                  <h2 className="text-lg font-bold text-coffee-900">Pesanan kamu</h2>
                  {cartCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-coffee-100 text-coffee-700 text-xs font-bold">
                      {cartCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCartOpen(false)}
                  className="w-9 h-9 rounded-lg hover:bg-coffee-50 flex items-center justify-center text-coffee-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto p-5">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mb-4">
                      <ShoppingCart className="w-8 h-8 text-coffee-300" />
                    </div>
                    <p className="text-charcoal/50 font-medium">Pesanan masih kosong</p>
                    <p className="text-charcoal/40 text-sm mt-1">Pilih menu di atas untuk mulai</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cart.map((item) => {
                      const unavailable = isLineUnavailable(item.id);
                      return (
                        <div
                          key={item.lineKey}
                          className={`flex flex-col gap-2 rounded-xl p-3 border shadow-soft transition-colors ${
                            unavailable
                              ? 'bg-stone-50 border-stone-200/80'
                              : 'bg-white border-coffee-100/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
                              {item.image_url && (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className={`w-full h-full object-cover ${
                                    unavailable ? 'grayscale contrast-75 opacity-70' : ''
                                  }`}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p
                                  className={`font-semibold text-sm truncate ${
                                    unavailable ? 'text-charcoal/50' : 'text-coffee-900'
                                  }`}
                                >
                                  {item.name}
                                </p>
                                {unavailable && (
                                  <span className="px-2 py-0.5 rounded-md bg-charcoal/10 text-charcoal/70 border border-charcoal/20 text-[10px] font-bold uppercase tracking-wider">
                                    Habis
                                  </span>
                                )}
                              </div>
                              <p
                                className={`text-sm font-bold ${
                                  unavailable ? 'text-charcoal/40 line-through' : 'text-coffee-600'
                                }`}
                              >
                                {formatPrice(item.price)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateQuantity(item.lineKey, -1)}
                                className="w-8 h-8 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                                title="Kurangi"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="font-bold text-coffee-900 w-6 text-center">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(item.lineKey, 1)}
                                disabled={unavailable}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                  unavailable
                                    ? 'bg-coffee-50/40 text-charcoal/25 cursor-not-allowed'
                                    : 'bg-coffee-50 text-coffee-700 hover:bg-coffee-100 active:scale-90'
                                }`}
                                title={unavailable ? 'Menu habis' : 'Tambah'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Note badge / Add note trigger */}
                          <div className="flex items-center justify-between pt-1 border-t border-coffee-50 text-xs">
                            {item.note ? (
                              <button
                                type="button"
                                disabled={unavailable}
                                onClick={() =>
                                  setNoteModalTarget({
                                    item,
                                    initialNote: item.note || '',
                                    lineKeyToEdit: item.lineKey,
                                    isEditing: true,
                                  })
                                }
                                className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-left transition-colors max-w-full ${
                                  unavailable
                                    ? 'text-charcoal/40 bg-stone-100 border border-stone-200 cursor-not-allowed'
                                    : 'text-amber-800 bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200/60'
                                }`}
                                title={unavailable ? 'Menu habis' : 'Klik untuk ubah catatan'}
                              >
                                <MessageSquare className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                <span className="truncate">{item.note}</span>
                                {!unavailable && (
                                  <Pencil className="w-2.5 h-2.5 text-amber-600/70 ml-1 flex-shrink-0" />
                                )}
                              </button>
                            ) : (
                              !unavailable && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNoteModalTarget({
                                      item,
                                      initialNote: '',
                                      lineKeyToEdit: item.lineKey,
                                      isEditing: true,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-coffee-600 hover:text-coffee-800 hover:bg-coffee-50 px-2 py-0.5 rounded transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Tambah Catatan (less sugar, es, dll)</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cart footer */}
              {cart.length > 0 && (
                <div className="border-t border-coffee-100 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-charcoal/60 text-sm">Total</span>
                    <span className="text-2xl font-extrabold text-coffee-800">
                      {formatPrice(cartTotal)}
                    </span>
                  </div>

                  {hasUnavailableItems && (
                    <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs space-y-2.5">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <span className="font-semibold leading-relaxed">
                          Ada menu yang habis di keranjang. Hapus dulu ya.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={removeUnavailableItems}
                        className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus yang habis</span>
                      </button>
                    </div>
                  )}

                  {tableNumber ? (
                    <>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-coffee-50 text-coffee-700 text-xs">
                        <div className="flex items-center gap-2">
                          <QrCode className="w-4 h-4 flex-shrink-0 text-coffee-600" />
                          <span>
                            Pesanan untuk <strong className="font-bold text-coffee-900">Meja {tableNumber}</strong>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCartOpen(false);
                            setScannerOpen(true);
                          }}
                          className="inline-flex items-center gap-1 font-bold text-coffee-700 hover:text-coffee-950 bg-coffee-100 hover:bg-coffee-200/80 px-2 py-0.5 rounded text-[11px] transition-colors whitespace-nowrap"
                          title="Pindah meja dan scan stiker QR di meja baru"
                        >
                          <RefreshCw className="w-2.5 h-2.5" /> Ganti
                        </button>
                      </div>
                      <button
                        onClick={goToCheckout}
                        disabled={hasUnavailableItems || isPaused}
                        className={`w-full py-4 rounded-xl font-bold transition-colors shadow-soft ${
                          hasUnavailableItems || isPaused
                            ? 'bg-charcoal/20 text-charcoal/40 cursor-not-allowed'
                            : 'bg-coffee-700 text-cream hover:bg-coffee-800 active:scale-95'
                        }`}
                      >
                        {isPaused ? 'Pemesanan Sedang Dijeda' : `Pesan Sekarang — ${formatPrice(cartTotal)}`}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Scan QR di Mejamu</p>
                          <p className="text-amber-800/80 mt-0.5">
                            Pemesanan hanya dapat diproses setelah memindai QR code di meja.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScannerOpen(true)}
                        className="w-full py-4 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-soft"
                      >
                        <Camera className="w-4 h-4" />
                        Scan QR Meja Sekarang
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* QR Scan Guide Modal */}
      <AnimatePresence>
        {showQrGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowQrGuide(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-soft-xl border border-coffee-100 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-amber-700" />
              </div>

              <h3 className="text-lg font-bold text-coffee-900">
                Pindai QR Code di Meja
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-charcoal/70 leading-relaxed">
                Pemesanan hanya dapat dilakukan dengan memindai kode QR yang ada di mejamu agar pesanan langsung diantar ke tempat dudukmu.
              </p>

              <div className="mt-5 space-y-2.5 text-left bg-coffee-50/70 rounded-2xl p-4 text-xs text-coffee-900">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-coffee-700 text-cream text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Duduk di salah satu meja {brandName} yang tersedia.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-coffee-700 text-cream text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </span>
                  <span>Scan QR code meja langsung lewat kamera website ini atau kamera HP.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-coffee-700 text-cream text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </span>
                  <span>Menu akan otomatis terhubung dengan nomor mejamu dan siap dipesan!</span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQrGuide(false);
                    setScannerOpen(true);
                  }}
                  className="w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-soft"
                >
                  <Camera className="w-4 h-4" />
                  Buka Scanner Kamera Web
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrGuide(false)}
                  className="w-full py-2.5 rounded-xl text-charcoal/60 hover:text-charcoal font-semibold text-xs transition-colors"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        currentTable={tableNumber}
        title={tableNumber ? 'Scan QR Meja Baru' : 'Scan QR Code Meja'}
        subtitle={
          tableNumber
            ? `Saat ini terhubung ke Meja ${tableNumber}. Arahkan kamera ke stiker QR meja baru.`
            : 'Arahkan kamera ke stiker QR di meja untuk memesan'
        }
      />

      {/* Floating cart button (mobile) */}
      {cartCount > 0 && !cartOpen && (
        <motion.button
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 sm:hidden flex items-center gap-3 px-5 py-4 rounded-2xl bg-coffee-700 text-cream shadow-soft-lg z-40 active:scale-95"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-bold">{cartCount} item</span>
          <span className="font-bold">{formatPrice(cartTotal)}</span>
        </motion.button>
      )}

      {/* Item Note / Customization Modal */}
      <ItemNoteModal
        isOpen={Boolean(noteModalTarget)}
        item={noteModalTarget?.item ?? null}
        initialNote={noteModalTarget?.initialNote ?? ''}
        initialQuantity={noteModalTarget?.initialQuantity ?? 1}
        isEditing={noteModalTarget?.isEditing ?? false}
        onClose={() => setNoteModalTarget(null)}
        onConfirm={(confirmedNote, quantity) => {
          if (!noteModalTarget) return;
          if (noteModalTarget.isEditing && noteModalTarget.lineKeyToEdit) {
            editCartItemNote(noteModalTarget.lineKeyToEdit, confirmedNote);
          } else {
            addToCartWithNote(noteModalTarget.item, confirmedNote, quantity);
          }
        }}
      />

      {/* Table service request button & sheet (only when table is known) */}
      {tableNumber && (
        <TableRequestModal
          tableNumber={tableNumber}
          branchId={branchId}
          positionClassName="bottom-6 left-4 sm:left-6"
        />
      )}
    </div>
  );
}
