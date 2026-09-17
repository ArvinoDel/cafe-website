'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Plus, Minus, ShoppingCart, X, ArrowLeft, Search, Lock, AlertCircle, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import QrScannerModal from '@/components/ui/QrScannerModal';

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  badge: string | null;
  is_available: boolean;
  sort_order: number;
};

type CartItem = MenuItem & { quantity: number };

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

const CART_KEY = 'kopi-nako-cart';
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
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showQrGuide, setShowQrGuide] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleScanSuccess = useCallback(
    (scanned: string, scannedBranchId: string | null) => {
      setTableNumber(scanned);
      localStorage.setItem(TABLE_KEY, scanned);
      if (scannedBranchId) {
        setBranchId(scannedBranchId);
        localStorage.setItem(BRANCH_KEY, scannedBranchId);
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

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);
      if (branchId) {
        // Fetch branch-specific overrides
        const [menuRes, branchMenuRes] = await Promise.all([
          supabase
            .from('menu_items')
            .select('*')
            .order('sort_order', { ascending: true }),
          supabase
            .from('branch_menu_items')
            .select('*')
            .eq('branch_id', branchId),
        ]);

        if (menuRes.error) {
          setError('Gagal memuat menu. Coba lagi nanti.');
        } else {
          const rawItems = (menuRes.data || []) as MenuItem[];
          const branchRows = (branchMenuRes.data || []) as {
            menu_item_id: string;
            is_available: boolean;
            is_enabled: boolean;
            custom_price: number | null;
          }[];

          const branchMap = new Map(branchRows.map((r) => [r.menu_item_id, r]));

          const branchItems = rawItems
            .filter((item) => {
              const bRow = branchMap.get(item.id);
              if (bRow) {
                return bRow.is_enabled && bRow.is_available;
              }
              return item.is_available;
            })
            .map((item) => {
              const bRow = branchMap.get(item.id);
              if (bRow && bRow.custom_price != null) {
                return { ...item, price: bRow.custom_price };
              }
              return item;
            });

          setItems(branchItems);
        }
      } else {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('is_available', true)
          .order('sort_order', { ascending: true });

        if (error) {
          setError('Gagal memuat menu. Coba lagi nanti.');
        } else {
          setItems(data || []);
        }
      }
      setLoading(false);
    }
    fetchMenu();
  }, [branchId]);

  const filteredItems = items.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesCategory && matchesSearch;
  });

  const addToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  }, []);

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const goToCheckout = useCallback(() => {
    if (!tableNumber) {
      setScannerOpen(true);
      return;
    }
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(TABLE_KEY, tableNumber);
    if (branchId) localStorage.setItem(BRANCH_KEY, branchId);
    router.push('/checkout');
  }, [cart, tableNumber, branchId, router]);

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
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coffee-50 border border-coffee-200/70 text-coffee-800 text-xs sm:text-sm font-semibold select-none"
                  title={`Terverifikasi dari QR Meja ${tableNumber}`}
                >
                  <QrCode className="w-4 h-4 text-coffee-600" />
                  <span className="hidden sm:inline">Meja {tableNumber}</span>
                  <span className="sm:hidden">{tableNumber}</span>
                  <Lock className="w-3 h-3 text-coffee-400 ml-0.5" />
                </div>
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

      {/* Table status banner */}
      {tableNumber ? (
        <div className="bg-coffee-50/70 border-b border-coffee-100/60 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs text-coffee-800">
            <div className="flex items-center gap-2">
              <QrCode className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
              <span>
                Terhubung ke <strong>Meja {tableNumber}</strong> via scan QR code.
              </span>
            </div>
            <span className="text-[11px] text-coffee-600/80 flex items-center gap-1 font-medium select-none">
              <Lock className="w-3 h-3" /> Terkunci otomatis
            </span>
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

      {/* Hero header */}
      <div className="bg-gradient-to-b from-sand-100/60 to-cream pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-sm font-semibold text-coffee-600 uppercase tracking-wider">
              Menu Nako
            </span>
            <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-coffee-900 tracking-tight">
              Pilih kesukaanmu
            </h1>
            <p className="mt-3 text-charcoal/60 text-base sm:text-lg max-w-2xl">
              Scan barcode di meja, pilih menu, bayar dari HP. Pesanan
              langsung dibuat barista dan diantar ke meja kamu.
            </p>
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
            {filteredItems.map((item) => (
              <motion.div
                key={item.id}
                variants={fadeInUp}
                whileHover={{ y: -6 }}
                className="group bg-white rounded-2xl overflow-hidden border border-coffee-100/80 hover:shadow-soft-lg transition-shadow duration-300 flex flex-col"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-coffee-50">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-coffee-200">
                      <QrCode className="w-12 h-12" />
                    </div>
                  )}
                  {item.badge && (
                    <span
                      className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold ${
                        item.badge === 'Bestseller'
                          ? 'bg-coffee-700 text-cream'
                          : 'bg-sand-300 text-coffee-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-bold text-coffee-900 text-base leading-snug mb-1">
                    {item.name}
                  </h3>
                  <p className="text-sm text-charcoal/50 leading-relaxed mb-4 line-clamp-2 flex-1">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-extrabold text-coffee-700">
                      {formatPrice(item.price)}
                    </span>
                    <button
                      onClick={() => addToCart(item)}
                      className="flex items-center justify-center w-9 h-9 rounded-xl bg-coffee-50 text-coffee-700 hover:bg-coffee-700 hover:text-cream transition-all active:scale-90"
                      aria-label={`Add ${item.name} to cart`}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
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
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-white rounded-xl p-3 border border-coffee-100/60"
                      >
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-coffee-900 text-sm truncate">
                            {item.name}
                          </p>
                          <p className="text-coffee-600 text-sm font-bold">
                            {formatPrice(item.price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-8 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-bold text-coffee-900 w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-8 h-8 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
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

                  {tableNumber ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-coffee-50 text-coffee-700 text-xs">
                        <QrCode className="w-4 h-4 flex-shrink-0" />
                        <span>
                          Pesanan akan dikirim ke <strong className="font-bold text-coffee-900">Meja {tableNumber}</strong>
                        </span>
                        <Lock className="w-3 h-3 text-coffee-400 ml-auto" />
                      </div>
                      <button
                        onClick={goToCheckout}
                        className="w-full py-4 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95 shadow-soft"
                      >
                        Pesan Sekarang — {formatPrice(cartTotal)}
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
                  <span>Duduk di salah satu meja Kopi Nako yang tersedia.</span>
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
    </div>
  );
}
