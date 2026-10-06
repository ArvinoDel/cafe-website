'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useBranchInfo } from '@/lib/branch-info';
import { roundToFiveMinutes } from '@/lib/wait-time';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Coffee,
  XCircle,
  RefreshCw,
  Receipt,
  QrCode,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  RotateCcw,
  Bell,
  Clock,
} from 'lucide-react';
import { playOrderChime, unlockAudio } from '@/lib/audio';
import QrScannerModal from '@/components/ui/QrScannerModal';
import WifiInfoCard from '@/components/ui/WifiInfoCard';
import OrderFeedbackCard from '@/components/ui/OrderFeedbackCard';
import TableRequestModal from '@/components/ui/TableRequestModal';
import { executeReorder } from '@/lib/menu-availability';
import { saveOrderToHistory } from '@/lib/order-history';
import { clearLocalGroupSession, getLocalGroupSession } from '@/lib/group-cart';
import { formatItemOptionsSummary, type SelectedOption } from '@/lib/item-options';
import {
  TABLE_KEY,
  ORDER_SNAPSHOT_PREFIX,
  LAST_ORDER_KEY,
  LEGACY_TABLE_KEY,
  LEGACY_ORDER_SNAPSHOT_PREFIX,
  LEGACY_LAST_ORDER_KEY,
} from '@/lib/storage-keys';

type OrderItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  note?: string | null;
  added_by?: string | null;
  selected_options?: SelectedOption[] | null;
};

