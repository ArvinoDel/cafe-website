'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useBranchInfo } from '@/lib/branch-info';
import { roundToFiveMinutes } from '@/lib/wait-time';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  QrCode,
  Plus,
  Minus,
  Trash2,
  Wallet,
  ScanLine,
  CheckCircle2,
  ShoppingBag,
  Lock,
  AlertCircle,
  Camera,
  RefreshCw,
  X,
  Clock,
  Users,
  Crown,
} from 'lucide-react';
import { fadeInUp } from '@/lib/animations';
import QrScannerModal from '@/components/ui/QrScannerModal';
import { saveOrderToHistory } from '@/lib/order-history';
import { getItemLineKey } from '@/lib/item-options';
import { CART_KEY } from '@/lib/cart';
import {
  getLocalGroupSession,
  useGroupCart,
  clearLocalGroupSession,
  type LocalGroupSession,
} from '@/lib/group-cart';
import {
  TABLE_KEY as STORAGE_TABLE_KEY,
  BRANCH_KEY as STORAGE_BRANCH_KEY,
  ORDER_SNAPSHOT_PREFIX,
  LAST_ORDER_KEY,
} from '@/lib/storage-keys';

type CartItem = {
  id: string;
  lineKey?: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  note?: string | null;
};

// Shape returned by POST /api/orders/create and stored in localStorage
type OrderSnapshot = {
  order_code: string;
  customer_name: string;
  table_number: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'qris';
  notes: string | null;
  status: string;
  created_at: string;
};

