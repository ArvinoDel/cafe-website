'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Coffee,
  Receipt,
  Search,
  RefreshCw,
  ExternalLink,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Plus,
  ShoppingBag,
  CreditCard,
  Wallet,
} from 'lucide-react';
import {
  getStoredOrderCodes,
  saveOrderToHistory,
  removeOrderFromHistory,
  clearAllOrderHistory,
} from '@/lib/order-history';
import { supabase } from '@/lib/supabase-client';
import { fadeInUp, staggerContainer } from '@/lib/animations';

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type CustomerOrder = {
  id: string;
  order_code: string;
  customer_name: string;
  table_number: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'qris';
  notes: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
};

const STATUS_LABELS: Record<CustomerOrder['status'], string> = {
  pending: 'Diterima',
  preparing: 'Sedang Disiapkan',
  ready: 'Siap Diantar',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const STATUS_COLORS: Record<CustomerOrder['status'], { badge: string; dot: string; pulse?: boolean }> = {
  pending: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
    dot: 'bg-amber-500',
    pulse: true,
  },
  preparing: {
    badge: 'bg-blue-50 text-blue-800 border-blue-200/80',
    dot: 'bg-blue-500',
    pulse: true,
  },
  ready: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    dot: 'bg-emerald-500',
    pulse: true,
  },
  completed: {
    badge: 'bg-coffee-50 text-coffee-800 border-coffee-200/80',
    dot: 'bg-coffee-600',
  },
  cancelled: {
    badge: 'bg-red-50 text-red-700 border-red-200/80',
    dot: 'bg-red-500',
  },
};

