'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Coffee,
  Receipt,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Plus,
  ShoppingBag,
  CreditCard,
  Wallet,
  RotateCcw,
  Loader2,
  CalendarDays,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import {
  getStoredOrderCodes,
  saveOrderToHistory,
  removeOrderFromHistory,
} from '@/lib/order-history';
import {
  getStoredReservationCodes,
  saveReservationToHistory,
  removeReservationFromHistory,
  RESERVATION_SNAPSHOT_PREFIX,
} from '@/lib/reservation-history';
import { ORDER_SNAPSHOT_PREFIX, LEGACY_ORDER_SNAPSHOT_PREFIX } from '@/lib/storage-keys';
import { supabase } from '@/lib/supabase-client';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { useBrand } from '@/components/providers/BrandProvider';
import { executeReorder } from '@/lib/menu-availability';

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  note?: string | null;
};

type CustomerOrder = {
  type?: 'order';
  id: string;
  order_code: string;
  customer_name: string;
  table_number: string;
  branch_id: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'qris';
  notes: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
};

type CustomerReservation = {
  type?: 'reservation';
  id:            string;
  code:          string;
  table_code:    string;
  table_label?:  string | null;
  starts_at:     string;
  ends_at:       string;
  party_size:    number;
  customer_name: string;
  total:         number;
  status:        'pending_payment' | 'awaiting_confirmation' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show' | 'expired';
  notes?:        string | null;
  occasion?:     string | null;
  created_at:    string;
};

type HistoryItem =
  | (CustomerOrder & { itemType: 'order' })
  | (CustomerReservation & { itemType: 'reservation' });

const ORDER_STATUS_LABELS: Record<CustomerOrder['status'], string> = {
  pending:   'Diterima',
  preparing: 'Sedang Disiapkan',
  ready:     'Siap Diantar',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const ORDER_STATUS_COLORS: Record<CustomerOrder['status'], { badge: string; dot: string; pulse?: boolean }> = {
  pending: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
    dot:   'bg-amber-500',
    pulse: true,
  },
  preparing: {
    badge: 'bg-blue-50 text-blue-800 border-blue-200/80',
    dot:   'bg-blue-500',
    pulse: true,
  },
  ready: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    dot:   'bg-emerald-500',
    pulse: true,
  },
  completed: {
    badge: 'bg-coffee-50 text-coffee-800 border-coffee-200/80',
    dot:   'bg-coffee-600',
  },
  cancelled: {
    badge: 'bg-red-50 text-red-700 border-red-200/80',
    dot:   'bg-red-500',
  },
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending_payment:       'Menunggu Pembayaran',
  awaiting_confirmation: 'Menunggu Konfirmasi',
  confirmed:             'Dikonfirmasi',
  seated:                'Sedang di Meja',
  completed:             'Selesai',
  cancelled:             'Dibatalkan',
  no_show:               'Tidak Hadir',
  expired:               'Kedaluwarsa',
};