const TABLE_KEY  = STORAGE_TABLE_KEY;
const BRANCH_KEY = STORAGE_BRANCH_KEY;

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [loaded, setLoaded]         = useState(false);
  const [name, setName]             = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes]           = useState('');
  const [payment, setPayment]       = useState<'cash' | 'qris'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [orderCode, setOrderCode]   = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // branchId may be null when there is exactly one branch (server resolves it)
  const [branchId, setBranchId]     = useState<string | null>(null);
  // Branch info is fetched via shared helper (cache + dedup); estWaitMinutes derived below
  const [tableNotice, setTableNotice] = useState<string | null>(null);

  // ── Group mode ────────────────────────────────────────────────────────────
  const [groupSession, setGroupSession] = useState<LocalGroupSession | null>(null);
  const isGroupMode = !!groupSession;

  // Poll group cart state when in group mode
  const { cart: groupCart } = useGroupCart(
    groupSession?.code ?? null,
    groupSession,
    { enabled: isGroupMode },
  );

  // Whether the current member is the host (can submit the group order)
  const isGroupHost = !!(groupCart && groupSession && groupCart.host_member_id === groupSession.member_id);

  // Auto-redirect all members to status page when group cart is submitted
  useEffect(() => {
    if (!groupCart) return;
    if (groupCart.status === 'submitted') {
      if (groupCart.order_code) {
        router.replace(`/status/${groupCart.order_code}`);
      } else {
        // Cart is stuck submitted with no order (checkout failed mid-way).
        // Clear the stale session so the user can start fresh.
        clearLocalGroupSession();
        setGroupSession(null);
        setSubmitError('Sesi pesanan bareng telah berakhir. Silakan mulai sesi baru dari menu.');
      }
    }
  }, [groupCart?.status, groupCart?.order_code, router]);

  // Cancel / kicked detection
  useEffect(() => {
    if (groupCart?.status === 'cancelled') {
      router.replace('/menu');
    }
  }, [groupCart?.status, router]);

  useEffect(() => {
    if (!tableNotice) return;
    const timer = setTimeout(() => {
      setTableNotice(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [tableNotice]);

  const handleScanSuccess = useCallback((scanned: string, scannedBranchId: string | null) => {
    const prev = localStorage.getItem(TABLE_KEY);
    setTableNumber(scanned);
    localStorage.setItem(TABLE_KEY, scanned);
    if (scannedBranchId) {
      setBranchId(scannedBranchId);
      localStorage.setItem(BRANCH_KEY, scannedBranchId);
    }
    if (prev && prev !== scanned) {
      setTableNotice(`Nomor meja berhasil diubah dari Meja ${prev} ke Meja ${scanned}!`);
    } else {
      setTableNotice(`Terhubung ke Meja ${scanned}!`);
    }
  }, []);

  useEffect(() => {
    // Restore group session from localStorage if ?group= param is present or if active session exists
    const groupCode = searchParams.get('group');
    const existingGroup = getLocalGroupSession();
    if (existingGroup && (!groupCode || existingGroup.code === groupCode)) {
      setGroupSession(existingGroup);
      setName(existingGroup.name);
    }

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
        } else {
          setCart([]);
        }
      } else {
        setCart([]);
      }
    } catch {
      setCart([]);
    }

    const fromQr     = searchParams.get('table');
    const fromBranch = searchParams.get('branch');
    if (fromQr && fromQr.trim()) {
      const clean = fromQr.trim().toUpperCase();
      const storedTable = localStorage.getItem(TABLE_KEY);
      if (storedTable && storedTable !== clean) {
        setTableNotice(`Nomor meja diperbarui dari Meja ${storedTable} ke Meja ${clean}!`);
      }
      setTableNumber(clean);
      localStorage.setItem(TABLE_KEY, clean);
    } else {
      const storedTable = localStorage.getItem(TABLE_KEY);
      if (storedTable) setTableNumber(storedTable);
    }
    if (fromBranch && fromBranch.trim()) {
      setBranchId(fromBranch.trim());
      localStorage.setItem(BRANCH_KEY, fromBranch.trim());
    } else {
      const storedBranch = localStorage.getItem(BRANCH_KEY);
      if (storedBranch) setBranchId(storedBranch);
    }

    // Pre-fill name from group session
    const groupCodeParam = searchParams.get('group');
    if (groupCodeParam) {
      const existing = getLocalGroupSession();
      if (existing?.code === groupCodeParam) {
        setName(existing.name);
      }
    }

    setLoaded(true);
  }, [searchParams]);

  const { info: branchInfo, refresh: refreshBranchInfo } = useBranchInfo(branchId);
  const estWaitMinutes =
    typeof branchInfo?.est_wait_minutes === 'number' && branchInfo.est_wait_minutes > 0
      ? branchInfo.est_wait_minutes
      : null;
  const isPaused = branchInfo?.accepting_orders === false;
  const pauseMsg =
    branchInfo?.pause_message ||
    'Maaf, pemesanan sedang dijeda sementara. Silakan hubungi barista ya.';

  // Refresh branch info every 60s and on tab visibility (ordering-pause check)
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

  const persistCart = useCallback((next: CartItem[]) => {
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  }, []);

  const updateQuantity = useCallback(
    (key: string, delta: number) => {
      const next = cart
        .map((c) =>
          (c.lineKey || c.id) === key
            ? { ...c, quantity: c.quantity + delta }
            : c,
        )
        .filter((c) => c.quantity > 0);
      persistCart(next);
    },
    [cart, persistCart],
  );

  const removeItem = useCallback(
    (key: string) => {
      persistCart(cart.filter((c) => (c.lineKey || c.id) !== key));
    },
    [cart, persistCart],
  );

  const subtotal  = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleConfirm = async () => {
    // Group order path
    if (isGroupMode && groupSession) {
      if (submitting) return;
      if (!groupCart || groupCart.items.length === 0) {
        setSubmitError('Keranjang bersama masih kosong. Silakan pilih menu bersama temanmu terlebih dahulu.');
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const resolvedBranch = branchId || (typeof window !== 'undefined' ? localStorage.getItem(BRANCH_KEY) : null);
        const payload = {
          customer_name: name.trim() || groupSession.name,
          payment_method: payment,
          notes: notes.trim() || undefined,
          group_cart_code: groupSession.code,
          member_token: groupSession.member_token,
          ...(resolvedBranch ? { branch_id: resolvedBranch } : {}),
        };

        const res = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || !data?.order) {
          if (res.status === 409 && data?.code === 'ORDERS_PAUSED') refreshBranchInfo();
          setSubmitError(data?.error || 'Gagal menyimpan pesanan. Silakan coba lagi.');
          setSubmitting(false);
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        const order: OrderSnapshot = data.order;
        try {
          saveOrderToHistory(order.order_code);
          const snapshot = { ...order };
          localStorage.setItem(ORDER_SNAPSHOT_PREFIX + order.order_code, JSON.stringify(snapshot));
          localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(snapshot));
        } catch {}

        // Don't clear group session here — the polling hook will catch status=submitted
        setOrderTotal(order.total);
        setOrderCode(order.order_code);
      } catch {
        setSubmitError('Koneksi bermasalah. Periksa internet kamu dan coba lagi.');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Solo order path (unchanged)
    if (submitting || cart.length === 0 || !name.trim() || !tableNumber.trim()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const resolvedBranch = branchId || (typeof window !== 'undefined' ? localStorage.getItem(BRANCH_KEY) : null);
      const payload = {
        customer_name:  name.trim(),
        table_number:   tableNumber.trim(),
        payment_method: payment,
        notes:          notes.trim() || undefined,
        // Send menu_item id + quantity + optional note
        items: cart.map((c) => ({
          id:       c.id,
          quantity: c.quantity,
          note:     c.note?.trim() || undefined,
        })),
        // Include branch_id only when we have one (may be null for single-branch sites)
        ...(resolvedBranch ? { branch_id: resolvedBranch } : {}),
      };

      const res = await fetch('/api/orders/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data?.order) {
        // Handle ORDERS_PAUSED race condition — refresh branch info to show banner
        if (res.status === 409 && data?.code === 'ORDERS_PAUSED') {
          refreshBranchInfo();
        }
        // Server returned a structured error — show it inline, keep cart
        setSubmitError(data?.error || 'Gagal menyimpan pesanan. Silakan coba lagi.');
        setSubmitting(false);
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      const order: OrderSnapshot = data.order;

      // Persist the authoritative server snapshot to localStorage
      try {
        const snapshot = {
          order_code:     order.order_code,
          customer_name:  order.customer_name,
          table_number:   order.table_number,
          items:          order.items,
          subtotal:       order.subtotal,
          total:          order.total,
          payment_method: order.payment_method,
          notes:          order.notes,
          status:         order.status,
          created_at:     order.created_at,
        };
        localStorage.setItem(ORDER_SNAPSHOT_PREFIX + order.order_code, JSON.stringify(snapshot));
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(snapshot));
        saveOrderToHistory(order.order_code);
      } catch {
        // Ignore storage errors — order is already saved server-side
      }

      // Clear cart only after successful save
      localStorage.removeItem(CART_KEY);
      setOrderTotal(order.total);
      setOrderCode(order.order_code);
    } catch {
      setSubmitError('Koneksi bermasalah. Periksa internet kamu dan coba lagi.');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return <div className="min-h-screen bg-cream" />;
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (orderCode) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100 shadow-soft-lg p-8 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-coffee-700" />
          </div>
          <h1 className="text-xl font-extrabold text-coffee-900">Pesanan Diterima!</h1>
          <p className="mt-2 text-charcoal/60 text-sm">
            Barista sedang menyiapkan pesananmu dan akan diantar ke meja.
          </p>

          <div className="mt-6 rounded-xl bg-coffee-50 p-4 text-left space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal/50">Kode Pesanan</span>
              <span className="font-bold text-coffee-900">{orderCode}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal/50">Meja</span>
              <span className="font-bold text-coffee-900">{tableNumber}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal/50">Total Bayar</span>
              <span className="font-bold text-coffee-700">{formatPrice(orderTotal)}</span>
            </div>
          </div>

          <button
            onClick={() => router.push(`/status/${orderCode}`)}
            className="mt-6 w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Lihat Status Pesanan
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <button
              onClick={() => router.push('/orders')}
              className="py-2.5 rounded-xl bg-coffee-50 text-coffee-800 font-semibold text-xs hover:bg-coffee-100/80 transition-colors"
            >
              Riwayat Pesanan
            </button>
            <button
              onClick={() => router.push('/menu')}
              className="py-2.5 rounded-xl border border-coffee-100 text-coffee-700 font-semibold text-xs hover:bg-coffee-50 transition-colors"
            >
              Kembali ke Menu
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Empty cart state (solo mode only; group mode always has a cart) ──────────
  if (!isGroupMode && cart.length === 0) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8 text-coffee-300" />
          </div>
          <p className="text-charcoal/60 font-medium">Keranjang kamu masih kosong</p>
          <button
            onClick={() => router.push('/menu')}
            className="mt-4 px-5 py-3 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Pilih Menu
          </button>
        </div>
      </div>
    );
  }

  // ── Main checkout form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream pb-52 sm:pb-56">
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
            <h1 className="font-bold text-coffee-900">Checkout</h1>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coffee-50 text-coffee-700 text-xs font-medium">
              <QrCode className="w-3.5 h-3.5" />
              {itemCount} item
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* Group mode banner */}
        {isGroupMode && groupCart && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="p-4 rounded-2xl bg-coffee-700/5 border border-coffee-700/20 flex items-start gap-3"
          >
            <Users className="w-5 h-5 text-coffee-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-coffee-900 text-sm">Pesan Bareng — {groupCart.members.length} orang</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {groupCart.members.map((m) => (
                  <span
                    key={m.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      m.id === groupSession?.member_id
                        ? 'bg-coffee-700 text-cream border-coffee-700'
                        : m.is_ready
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-coffee-50 text-coffee-700 border-coffee-200'
                    }`}
                  >
                    {m.is_host && <Crown className="w-2.5 h-2.5" />}
                    {m.name}
                    {m.is_ready && m.id !== groupSession?.member_id && ' ✓'}
                  </span>
                ))}
              </div>
              <p className="text-xs text-charcoal/50 mt-2">
                Total gabungan: <strong className="text-coffee-700">{formatPrice(groupCart.total)}</strong>
                {' · '}{groupCart.items.length} item
              </p>
            </div>
          </motion.div>
        )}

        {/* Missing table alert — not shown in group mode */}
        {!tableNumber && !isGroupMode && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 flex items-start gap-3 text-amber-900 shadow-soft"
          >
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm space-y-2">
              <p className="font-bold">QR Meja Belum Terdeteksi</p>
              <p className="text-amber-800/90 leading-relaxed">
                Pemesanan hanya dapat dilakukan melalui scan QR code di meja. Kamu bisa scan langsung menggunakan Google Lens, Kamera HP, atau kamera website ini!
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors shadow-soft active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" /> Buka Scanner Kamera
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/menu')}
                  className="inline-flex items-center gap-1.5 font-bold text-coffee-800 underline hover:text-coffee-950 text-xs px-2 py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Menu
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pause ordering banner */}
        {isPaused && (
          <motion.div
            key="pause-banner"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 flex items-start gap-3 text-amber-900"
          >
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm space-y-1">
              <p className="font-bold">Pemesanan Sedang Dijeda ☕</p>
              <p className="text-amber-800/90 leading-relaxed">{pauseMsg}</p>
            </div>
          </motion.div>
        )}

        {/* Table notice (after scan) */}
        <AnimatePresence>
          {tableNotice && (
            <motion.div
              key="table-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                {tableNotice}
              </div>
              <button
                onClick={() => setTableNotice(null)}
                className="text-emerald-600 hover:text-emerald-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline submit error */}
        <AnimatePresence>
          {submitError && (
            <motion.div
              key="submit-error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3"
            >
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Pesanan gagal dikirim</p>
                <p className="text-xs text-red-700 mt-0.5">{submitError}</p>
              </div>
              <button
                onClick={() => setSubmitError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Order items */}
        <motion.section variants={fadeInUp} initial="hidden" animate="visible">
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            {isGroupMode ? 'Rincian Pesanan Bareng' : 'Pesananmu'}
          </h2>
          <div className="bg-white rounded-2xl border border-coffee-100/80 divide-y divide-coffee-100/60 overflow-hidden">
            {isGroupMode && groupCart ? (
              groupCart.items.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 rounded-xl bg-coffee-50 flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6 text-coffee-300" />
                  </div>
                  <p className="text-sm font-semibold text-coffee-900">Keranjang bersama masih kosong</p>
                  <p className="text-xs text-charcoal/50 mt-1">
                    Belum ada menu yang dipilih olehmu atau teman satu mejamu.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/menu?group=${encodeURIComponent(groupCart.code)}`)}
                    className="mt-4 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-colors active:scale-95"
                  >
                    Pilih Menu Bersama
                  </button>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {groupCart.members.map((member) => {
                    const memberItems = groupCart.items.filter((i) => i.member_id === member.id);
                    if (memberItems.length === 0) return null;
                    return (
                      <div key={member.id} className="space-y-2">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-coffee-50 rounded-xl text-xs font-bold text-coffee-900 border border-coffee-200/50">
                          {member.is_host && <Crown className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                          <span>{member.name} {member.id === groupSession?.member_id && '(Kamu)'}</span>
                          <span className="text-[11px] font-normal text-charcoal/50 ml-auto">
                            {memberItems.reduce((s, i) => s + i.quantity, 0)} item · {formatPrice(memberItems.reduce((s, i) => s + (i.effective_price || i.price) * i.quantity, 0))}
                          </span>
                        </div>
                        <div className="divide-y divide-coffee-50">
                          {memberItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 py-2.5 px-1">
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
                                <p className="font-semibold text-coffee-900 text-sm truncate">{item.name}</p>
                                {item.note && (
                                  <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                                    Catatan: {item.note}
                                  </p>
                                )}
                                <p className="text-coffee-600 text-xs font-bold mt-0.5">
                                  {formatPrice(item.effective_price || item.price)} × {item.quantity}
                                </p>
                              </div>
                              <span className="font-bold text-coffee-900 text-sm">
                                {formatPrice((item.effective_price || item.price) * item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <AnimatePresence initial={false}>
                {cart.map((item) => {
                  const itemKey = item.lineKey || item.id;
                  return (
                    <motion.div
                      key={itemKey}
                      layout
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 p-4"
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
                        <p className="font-semibold text-coffee-900 text-sm truncate">{item.name}</p>
                        {item.note && (
                          <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                            Catatan: {item.note}
                          </p>
                        )}
                        <p className="text-coffee-600 text-sm font-bold mt-0.5">{formatPrice(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(itemKey, -1)}
                          className="w-7 h-7 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-coffee-900 w-5 text-center text-sm">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(itemKey, 1)}
                          className="w-7 h-7 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeItem(itemKey)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                          aria-label={`Hapus ${item.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </motion.section>

        {/* Customer details */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.05 }}
        >
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Detail Pemesan
          </h2>
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Nama Pemesan
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masukkan nama kamu"
                className="w-full px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Nomor Meja
              </label>
              {tableNumber ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-coffee-50/70 border border-coffee-200/80 text-coffee-900 text-sm">
                  <div className="flex items-center gap-2.5">
                    <QrCode className="w-4 h-4 text-coffee-700 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-base block leading-tight">Meja {tableNumber}</span>
                      <span className="text-[11px] text-coffee-600/80">Terverifikasi dari scan QR</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coffee-100 hover:bg-coffee-200/80 text-coffee-900 font-bold text-xs transition-colors active:scale-95 shadow-2xs"
                    title="Pindah meja dan scan stiker QR di meja baru"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-coffee-700" />
                    <span>Pindah Meja</span>
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Wajib Scan QR Code Meja</span>
                  </div>
                  <p className="text-amber-800/85 leading-relaxed">
                    Nomor meja tidak dapat diisi atau diubah manual. Silakan scan QR code di meja kamu langsung lewat kamera website ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors text-xs active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5" /> Buka Scanner
                  </button>
                </div>
              )}
            </div>
            {/* Lock badge for non-editable table field */}
            <div className="flex items-center gap-1.5 text-charcoal/35 text-[11px]">
              <Lock className="w-3 h-3" />
              <span>Nomor meja hanya bisa diubah lewat scan QR code di meja</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Catatan untuk Barista (opsional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: less sugar, tanpa es"
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors resize-none"
              />
            </div>
          </div>
        </motion.section>

        {/* Payment method */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Metode Pembayaran
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPayment('cash')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                payment === 'cash'
                  ? 'bg-coffee-700 border-coffee-700 text-cream shadow-soft'
                  : 'bg-white border-coffee-100 text-charcoal/70 hover:bg-coffee-50'
              }`}
            >
              <Wallet className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">Tunai di Kasir</span>
            </button>
            <button
              onClick={() => setPayment('qris')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                payment === 'qris'
                  ? 'bg-coffee-700 border-coffee-700 text-cream shadow-soft'
                  : 'bg-white border-coffee-100 text-charcoal/70 hover:bg-coffee-50'
              }`}
            >
              <ScanLine className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">QRIS</span>
            </button>
          </div>
        </motion.section>
      </div>

      {/* Sticky confirm bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-cream/95 backdrop-blur-xl border-t border-coffee-100/60 z-40 pb-[max(0px,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              {isGroupMode && groupCart ? (
                <>
                  <span className="text-charcoal/60 text-sm block">
                    Total bareng ({groupCart.items.reduce((s, i) => s + i.quantity, 0)} item)
                  </span>
                  {estWaitMinutes ? (
                    <span className="text-[11px] font-semibold text-coffee-700/90 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-coffee-600" />
                      {branchInfo?.est_wait_now != null
                        ? (branchInfo.queue_count ?? 0) > 0
                          ? `Antrean: ${branchInfo.queue_count} pesanan · ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`
                          : `Perkiraan ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`
                        : `Perkiraan waktu tunggu ±${estWaitMinutes} menit`}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="text-charcoal/60 text-sm block">Total ({itemCount} item)</span>
                  {estWaitMinutes ? (
                    <span className="text-[11px] font-semibold text-coffee-700/90 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-coffee-600" />
                      {branchInfo?.est_wait_now != null
                        ? (branchInfo.queue_count ?? 0) > 0
                          ? `Antrean saat ini: ${branchInfo.queue_count} pesanan · perkiraan ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`
                          : `Perkiraan ±${roundToFiveMinutes(branchInfo.est_wait_now)} menit`
                        : `Perkiraan waktu tunggu ±${estWaitMinutes} menit`}
                    </span>
                  ) : null}
                </>
              )}
            </div>
            <span className="text-xl font-extrabold text-coffee-800">
              {isGroupMode && groupCart ? formatPrice(groupCart.total) : formatPrice(subtotal)}
            </span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={
              submitting ||
              isPaused ||
              (isGroupMode
                ? !groupSession || !groupCart || groupCart.items.length === 0 || !isGroupHost
                : (!name.trim() || !tableNumber.trim() || cart.length === 0))
            }
            className={`w-full py-4 rounded-xl font-bold transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft ${
              isPaused ? 'bg-amber-500 text-white' : 'bg-coffee-700 text-cream hover:bg-coffee-800'
            }`}
          >
            {submitting
              ? 'Memproses...'
              : isPaused
                ? 'Pemesanan Sedang Dijeda'
                : isGroupMode && groupCart
                  ? isGroupHost
                    ? `Konfirmasi Pesanan Bareng — ${formatPrice(groupCart.total)}`
                    : 'Menunggu Host Mengonfirmasi...'
                  : `Konfirmasi Pesanan — ${formatPrice(subtotal)}`}
          </button>
          {submitError && (
            <p className="text-center text-xs text-red-600 font-semibold mt-2">
              {submitError}
            </p>
          )}
          {isGroupMode && groupCart && groupCart.items.length === 0 && (
            <p className="text-center text-xs text-amber-700 font-semibold mt-2">
              Keranjang bersama masih kosong. Tambahkan menu terlebih dahulu sebelum konfirmasi.
            </p>
          )}
          {isGroupMode && groupCart && groupCart.items.length > 0 && !isGroupHost && (
            <p className="text-center text-xs text-charcoal/50 font-medium mt-2 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" /> Hanya host yang dapat mengirim pesanan bersama
            </p>
          )}
          {!isGroupMode && (!name.trim() || !tableNumber.trim()) && (
            <p className="text-center text-xs mt-2 font-medium">
              {!tableNumber.trim() ? (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="text-amber-700 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" /> Scan QR code meja di sini untuk memesan
                </button>
              ) : (
                <span className="text-charcoal/40">Isi nama pemesan untuk melanjutkan</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        currentTable={tableNumber || null}
        title={tableNumber ? 'Scan QR Meja Baru' : 'Scan QR Code Meja'}
        subtitle={
          tableNumber
            ? `Saat ini Meja ${tableNumber}. Arahkan kamera ke stiker QR meja baru.`
            : 'Arahkan kamera ke stiker QR di mejamu untuk memesan'
        }
      />
    </div>
  );
}