function formatPrice(n: number): string {
  return 'Rp ' + (n || 0).toLocaleString('id-ID') + ',-';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

export default function CustomerOrderHistoryPage() {
  const router = useRouter();

  const [codes, setCodes] = useState<string[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Manual code tracking input
  const [searchCode, setSearchCode] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSuccess, setSearchSuccess] = useState<string | null>(null);

  // Tab filter
  const [tab, setTab] = useState<'all' | 'active' | 'completed'>('all');

  // Load order codes from localStorage
  const loadCodes = useCallback(() => {
    const list = getStoredOrderCodes();
    setCodes(list);
    return list;
  }, []);

  // Fetch full details of saved orders
  const fetchOrders = useCallback(
    async (orderCodesToFetch?: string[]) => {
      const targetCodes = orderCodesToFetch ?? codes;
      if (targetCodes.length === 0) {
        setOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        // Attempt 1: Direct Supabase query
        const { data, error } = await supabase
          .from('orders')
          .select('id, order_code, customer_name, table_number, items, subtotal, total, payment_method, notes, status, created_at')
          .in('order_code', targetCodes)
          .order('created_at', { ascending: false });

        if (data && !error && data.length > 0) {
          setOrders(data as CustomerOrder[]);
          setLastUpdated(new Date());
          setLoading(false);
          setRefreshing(false);
          return;
        }

        // Attempt 2: Server API batch lookup
        const res = await fetch(`/api/orders/lookup?codes=${encodeURIComponent(targetCodes.join(','))}`);
        if (res.ok) {
          const json = await res.json();
          if (json?.orders) {
            setOrders(json.orders as CustomerOrder[]);
            setLastUpdated(new Date());
            setLoading(false);
            setRefreshing(false);
            return;
          }
        }

        // Attempt 3: Local storage snapshots fallback
        const localOrders: CustomerOrder[] = [];
        targetCodes.forEach((c) => {
          try {
            const raw = localStorage.getItem('kopi-nako-order-' + c);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.order_code) localOrders.push(parsed);
            }
          } catch {}
        });

        if (localOrders.length > 0) {
          setOrders(localOrders);
        }
      } catch (err) {
        console.error('Error fetching order history:', err);
      } finally {
        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
      }
    },
    [codes],
  );

  // Initialize on mount
  useEffect(() => {
    const initialCodes = loadCodes();
    fetchOrders(initialCodes);
  }, [loadCodes, fetchOrders]);

  // Periodic polling for active orders
  useEffect(() => {
    const hasActiveOrders = orders.some((o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready');
    if (!hasActiveOrders) return;

    const timer = setInterval(() => {
      fetchOrders();
    }, 12000);

    return () => clearInterval(timer);
  }, [orders, fetchOrders]);

  // Handle manual code addition
  async function handleAddCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = searchCode.trim().toUpperCase();
    if (!clean) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchSuccess(null);

    try {
      // Look up order from API
      const res = await fetch(`/api/orders/lookup?code=${encodeURIComponent(clean)}`);
      if (!res.ok) {
        setSearchError(`Pesanan dengan kode "${clean}" tidak ditemukan.`);
        setSearchLoading(false);
        return;
      }

      const json = await res.json();
      if (!json?.order) {
        setSearchError(`Pesanan dengan kode "${clean}" tidak ditemukan.`);
        setSearchLoading(false);
        return;
      }

      const newOrder = json.order as CustomerOrder;
      const updatedCodes = saveOrderToHistory(clean);
      setCodes(updatedCodes);
      setOrders((prev) => [newOrder, ...prev.filter((o) => o.order_code !== clean)]);
      setSearchSuccess(`Pesanan #${clean} berhasil ditambahkan ke riwayat.`);
      setSearchCode('');
    } catch {
      setSearchError('Gagal memeriksa kode pesanan. Coba lagi.');
    } finally {
      setSearchLoading(false);
    }
  }

  // Remove individual order from device history
  function handleRemove(codeToRemove: string) {
    if (confirm(`Hapus pesanan #${codeToRemove} dari riwayat perangkat ini?`)) {
      const updatedCodes = removeOrderFromHistory(codeToRemove);
      setCodes(updatedCodes);
      setOrders((prev) => prev.filter((o) => o.order_code !== codeToRemove));
    }
  }

  // Filter orders by tab
  const filteredOrders = useMemo(() => {
    if (tab === 'active') {
      return orders.filter((o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready');
    }
    if (tab === 'completed') {
      return orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');
    }
    return orders;
  }, [orders, tab]);

  const activeCount = orders.filter((o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready').length;

  return (
    <div className="min-h-screen bg-cream text-charcoal pb-16">
      {/* Top sticky navigation bar */}
      <header className="sticky top-0 z-40 bg-cream/85 backdrop-blur-xl border-b border-coffee-100/60 shadow-soft">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push('/menu')}
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors py-2 active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Kembali</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-coffee-700 text-cream flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
              <h1 className="font-extrabold text-coffee-900 text-base sm:text-lg">Riwayat Pesanan</h1>
            </div>

            <button
              onClick={() => {
                setRefreshing(true);
                fetchOrders();
              }}
              disabled={refreshing || loading}
              className="p-2 text-coffee-600 hover:text-coffee-900 hover:bg-coffee-100/60 rounded-xl transition-colors disabled:opacity-50"
              title="Perbarui status"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Device storage notice banner */}
        <div className="bg-coffee-50/70 border border-coffee-200/60 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-coffee-100 text-coffee-800 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Coffee className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs text-charcoal/70 leading-relaxed">
            <p className="font-bold text-coffee-900">Tersimpan di Perangkat Ini</p>
            <p className="mt-0.5 text-charcoal/60">
              Riwayat pesanan disimpan otomatis di browser kamu tanpa perlu login. Kamu juga bisa melacak pesanan lain dengan memasukkan kode pesanan di bawah.
            </p>
          </div>
        </div>

        {/* Manual search / Add order by code */}
        <form onSubmit={handleAddCode} className="bg-white rounded-2xl border border-coffee-100/80 p-4 shadow-soft space-y-3">
          <label className="block text-xs font-bold text-coffee-900">
            Lacak Pesanan Tertentu
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-charcoal/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchCode}
                onChange={(e) => {
                  setSearchCode(e.target.value);
                  setSearchError(null);
                  setSearchSuccess(null);
                }}
                placeholder="Masukkan Kode (cth: NK386931)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-coffee-50/50 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 font-mono focus:outline-none focus:border-coffee-400 uppercase transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchCode.trim()}
              className="px-4 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-xs sm:text-sm hover:bg-coffee-800 disabled:opacity-50 transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95"
            >
              {searchLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Lacak</span>
                </>
              )}
            </button>
          </div>

          {searchError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {searchSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{searchSuccess}</span>
            </div>
          )}
        </form>

        {/* Tab filters */}
        <div className="flex items-center gap-2 border-b border-coffee-100/80 pb-2">
          <button
            onClick={() => setTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              tab === 'all'
                ? 'bg-coffee-700 text-cream shadow-soft'
                : 'text-charcoal/60 hover:text-coffee-800 hover:bg-coffee-50'
            }`}
          >
            Semua ({orders.length})
          </button>
          <button
            onClick={() => setTab('active')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              tab === 'active'
                ? 'bg-coffee-700 text-cream shadow-soft'
                : 'text-charcoal/60 hover:text-coffee-800 hover:bg-coffee-50'
            }`}
          >
            <span>Aktif ({activeCount})</span>
            {activeCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              tab === 'completed'
                ? 'bg-coffee-700 text-cream shadow-soft'
                : 'text-charcoal/60 hover:text-coffee-800 hover:bg-coffee-50'
            }`}
          >
            Selesai ({orders.length - activeCount})
          </button>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-2xl p-5 border border-coffee-100/70 animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 bg-coffee-100 rounded-lg" />
                  <div className="h-5 w-20 bg-coffee-100 rounded-full" />
                </div>
                <div className="h-3 w-40 bg-coffee-50 rounded" />
                <div className="h-4 w-24 bg-coffee-100 rounded" />
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-8 text-center space-y-3 shadow-soft">
            <div className="w-16 h-16 rounded-2xl bg-coffee-50 text-coffee-300 flex items-center justify-center mx-auto mb-2">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-coffee-900 text-base">
              {tab === 'all'
                ? 'Belum Ada Riwayat Pesanan'
                : tab === 'active'
                ? 'Tidak Ada Pesanan Aktif'
                : 'Belum Ada Pesanan Selesai'}
            </h3>
            <p className="text-xs text-charcoal/50 max-w-sm mx-auto">
              {tab === 'all'
                ? 'Pesanan yang kamu pesan dari browser ini akan otomatis tersimpan di sini.'
                : 'Kamu tidak memiliki pesanan dalam status ini.'}
            </p>
            <div className="pt-2">
              <button
                onClick={() => router.push('/menu')}
                className="px-5 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-all shadow-soft active:scale-95"
              >
                Pesan Sekarang
              </button>
            </div>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-3.5"
          >
            <AnimatePresence>
              {filteredOrders.map((order) => {
                const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
                const statusLabel = STATUS_LABELS[order.status] || order.status;

                return (
                  <motion.div
                    key={order.id || order.order_code}
                    variants={fadeInUp}
                    layout
                    className="bg-white rounded-2xl border border-coffee-100/80 p-4 sm:p-5 shadow-soft hover:shadow-soft-lg transition-all space-y-3.5"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-coffee-900 font-mono tracking-wide">
                            #{order.order_code}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle.badge}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${
                                statusStyle.pulse ? 'animate-pulse' : ''
                              }`}
                            />
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-xs text-charcoal/50 mt-1 flex items-center gap-1.5">
                          <span className="font-semibold text-charcoal/70">Meja {order.table_number}</span>
                          <span>&middot;</span>
                          <span>{order.customer_name}</span>
                          <span>&middot;</span>
                          <span>{relativeTime(order.created_at)}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {order.payment_method === 'qris' ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">
                            <CreditCard className="w-3 h-3" /> QRIS
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-coffee-50 text-coffee-700 px-2 py-1 rounded-lg">
                            <Wallet className="w-3 h-3" /> Tunai
                          </span>
                        )}
                        <button
                          onClick={() => handleRemove(order.order_code)}
                          className="p-1.5 text-charcoal/30 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus dari daftar riwayat perangkat ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Order items preview */}
                    <div className="bg-coffee-50/40 rounded-xl p-3 space-y-1.5">
                      {order.items?.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-charcoal/80">
                            <strong className="text-coffee-900">{item.quantity}x</strong> {item.name}
                          </span>
                          <span className="text-charcoal/60 font-medium">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      ))}
                      {order.notes && (
                        <p className="text-[11px] text-charcoal/50 pt-1 border-t border-coffee-100/60 italic">
                          Catatan: &ldquo;{order.notes}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Total & Action */}
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-[11px] text-charcoal/40 uppercase tracking-wider block font-semibold">
                          Total Pembayaran
                        </span>
                        <span className="text-base font-extrabold text-coffee-900">
                          {formatPrice(order.total)}
                        </span>
                      </div>

                      <button
                        onClick={() => router.push(`/status/${order.order_code}`)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-all shadow-soft active:scale-95"
                      >
                        <span>Lihat Status</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}