const RESERVATION_STATUS_COLORS: Record<string, { badge: string; dot: string; pulse?: boolean }> = {
  pending_payment: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot:   'bg-amber-500',
    pulse: true,
  },
  awaiting_confirmation: {
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    dot:   'bg-blue-500',
    pulse: true,
  },
  confirmed: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot:   'bg-emerald-500',
  },
  seated: {
    badge: 'bg-purple-100 text-purple-900 border-purple-300',
    dot:   'bg-purple-600',
    pulse: true,
  },
  completed: {
    badge: 'bg-coffee-50 text-coffee-800 border-coffee-200',
    dot:   'bg-coffee-600',
  },
  cancelled: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    dot:   'bg-red-500',
  },
  no_show: {
    badge: 'bg-stone-100 text-stone-700 border-stone-300',
    dot:   'bg-stone-500',
  },
  expired: {
    badge: 'bg-stone-100 text-stone-700 border-stone-300',
    dot:   'bg-stone-500',
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
    day:    'numeric',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
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
  const { brandName } = useBrand();

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [reservations, setReservations] = useState<CustomerReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Manual code tracking input
  const [searchCode, setSearchCode] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSuccess, setSearchSuccess] = useState<string | null>(null);

  // Tab filter: 'all' | 'orders' | 'reservations'
  const [tab, setTab] = useState<'all' | 'orders' | 'reservations'>('all');

  // Reorder state
  const [reorderingCode, setReorderingCode] = useState<string | null>(null);
  const [reorderToast, setReorderToast] = useState<string | null>(null);
  const reorderToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch orders & reservations ─────────────────────────────────────────────
  const fetchAllHistory = useCallback(async () => {
    const targetOrderCodes = getStoredOrderCodes();
    const targetResCodes   = getStoredReservationCodes();

    if (targetOrderCodes.length === 0 && targetResCodes.length === 0) {
      setOrders([]);
      setReservations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // 1. Fetch Orders
      if (targetOrderCodes.length > 0) {
        const { data: dbOrders, error: orderErr } = await supabase
          .from('orders')
          .select('id, order_code, customer_name, table_number, branch_id, items, subtotal, total, payment_method, notes, status, created_at')
          .in('order_code', targetOrderCodes)
          .order('created_at', { ascending: false });

        if (dbOrders && !orderErr && dbOrders.length > 0) {
          setOrders(dbOrders as CustomerOrder[]);
        } else {
          // Fallback via API
          const res = await fetch(`/api/orders/lookup?codes=${encodeURIComponent(targetOrderCodes.join(','))}`);
          if (res.ok) {
            const json = await res.json();
            if (json?.orders) setOrders(json.orders as CustomerOrder[]);
          }
        }
      } else {
        setOrders([]);
      }

      // 2. Fetch Reservations
      if (targetResCodes.length > 0) {
        const resRes = await fetch(`/api/reservations/lookup?codes=${encodeURIComponent(targetResCodes.join(','))}`);
        if (resRes.ok) {
          const resJson = await resRes.json();
          if (resJson?.reservations) {
            setReservations(resJson.reservations as CustomerReservation[]);
          }
        } else {
          // Local storage snapshot fallback
          const localRes: CustomerReservation[] = [];
          targetResCodes.forEach((c) => {
            try {
              const raw = localStorage.getItem(RESERVATION_SNAPSHOT_PREFIX + c);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.code) localRes.push(parsed);
              }
            } catch {}
          });
          if (localRes.length > 0) setReservations(localRes);
        }
      } else {
        setReservations([]);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllHistory();
  }, [fetchAllHistory]);

  // Periodic polling for active orders & reservations
  useEffect(() => {
    const hasActive =
      orders.some((o) => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready') ||
      reservations.some((r) => r.status === 'pending_payment' || r.status === 'awaiting_confirmation' || r.status === 'confirmed' || r.status === 'seated');

    if (!hasActive) return;

    const timer = setInterval(() => {
      fetchAllHistory();
    }, 12000);

    return () => clearInterval(timer);
  }, [orders, reservations, fetchAllHistory]);

  // Handle manual code addition
  async function handleAddCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = searchCode.trim().toUpperCase();
    if (!clean) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchSuccess(null);

    try {
      // 1. Try order lookup
      const resOrder = await fetch(`/api/orders/lookup?code=${encodeURIComponent(clean)}`);
      if (resOrder.ok) {
        const jsonOrder = await resOrder.json();
        if (jsonOrder?.order) {
          saveOrderToHistory(clean);
          setSearchSuccess(`Pesanan #${clean} berhasil ditambahkan ke riwayat.`);
          setSearchCode('');
          await fetchAllHistory();
          setSearchLoading(false);
          return;
        }
      }

      // 2. Try reservation lookup
      const resRes = await fetch(`/api/reservations/lookup?codes=${encodeURIComponent(clean)}`);
      if (resRes.ok) {
        const jsonRes = await resRes.json();
        if (jsonRes?.reservations && jsonRes.reservations.length > 0) {
          saveReservationToHistory(clean, jsonRes.reservations[0]);
          setSearchSuccess(`Reservasi #${clean} berhasil ditambahkan ke riwayat.`);
          setSearchCode('');
          await fetchAllHistory();
          setSearchLoading(false);
          return;
        }
      }

      setSearchError(`Kode pesanan atau reservasi "${clean}" tidak ditemukan.`);
    } catch {
      setSearchError('Gagal memeriksa kode. Coba lagi.');
    } finally {
      setSearchLoading(false);
    }
  }

  // Remove individual item from device history
  function handleRemoveOrder(codeToRemove: string) {
    if (confirm(`Hapus pesanan #${codeToRemove} dari riwayat perangkat ini?`)) {
      removeOrderFromHistory(codeToRemove);
      setOrders((prev) => prev.filter((o) => o.order_code !== codeToRemove));
    }
  }

  function handleRemoveReservation(codeToRemove: string) {
    if (confirm(`Hapus reservasi #${codeToRemove} dari riwayat perangkat ini?`)) {
      removeReservationFromHistory(codeToRemove);
      setReservations((prev) => prev.filter((r) => r.code !== codeToRemove));
    }
  }

  // "Pesan lagi" handler
  async function handleReorder(order: CustomerOrder) {
    if (reorderingCode) return;
    setReorderingCode(order.order_code);
    try {
      const { added, skipped } = await executeReorder(
        order.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, note: i.note })),
        order.branch_id || null,
      );

      let msg = '';
      if (added === 0) {
        msg = 'Maaf, menu dari pesanan ini sedang tidak tersedia.';
      } else if (skipped.length > 0) {
        msg = `${added} item dimasukkan. Tidak tersedia: ${skipped.join(', ')}`;
      } else {
        msg = `${added} item dimasukkan ke keranjang.`;
      }

      setReorderToast(msg);
      if (reorderToastTimer.current) clearTimeout(reorderToastTimer.current);

      if (added > 0) {
        reorderToastTimer.current = setTimeout(() => {
          router.push('/menu');
        }, 1200);
      } else {
        reorderToastTimer.current = setTimeout(() => setReorderToast(null), 3500);
      }
    } catch {
      setReorderToast('Gagal memuat menu. Coba lagi.');
      reorderToastTimer.current = setTimeout(() => setReorderToast(null), 3500);
    } finally {
      setReorderingCode(null);
    }
  }

  // Merge and sort all items chronologically
  const unifiedItems: HistoryItem[] = useMemo(() => {
    const list: HistoryItem[] = [];

    if (tab === 'all' || tab === 'orders') {
      orders.forEach((o) => list.push({ ...o, itemType: 'order' }));
    }
    if (tab === 'all' || tab === 'reservations') {
      reservations.forEach((r) => list.push({ ...r, itemType: 'reservation' }));
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, reservations, tab]);

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
              <h1 className="font-extrabold text-coffee-900 text-base sm:text-lg">Riwayat Aktivitas</h1>
            </div>

            <button
              onClick={() => {
                setRefreshing(true);
                fetchAllHistory();
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
              Riwayat pesanan menu dan reservasi meja {brandName} disimpan otomatis di browser kamu tanpa perlu login.
            </p>
          </div>
        </div>

        {/* Reorder toast */}
        <AnimatePresence>
          {reorderToast && (
            <motion.div
              key="reorder-toast"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{reorderToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual search / Add order or reservation by code */}
        <form onSubmit={handleAddCode} className="bg-white rounded-2xl border border-coffee-100/80 p-4 shadow-soft space-y-3">
          <label className="block text-xs font-bold text-coffee-900">
            Lacak Pesanan atau Reservasi
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
                placeholder="Masukkan Kode (cth: NK123456 atau RSV123)"
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
            Semua ({orders.length + reservations.length})
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              tab === 'orders'
                ? 'bg-coffee-700 text-cream shadow-soft'
                : 'text-charcoal/60 hover:text-coffee-800 hover:bg-coffee-50'
            }`}
          >
            Pesanan Menu ({orders.length})
          </button>
          <button
            onClick={() => setTab('reservations')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              tab === 'reservations'
                ? 'bg-purple-700 text-cream shadow-soft'
                : 'text-charcoal/60 hover:text-purple-800 hover:bg-purple-50'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Reservasi Meja ({reservations.length})</span>
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
        ) : unifiedItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-8 text-center space-y-3 shadow-soft">
            <div className="w-16 h-16 rounded-2xl bg-coffee-50 text-coffee-300 flex items-center justify-center mx-auto mb-2">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-coffee-900 text-base">
              {tab === 'reservations'
                ? 'Belum Ada Riwayat Reservasi'
                : tab === 'orders'
                ? 'Belum Ada Riwayat Pesanan Menu'
                : 'Belum Ada Riwayat Aktivitas'}
            </h3>
            <p className="text-xs text-charcoal/50 max-w-sm mx-auto">
              Aktivitas pemesanan dan reservasi meja kamu dari perangkat ini akan otomatis tersimpan di sini.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                onClick={() => router.push('/menu')}
                className="px-4 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-xs hover:bg-coffee-800 transition-all shadow-soft active:scale-95"
              >
                Lihat Menu
              </button>
              <button
                onClick={() => router.push('/reservasi')}
                className="px-4 py-2.5 rounded-xl bg-purple-700 text-white font-bold text-xs hover:bg-purple-800 transition-all shadow-soft active:scale-95"
              >
                Reservasi Meja
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
              {unifiedItems.map((item) => {
                if (item.itemType === 'reservation') {
                  const res = item as CustomerReservation;
                  const resStatusStyle = RESERVATION_STATUS_COLORS[res.status] || RESERVATION_STATUS_COLORS.confirmed;
                  const resStatusLabel = RESERVATION_STATUS_LABELS[res.status] || res.status;

                  return (
                    <motion.div
                      key={res.id || res.code}
                      variants={fadeInUp}
                      layout
                      className="bg-white rounded-2xl border border-purple-200/80 p-4 sm:p-5 shadow-soft hover:shadow-soft-lg transition-all space-y-3.5 ring-1 ring-purple-100"
                    >
                      {/* Reservation Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                              <CalendarDays className="w-3 h-3" /> Reservasi Meja
                            </span>
                            <span className="text-base font-extrabold text-coffee-900 font-mono tracking-wide">
                              #{res.code}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${resStatusStyle.badge}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${resStatusStyle.dot} ${
                                  resStatusStyle.pulse ? 'animate-pulse' : ''
                                }`}
                              />
                              {resStatusLabel}
                            </span>
                          </div>
                          <p className="text-xs text-charcoal/50 mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-purple-950">Meja {res.table_code}</span>
                            {res.table_label && <span>({res.table_label})</span>}
                            <span>&middot;</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {res.party_size} Orang</span>
                            <span>&middot;</span>
                            <span>{relativeTime(res.created_at)}</span>
                          </p>
                        </div>

                        <button
                          onClick={() => handleRemoveReservation(res.code)}
                          className="p-1.5 text-charcoal/30 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          title="Hapus dari daftar riwayat perangkat ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Reservation Schedule Box */}
                      <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-100/60 text-xs text-purple-950 flex items-center justify-between">
                        <div>
                          <span className="text-charcoal/50 block text-[11px]">Jadwal Kunjungan:</span>
                          <span className="font-bold">{formatDate(res.starts_at)}</span>
                        </div>
                        {res.customer_name && (
                          <div className="text-right">
                            <span className="text-charcoal/50 block text-[11px]">Atas Nama:</span>
                            <span className="font-semibold">{res.customer_name}</span>
                          </div>
                        )}
                      </div>

                      {/* Total & Action */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-[11px] text-charcoal/40 uppercase tracking-wider block font-semibold">
                            Total Biaya
                          </span>
                          <span className="text-base font-extrabold text-coffee-900">
                            {formatPrice(res.total)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {res.status === 'seated' && (
                            <button
                              onClick={() => router.push(`/menu?table=${encodeURIComponent(res.table_code)}`)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-coffee-50 border border-coffee-200 text-coffee-800 text-xs font-bold hover:bg-coffee-100 transition-all active:scale-95"
                              title="Pesan makanan tambahan di meja ini"
                            >
                              <UtensilsCrossed className="w-3.5 h-3.5 text-coffee-700" />
                              <span className="hidden sm:inline">Pesan Tambahan</span>
                            </button>
                          )}

                          <button
                            onClick={() => router.push(`/reservasi/${res.code}`)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 text-white text-xs font-bold hover:bg-purple-800 transition-all shadow-soft active:scale-95"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Struk &amp; Detail</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Regular food order card
                const order = item as CustomerOrder;
                const statusStyle = ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.pending;
                const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;

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
                          onClick={() => handleRemoveOrder(order.order_code)}
                          className="p-1.5 text-charcoal/30 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus dari daftar riwayat perangkat ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Order items preview */}
                    <div className="bg-coffee-50/40 rounded-xl p-3 space-y-1.5">
                      {order.items?.map((orderItem, idx) => (
                        <div
                          key={orderItem.id ? `${orderItem.id}-${idx}` : idx}
                          className="flex items-start justify-between text-xs gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-charcoal/80">
                              <strong className="text-coffee-900">{orderItem.quantity}x</strong> {orderItem.name}
                            </span>
                            {orderItem.note && (
                              <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                                Catatan: {orderItem.note}
                              </p>
                            )}
                          </div>
                          <span className="text-charcoal/60 font-medium flex-shrink-0">
                            {formatPrice(orderItem.price * orderItem.quantity)}
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

                      <div className="flex items-center gap-2">
                        {(order.status === 'ready' || order.status === 'completed') && (
                          <button
                            onClick={() => router.push(`/receipt/${order.order_code}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-coffee-200/90 text-coffee-800 text-xs font-bold hover:bg-coffee-50 transition-all active:scale-95 shadow-2xs"
                            title="Lihat bukti pesanan"
                          >
                            <Receipt className="w-3.5 h-3.5 text-coffee-600" />
                            <span>Struk</span>
                          </button>
                        )}

                        {/* Pesan lagi button */}
                        <button
                          onClick={() => handleReorder(order)}
                          disabled={!!reorderingCode}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coffee-50 border border-coffee-200/80 text-coffee-800 text-xs font-bold hover:bg-coffee-100 transition-all active:scale-95 disabled:opacity-50"
                          title="Pesan menu yang sama lagi"
                        >
                          {reorderingCode === order.order_code ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          <span>Pesan lagi</span>
                        </button>

                        <button
                          onClick={() => router.push(`/status/${order.order_code}`)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-all shadow-soft active:scale-95"
                        >
                          <span>Lihat Status</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