type Order = {
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

const STEPS: { key: Order['status']; label: string; desc: string }[] = [
  { key: 'pending', label: 'Diterima', desc: 'Pesanan kamu sudah kami terima' },
  { key: 'preparing', label: 'Disiapkan', desc: 'Barista sedang membuat pesananmu' },
  { key: 'ready', label: 'Siap Diantar', desc: 'Pesanan siap dan akan segera diantar' },
  { key: 'completed', label: 'Selesai', desc: 'Selamat menikmati!' },
];

const BASE_POLL_INTERVAL = 6000;
const MAX_POLL_INTERVAL  = 30000;

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

function getEstimatedWaitText(createdAt: string, estMinutes: number): string {
  const createdMs = new Date(createdAt).getTime();
  const targetMs = createdMs + estMinutes * 60 * 1000;
  const now = Date.now();

  if (now >= targetMs) {
    return 'Sebentar lagi ya, barista sedang menyelesaikan pesananmu ☕';
  }

  const targetDate = new Date(targetMs);
  const hhmm = targetDate.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `Perkiraan siap sekitar ${hhmm} (±${estMinutes} menit)`;
}

export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || '').toUpperCase();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [waitMinutesRemaining, setWaitMinutesRemaining] = useState<number | null>(null);
  const isFirstLoad = useRef(true);
  const currentIntervalRef = useRef(BASE_POLL_INTERVAL);
  const orderRef = useRef<Order | null>(order);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // "Pesanan siap" alert & wait time state
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const prevStatusRef = useRef<Order['status'] | null>(null);
  const [, setTick] = useState(0);

  // Periodic tick so relative wait time refreshes gracefully if deadline passes
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Clear group session only when the cart was submitted for THIS specific order.
  // Visiting an unrelated order keeps the active group session intact.
  useEffect(() => {
    if (!code) return;
    const session = getLocalGroupSession();
    if (!session) return;

    fetch(`/api/group-carts/${encodeURIComponent(session.code)}`, {
      headers: { 'x-member-token': session.member_token },
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data && data.status === 'submitted' && data.order_code === code) {
          clearLocalGroupSession();
        }
      })
      .catch(() => {});
  }, [code]);

  // Initialize sound preference from localStorage key 'cafe-ready-alert'
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cafe-ready-alert');
      if (stored === 'true') {
        setSoundEnabled(true);
      }
    } catch {}
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem('cafe-ready-alert', next ? 'true' : 'false');
    } catch {}
    if (next) {
      unlockAudio();
    }
  };

  // Fetch branch info for est_wait_minutes — shared cache via useBranchInfo
  const branchId = order?.branch_id;
  const { info: branchInfo } = useBranchInfo(branchId);
  const estWaitMinutes =
    typeof branchInfo?.est_wait_minutes === 'number' && branchInfo.est_wait_minutes > 0
      ? branchInfo.est_wait_minutes
      : null;

  const triggerReadyAlert = useCallback(() => {
    // 1. Play soft chime if sound toggle was enabled
    if (soundEnabledRef.current) {
      playOrderChime();
    }

    // 2. Vibration
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {}
    }

    // 3. Briefly change document.title until window is focused
    if (typeof document !== 'undefined') {
      const originalTitle = document.title;
      document.title = '🔔 Pesananmu siap!';

      const handleFocus = () => {
        document.title = originalTitle || 'Status Pesanan';
        window.removeEventListener('focus', handleFocus);
      };

      window.addEventListener('focus', handleFocus);
    }

    // 4. In-page banner
    setShowReadyBanner(true);
  }, []);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isUpdatingTable, setIsUpdatingTable] = useState(false);
  const [tableUpdateNotice, setTableUpdateNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // "Pesan lagi" state
  const [reordering, setReordering] = useState(false);
  const [reorderToast, setReorderToast] = useState<string | null>(null);
  const reorderToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleReorder() {
    if (!order || reordering) return;
    setReordering(true);
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
        reorderToastTimer.current = setTimeout(() => router.push('/menu'), 1200);
      } else {
        reorderToastTimer.current = setTimeout(() => setReorderToast(null), 3500);
      }
    } catch {
      setReorderToast('Gagal memuat menu. Coba lagi.');
      reorderToastTimer.current = setTimeout(() => setReorderToast(null), 3500);
    } finally {
      setReordering(false);
    }
  }

  const handleTableScan = useCallback(
    async (scannedTable: string) => {
      if (!order) return;
      if (scannedTable === order.table_number) {
        setTableUpdateNotice({
          type: 'success',
          message: `Kamu sudah berada di Meja ${scannedTable}.`,
        });
        return;
      }

      setIsUpdatingTable(true);
      try {
        const res = await fetch('/api/orders/update-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_code: order.order_code,
            new_table: scannedTable,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          setTableUpdateNotice({
            type: 'error',
            message: data.error || 'Gagal memindahkan meja. Silakan coba lagi atau beritahu barista.',
          });
          return;
        }

        // Update state
        setOrder((prev) => (prev ? { ...prev, table_number: scannedTable } : null));

        // Update localStorage
        try {
          localStorage.setItem(TABLE_KEY, scannedTable);
          const stored =
            localStorage.getItem(ORDER_SNAPSHOT_PREFIX + order.order_code) ||
            localStorage.getItem(LEGACY_ORDER_SNAPSHOT_PREFIX + order.order_code);
          if (stored) {
            const parsed = JSON.parse(stored);
            parsed.table_number = scannedTable;
            localStorage.setItem(ORDER_SNAPSHOT_PREFIX + order.order_code, JSON.stringify(parsed));
          }
          const lastOrder =
            localStorage.getItem(LAST_ORDER_KEY) ||
            localStorage.getItem(LEGACY_LAST_ORDER_KEY);
          if (lastOrder) {
            const parsed = JSON.parse(lastOrder);
            if (parsed?.order_code === order.order_code) {
              parsed.table_number = scannedTable;
              localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(parsed));
            }
          }
        } catch {}

        setTableUpdateNotice({
          type: 'success',
          message: `Nomor meja pesanan berhasil dipindahkan ke Meja ${scannedTable}! Barista akan mengantar ke meja barumu.`,
        });
      } catch {
        setTableUpdateNotice({
          type: 'error',
          message: 'Koneksi bermasalah saat memindahkan meja. Silakan coba lagi.',
        });
      } finally {
        setIsUpdatingTable(false);
      }
    },
    [order],
  );

  const getLocalOrder = useCallback((): Order | null => {
    try {
      const stored =
        localStorage.getItem(ORDER_SNAPSHOT_PREFIX + code) ||
        localStorage.getItem(LEGACY_ORDER_SNAPSHOT_PREFIX + code) ||
        localStorage.getItem(LAST_ORDER_KEY) ||
        localStorage.getItem(LEGACY_LAST_ORDER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.order_code === code || !code)) {
          return parsed as Order;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
    return null;
  }, [code]);

  const fetchOrder = useCallback(async () => {
    if (!code) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      // Server lookup API (direct anon Supabase query removed as anon cannot SELECT orders)
      const res = await fetch(`/api/orders/lookup?code=${encodeURIComponent(code)}`);

      if (res.status === 429) {
        // Back off on HTTP 429: double interval up to 30s. Do NOT treat 429 as "order not found"
        currentIntervalRef.current = Math.min(MAX_POLL_INTERVAL, currentIntervalRef.current * 2);

        // Fallback to local snapshot if first load to populate initial UI without marking notFound
        if (isFirstLoad.current) {
          const local = getLocalOrder();
          if (local) {
            setOrder(local);
            setNotFound(false);
          }
        }
      } else if (res.ok) {
        // Reset interval to base on success
        currentIntervalRef.current = BASE_POLL_INTERVAL;
        const json = await res.json();
        if (json?.order) {
          const newOrder = json.order as Order;

          // Save order history entry and order snapshot so /orders works for all members (including non-host members)
          try {
            saveOrderToHistory(newOrder.order_code);
            const snapshot = {
              order_code:     newOrder.order_code,
              customer_name:  newOrder.customer_name,
              table_number:   newOrder.table_number,
              items:          newOrder.items,
              subtotal:       newOrder.subtotal,
              total:          newOrder.total,
              payment_method: newOrder.payment_method,
              notes:          newOrder.notes,
              status:         newOrder.status,
              created_at:     newOrder.created_at,
            };
            localStorage.setItem(ORDER_SNAPSHOT_PREFIX + newOrder.order_code, JSON.stringify(snapshot));
            localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(snapshot));
          } catch {}

          // Check if polled status transitioned to 'ready' (not when page first loads already ready)
          if (
            !isFirstLoad.current &&
            prevStatusRef.current &&
            prevStatusRef.current !== 'ready' &&
            newOrder.status === 'ready'
          ) {
            triggerReadyAlert();
          }

          prevStatusRef.current = newOrder.status;
          setOrder(newOrder);
          setWaitMinutesRemaining(
            typeof json.wait_minutes_remaining === 'number' ? json.wait_minutes_remaining : null,
          );
          setNotFound(false);
          setLastChecked(new Date());
          setLoading(false);
          isFirstLoad.current = false;
          return;
        }
      } else if (res.status === 404) {
        // Fallback to localStorage snapshot for order not found
        const local = getLocalOrder();
        if (local) {
          if (prevStatusRef.current === null) {
            prevStatusRef.current = local.status;
          }
          setOrder(local);
          setNotFound(false);
        } else if (isFirstLoad.current) {
          setNotFound(true);
        }
      }
    } catch {
      // Network error or unexpected exception
      const local = getLocalOrder();
      if (local) {
        if (prevStatusRef.current === null) {
          prevStatusRef.current = local.status;
        }
        setOrder(local);
        setNotFound(false);
      } else if (isFirstLoad.current) {
        setNotFound(true);
      }
    }

    setLastChecked(new Date());
    setLoading(false);
    isFirstLoad.current = false;
  }, [code, getLocalOrder, triggerReadyAlert]);

  const isTerminal = order?.status === 'completed' || order?.status === 'cancelled';

  useEffect(() => {
    if (!code || isTerminal) {
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedulePoll = (delay: number) => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      timerId = setTimeout(async () => {
        if (cancelled) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }

        await fetchOrder();

        if (cancelled) return;
        if (orderRef.current?.status === 'completed' || orderRef.current?.status === 'cancelled') {
          return;
        }

        schedulePoll(currentIntervalRef.current);
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (orderRef.current?.status === 'completed' || orderRef.current?.status === 'cancelled') {
          return;
        }
        // Tab became visible: fetch immediately and restart scheduled polling
        if (timerId) clearTimeout(timerId);
        fetchOrder().then(() => {
          if (cancelled) return;
          if (orderRef.current?.status === 'completed' || orderRef.current?.status === 'cancelled') {
            return;
          }
          schedulePoll(currentIntervalRef.current);
        });
      } else {
        // Tab is hidden: pause polling
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial immediate fetch on mount or code change
    fetchOrder().then(() => {
      if (cancelled) return;
      if (orderRef.current?.status === 'completed' || orderRef.current?.status === 'cancelled') {
        return;
      }
      schedulePoll(currentIntervalRef.current);
    });

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [code, isTerminal, fetchOrder]);

function StatusSkeleton() {
  return (
    <div className="min-h-screen bg-cream pb-12 animate-pulse">
      {/* Top bar skeleton */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="w-16 h-4 bg-coffee-200/50 rounded-lg" />
          <div className="w-28 h-5 bg-coffee-200/60 rounded-lg" />
          <div className="w-16 h-7 bg-coffee-200/50 rounded-xl" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Order header card skeleton */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 text-center shadow-soft space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-coffee-100/60 mx-auto" />
          <div className="w-24 h-3 bg-coffee-200/50 rounded mx-auto" />
          <div className="w-36 h-7 bg-coffee-200/70 rounded-lg mx-auto" />
          <div className="w-28 h-4 bg-coffee-100/70 rounded mx-auto" />
          <div className="w-32 h-6 bg-coffee-100/60 rounded-xl mx-auto mt-2" />
        </div>
        {/* Progress tracker stepper skeleton */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 shadow-soft space-y-4">
          <div className="w-28 h-4 bg-coffee-200/60 rounded" />
          <div className="space-y-4 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-coffee-100/70 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="w-32 h-4 bg-coffee-200/60 rounded" />
                  <div className="w-48 h-3 bg-coffee-100/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Order items summary skeleton */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 shadow-soft space-y-3">
          <div className="w-24 h-4 bg-coffee-200/60 rounded" />
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-coffee-50 last:border-0">
              <div className="w-10 h-10 rounded-lg bg-coffee-100/70 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="w-28 h-4 bg-coffee-200/60 rounded" />
                <div className="w-16 h-3 bg-coffee-100/60 rounded" />
              </div>
              <div className="w-14 h-4 bg-coffee-200/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

  if (loading) {
    return <StatusSkeleton />;
  }

  const stepIndex = order ? STEPS.findIndex((s) => s.key === order.status) : -1;

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-coffee-300" />
          </div>
          <p className="text-charcoal/60 font-medium">Pesanan tidak ditemukan</p>
          <p className="text-charcoal/40 text-sm mt-1">
            Periksa kembali kode pesanan: <span className="font-semibold">{code}</span>
          </p>
          <button
            onClick={() => router.push('/menu')}
            className="mt-5 px-5 py-3 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Kembali ke Menu
          </button>
        </div>
      </div>
    );
  }

  if (order.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100 shadow-soft-lg p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-9 h-9 text-red-500" />
          </div>
          <h1 className="text-xl font-extrabold text-coffee-900">Pesanan Dibatalkan</h1>
          <p className="mt-2 text-charcoal/60 text-sm">
            Pesanan {order.order_code} telah dibatalkan. Hubungi kasir untuk informasi lebih lanjut.
          </p>
          <button
            onClick={() => router.push('/menu')}
            className="mt-6 w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Kembali ke Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-12">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push('/menu')}
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Menu</span>
            </button>
            <h1 className="font-bold text-coffee-900">Status Pesanan</h1>
            <button
              onClick={() => router.push('/orders')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-coffee-50 border border-coffee-200/70 text-coffee-800 text-xs font-semibold hover:bg-coffee-100/70 transition-colors"
              title="Semua Riwayat Pesanan"
            >
              <Receipt className="w-3.5 h-3.5 text-coffee-700" />
              <span className="hidden sm:inline">Riwayat</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Ready celebration banner */}
        <AnimatePresence>
          {(showReadyBanner || order.status === 'ready') && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-emerald-600 text-cream rounded-2xl p-4 shadow-soft flex items-center justify-between gap-3 border border-emerald-500"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 text-xl">
                  🔔
                </div>
                <div>
                  <p className="font-extrabold text-sm text-white leading-tight">
                    Pesananmu siap!
                  </p>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    Silakan ambil di kasir atau tunggu barista mengantarkannya ke Meja {order.table_number}.
                  </p>
                </div>
              </div>
              {showReadyBanner && (
                <button
                  type="button"
                  onClick={() => setShowReadyBanner(false)}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                  aria-label="Tutup banner"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Order header card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-coffee-100/80 p-5 text-center shadow-soft"
        >
          <div className="w-14 h-14 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-3">
            <Coffee className="w-7 h-7 text-coffee-700" />
          </div>
          <p className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide">
            Kode Pesanan
          </p>
          <p className="text-2xl font-extrabold text-coffee-900 mt-0.5">{order.order_code}</p>
          <p className="text-sm text-charcoal/60 mt-1 font-medium">
            Pemesan: <strong>{order.customer_name}</strong>
          </p>

          {/* Table display & re-scan action */}
          <div className="mt-3.5 flex items-center justify-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-coffee-50 text-coffee-900 text-xs font-bold border border-coffee-200/70">
              <QrCode className="w-3.5 h-3.5 text-coffee-600" />
              <span>Meja {order.table_number}</span>
            </div>

            {(order.status === 'pending' || order.status === 'preparing') && (
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                disabled={isUpdatingTable}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200/80 transition-colors active:scale-95 disabled:opacity-50 shadow-2xs"
                title="Pindah meja dan scan stiker QR di meja baru"
              >
                {isUpdatingTable ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                )}
                <span>Pindah Meja? Scan QR Baru</span>
              </button>
            )}
          </div>

          {/* Estimated wait time */}
          {(order.status === 'pending' || order.status === 'preparing') && estWaitMinutes && estWaitMinutes > 0 ? (
            <div className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-900 text-xs font-semibold text-center">
              <Clock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
              <span>
                {(branchInfo?.wait_per_order_minutes ?? 0) > 0 && waitMinutesRemaining !== null
                  ? waitMinutesRemaining > 0
                    ? `Perkiraan siap ±${roundToFiveMinutes(waitMinutesRemaining)} menit lagi`
                    : 'Sebentar lagi ya, barista sedang menyelesaikan pesananmu ☕'
                  : getEstimatedWaitText(order.created_at, estWaitMinutes)}
              </span>
            </div>
          ) : null}

          {/* Sound alert toggle — off by default, unlocks audio context when turned on */}
          {order.status !== 'completed' && (
            <div className="mt-4 pt-3.5 border-t border-coffee-100/70 flex items-center justify-between text-xs">
              <span className="text-charcoal/70 font-semibold flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-coffee-700" />
                <span>Bunyikan saat siap</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={soundEnabled}
                onClick={toggleSound}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  soundEnabled ? 'bg-coffee-700' : 'bg-coffee-200'
                }`}
                title={soundEnabled ? 'Notifikasi suara aktif' : 'Aktifkan suara saat pesanan siap'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          <AnimatePresence>
            {tableUpdateNotice && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className={`mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-2 text-left ${
                  tableUpdateNotice.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {tableUpdateNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  )}
                  <span>{tableUpdateNotice.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTableUpdateNotice(null)}
                  className="text-charcoal/40 hover:text-charcoal p-1 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Wi-Fi Credentials — directly under table info */}
          <WifiInfoCard branchId={order.branch_id} />
        </motion.div>

        {/* Status stepper */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5">
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              const isLast = i === STEPS.length - 1;
              return (
                <div key={step.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                        done
                          ? 'bg-coffee-700 text-cream'
                          : active
                            ? 'bg-coffee-700 text-cream'
                            : 'bg-coffee-50 text-coffee-200'
                      }`}
                    >
                      {done ? (
                        <Check className="w-5 h-5" />
                      ) : active ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cream opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cream" />
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-coffee-200" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 flex-1 min-h-[2.5rem] transition-colors ${
                          done ? 'bg-coffee-700' : 'bg-coffee-100'
                        }`}
                      />
                    )}
                  </div>
                  <div className={isLast ? 'pb-0' : 'pb-6'}>
                    <p
                      className={`font-bold text-sm ${
                        done || active ? 'text-coffee-900' : 'text-charcoal/30'
                      }`}
                    >
                      {step.label}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        done || active ? 'text-charcoal/50' : 'text-charcoal/25'
                      }`}
                    >
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-2 text-charcoal/30 text-xs">
            <RefreshCw className="w-3 h-3" />
            <span>
              Diperbarui otomatis
              {lastChecked && ` · ${lastChecked.toLocaleTimeString('id-ID').slice(0, 5)}`}
            </span>
          </div>
        </div>

        {/* Order items */}
        <div>
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Detail Pesanan
          </h2>
          <div className="bg-white rounded-2xl border border-coffee-100/80 divide-y divide-coffee-100/60 overflow-hidden">
            {order.items.map((item, idx) => (
              <div key={item.id ? `${item.id}-${idx}` : idx} className="flex items-center gap-3 p-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-coffee-900 text-sm truncate">{item.name}</p>
                    {item.added_by && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-coffee-100 text-coffee-700 text-[10px] font-semibold border border-coffee-200/70 shrink-0">
                        {item.added_by}
                      </span>
                    )}
                  </div>
                  {item.selected_options && formatItemOptionsSummary(item.selected_options) && (
                    <p className="text-xs text-coffee-700 bg-coffee-50/80 border border-coffee-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                      {formatItemOptionsSummary(item.selected_options)}
                    </p>
                  )}
                  {item.note && (
                    <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                      Catatan: {item.note}
                    </p>
                  )}
                  <p className="text-charcoal/40 text-xs mt-0.5">Qty {item.quantity}</p>
                </div>
                <span className="text-coffee-700 font-bold text-sm">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
            {order.notes && (
              <div className="p-4 bg-coffee-50/50">
                <p className="text-xs font-semibold text-charcoal/40 mb-1">Catatan</p>
                <p className="text-sm text-charcoal/60">{order.notes}</p>
              </div>
            )}
            <div className="p-4 flex items-center justify-between">
              <span className="text-charcoal/50 text-sm">
                Total &middot; {order.payment_method === 'cash' ? 'Tunai di Kasir' : 'QRIS'}
              </span>
              <span className="text-lg font-extrabold text-coffee-800">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>

          {(order.status === 'ready' || order.status === 'completed') && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => router.push(`/receipt/${order.order_code}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-coffee-200/80 text-coffee-800 text-xs sm:text-sm font-bold hover:bg-coffee-50 transition-colors shadow-2xs active:scale-95"
              >
                <Receipt className="w-4 h-4 text-coffee-600" />
                <span>Lihat Bukti Pesanan</span>
              </button>
            </div>
          )}
        </div>



        {/* Thank-you + feedback — shown when completed, hides after submission */}
        {order.status === 'completed' && (
          <OrderFeedbackCard orderCode={order.order_code} />
        )}

        {/* Pesan lagi — shown only when completed */}
        {order.status === 'completed' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-coffee-100/80 p-5 shadow-soft"
          >
            <p className="font-bold text-coffee-900 text-sm mb-1">Mau pesan lagi?</p>
            <p className="text-xs text-charcoal/50 mb-4">
              Masukkan menu yang sama ke keranjang dengan harga terkini.
            </p>

            <AnimatePresence mode="wait">
              {reorderToast ? (
                <motion.div
                  key="toast"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{reorderToast}</span>
                </motion.div>
              ) : (
                <motion.button
                  key="btn"
                  type="button"
                  onClick={handleReorder}
                  disabled={reordering}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60"
                >
                  {reordering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  <span>Pesan lagi</span>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={(scanned) => handleTableScan(scanned)}
        currentTable={order.table_number}
        title="Pindah Meja Pesanan"
        subtitle={`Pesanan saat ini di Meja ${order.table_number}. Arahkan kamera ke stiker QR meja baru.`}
      />

      {/* Table service request floating button & bottom sheet */}
      <TableRequestModal
        tableNumber={order.table_number}
        branchId={order.branch_id}
        orderCode={order.order_code}
        positionClassName="bottom-6 right-4 sm:right-6"
      />
    </div>
  );
}
