'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
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
  Loader2,
} from 'lucide-react';
import { fadeInUp } from '@/lib/animations';
import QrScannerModal from '@/components/ui/QrScannerModal';
import { saveOrderToHistory } from '@/lib/order-history';
import { getItemLineKey, calculateOptionsTotal, formatItemOptionsSummary, type SelectedOption } from '@/lib/item-options';
import { loadCart, saveCart, clearCart, CART_KEY } from '@/lib/cart';
import { fetchBranchMenu } from '@/lib/menu-availability';
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
  selectedOptions?: SelectedOption[] | null;
};

type UnavailableItem = {
  id: string;
  name: string;
  reason: 'sold_out' | 'not_found' | 'price_changed';
  old_price?: number;
  new_price?: number;
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

function CheckoutSkeleton() {
  return (
    <div className="min-h-screen bg-cream pb-52 animate-pulse">
      {/* Top bar skeleton */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="w-16 h-4 bg-coffee-200/50 rounded-lg" />
          <div className="w-24 h-5 bg-coffee-200/60 rounded-lg" />
          <div className="w-16 h-6 bg-coffee-200/50 rounded-lg" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Order items skeleton */}
        <div className="space-y-3">
          <div className="w-24 h-4 bg-coffee-200/60 rounded" />
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg bg-coffee-100/70 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-4 bg-coffee-200/60 rounded" />
                  <div className="w-20 h-3 bg-coffee-100/70 rounded" />
                </div>
                <div className="w-16 h-4 bg-coffee-200/60 rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* Customer details skeleton */}
        <div className="space-y-3">
          <div className="w-28 h-4 bg-coffee-200/60 rounded" />
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 space-y-4">
            <div className="h-11 bg-coffee-100/50 rounded-xl" />
            <div className="h-11 bg-coffee-100/50 rounded-xl" />
          </div>
        </div>
      </div>
      {/* Bottom bar skeleton */}
      <div className="fixed bottom-0 left-0 right-0 bg-cream/95 border-t border-coffee-100/60 p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex justify-between">
            <div className="w-20 h-4 bg-coffee-200/60 rounded" />
            <div className="w-24 h-6 bg-coffee-200/60 rounded" />
          </div>
          <div className="w-full h-12 bg-coffee-200/70 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
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
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [unavailableModalData, setUnavailableModalData] = useState<{
    items: UnavailableItem[];
    error?: string;
  } | null>(null);
  const [cartUnavailableIds, setCartUnavailableIds] = useState<Set<string>>(new Set());
  const idempotencyKeyRef = useRef<string>('');
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
  const isAwaitingOrderCode = isGroupMode && groupCart?.status === 'submitted' && !groupCart?.order_code;
  const submittedSinceRef = useRef<number | null>(null);

  // Auto-redirect all members to status page when group cart is submitted
  useEffect(() => {
    if (!groupCart) return;

    if (groupCart.status === 'submitted') {
      if (groupCart.order_code) {
        submittedSinceRef.current = null;
        router.replace(`/status/${groupCart.order_code}`);
        return;
      }

      // Polled group cart has status 'submitted' but NO order_code yet:
      // Do NOT clear the group session. Keep polling (~1.5s).
      if (submittedSinceRef.current === null) {
        submittedSinceRef.current = Date.now();
      }

      const elapsed = Date.now() - submittedSinceRef.current;
      const remainingMs = Math.max(0, 30_000 - elapsed);

      const timeoutId = setTimeout(() => {
        // Only treat it as stuck after 30 seconds with still no order_code
        submittedSinceRef.current = null;
        clearLocalGroupSession();
        setGroupSession(null);
        setSubmitError('Sesi pesanan bareng telah berakhir. Silakan mulai sesi baru dari menu.');
      }, remainingMs);

      return () => clearTimeout(timeoutId);
    } else {
      submittedSinceRef.current = null;
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
      const storedItems = loadCart();
      if (storedItems.length > 0) {
        setCart(
          storedItems.map((item: any) => ({
            ...item,
            lineKey: item.lineKey || getItemLineKey(item.id, item.note),
            note: item.note || undefined,
          })),
        );
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

  // Re-verify menu availability on mount and branchId change
  useEffect(() => {
    if (!loaded || cart.length === 0) return;
    let active = true;
    fetchBranchMenu(branchId).then((menuItems) => {
      if (!active || !menuItems || menuItems.length === 0) return;
      const soldOutSet = new Set<string>();
      const menuMap = new Map(menuItems.map((m) => [m.id, m]));
      for (const item of cart) {
        const found = menuMap.get(item.id);
        if (!found || found.sold_out || found.is_available === false) {
          soldOutSet.add(item.id);
        }
      }
      setCartUnavailableIds(soldOutSet);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [loaded, branchId, cart.length]);

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
    saveCart(next as any, tableNumber);
  }, [tableNumber]);

  const removeUnavailableItemsFromCart = useCallback(() => {
    const next = cart.filter((c) => !cartUnavailableIds.has(c.id));
    persistCart(next);
    setCartUnavailableIds(new Set());
    setUnavailableModalData(null);
    idempotencyKeyRef.current = '';
  }, [cart, cartUnavailableIds, persistCart]);

  const acceptPriceChanges = useCallback((priceMap: Map<string, number>) => {
    const next = cart.map((c) => {
      const newPrice = priceMap.get(c.id);
      return newPrice !== undefined ? { ...c, price: newPrice } : c;
    });
    persistCart(next);
    setUnavailableModalData(null);
    idempotencyKeyRef.current = '';
  }, [cart, persistCart]);

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
      const next = cart.filter((c) => (c.lineKey || c.id) !== key);
      persistCart(next);
      // Clean up cartUnavailableIds if item removed
      setCartUnavailableIds((prev) => {
        const nextSet = new Set(prev);
        const removedItem = cart.find((c) => (c.lineKey || c.id) === key);
        if (removedItem) nextSet.delete(removedItem.id);
        return nextSet;
      });
    },
    [cart, persistCart],
  );

  const subtotal  = cart.reduce((sum, c) => sum + (c.price + calculateOptionsTotal(c.selectedOptions)) * c.quantity, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleConfirm = async () => {
    setIsNetworkError(false);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `idem_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    }

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
          idempotency_key: idempotencyKeyRef.current,
          ...(resolvedBranch ? { branch_id: resolvedBranch } : {}),
        };

        const res = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || !data?.order) {
          if (res.status === 409 && data?.code === 'ITEMS_UNAVAILABLE') {
            const items = (data.items || []) as UnavailableItem[];
            setUnavailableModalData({ items, error: data.error });
            setCartUnavailableIds(new Set(items.filter((i) => i.reason === 'sold_out' || i.reason === 'not_found').map((i) => i.id)));
            idempotencyKeyRef.current = '';
            setSubmitting(false);
            return;
          }
          if (res.status === 503 || data?.code === 'ORDERING_PAUSED' || data?.code === 'ORDERS_PAUSED') {
            refreshBranchInfo();
            setSubmitError(data?.error || 'Pesanan sedang dijeda sementara. Silakan coba lagi sebentar lagi.');
            setSubmitting(false);
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
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

        clearCart();
        idempotencyKeyRef.current = '';
        setOrderTotal(order.total);
        setOrderCode(order.order_code);
      } catch {
        setIsNetworkError(true);
        setSubmitError('Pesanan belum terkirim. Periksa koneksi internet kamu lalu coba lagi.');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Solo order path
    if (submitting || cart.length === 0 || !name.trim() || !tableNumber.trim() || cartUnavailableIds.size > 0) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const resolvedBranch = branchId || (typeof window !== 'undefined' ? localStorage.getItem(BRANCH_KEY) : null);
      const payload = {
        customer_name:  name.trim(),
        table_number:   tableNumber.trim(),
        payment_method: payment,
        notes:          notes.trim() || undefined,
        idempotency_key: idempotencyKeyRef.current,
        // Send menu_item id + quantity + expected_price + optional note + selected options
        items: cart.map((c) => ({
          id:              c.id,
          quantity:        c.quantity,
          expected_price:  c.price,
          note:            c.note?.trim() || undefined,
          selected_options: c.selectedOptions?.length ? c.selectedOptions : undefined,
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
        if (res.status === 409 && data?.code === 'ITEMS_UNAVAILABLE') {
          const items = (data.items || []) as UnavailableItem[];
          setUnavailableModalData({ items, error: data.error });
          const soldOuts = new Set(
            items.filter((i) => i.reason === 'sold_out' || i.reason === 'not_found').map((i) => i.id),
          );
          setCartUnavailableIds(soldOuts);
          idempotencyKeyRef.current = '';
          setSubmitting(false);
          return;
        }
        if (res.status === 503 || data?.code === 'ORDERING_PAUSED' || data?.code === 'ORDERS_PAUSED') {
          refreshBranchInfo();
          setSubmitError(data?.error || 'Pesanan sedang dijeda sementara. Silakan coba lagi sebentar lagi.');
          setSubmitting(false);
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
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

      // Clear cart reliably after successful save
      clearCart();
      idempotencyKeyRef.current = '';
      setOrderTotal(order.total);
      setOrderCode(order.order_code);
    } catch {
      setIsNetworkError(true);
      setSubmitError('Pesanan belum terkirim. Periksa koneksi internet kamu lalu coba lagi.');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return <CheckoutSkeleton />;
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
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-coffee-900 text-sm">Pesan Bareng — {groupCart.members.length} orang</p>
                {isAwaitingOrderCode && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Pesanan sedang dikirim...
                  </span>
                )}
              </div>
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

        {/* Submitting order notice */}
        {isAwaitingOrderCode && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-amber-900 text-xs sm:text-sm">
            <Loader2 className="w-4 h-4 text-amber-600 animate-spin flex-shrink-0" />
            <span className="font-semibold">Pesanan sedang dikirim...</span>
          </div>
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide">
              {isGroupMode ? 'Rincian Pesanan Bareng' : 'Pesananmu'}
            </h2>
            {cartUnavailableIds.size > 0 && (
              <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                {cartUnavailableIds.size} menu habis
              </span>
            )}
          </div>

          {/* Sold-out items action banner */}
          {cartUnavailableIds.size > 0 && (
            <div className="mb-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="font-semibold truncate">Ada menu yang habis di keranjangmu.</span>
              </div>
              <button
                type="button"
                onClick={removeUnavailableItemsFromCart}
                className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs active:scale-95 transition-colors whitespace-nowrap shadow-2xs flex items-center gap-1 flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus yang Habis
              </button>
            </div>
          )}

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
                  const isSoldOut = cartUnavailableIds.has(item.id);
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
                            className={`w-full h-full object-cover ${isSoldOut ? 'grayscale opacity-60' : ''}`}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`font-semibold text-sm truncate ${isSoldOut ? 'text-charcoal/40 line-through' : 'text-coffee-900'}`}>{item.name}</p>
                          {isSoldOut && (
                            <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold uppercase tracking-wider">
                              Habis
                            </span>
                          )}
                        </div>
                        {item.selectedOptions && formatItemOptionsSummary(item.selectedOptions) && (
                          <p className="text-xs text-coffee-700 bg-coffee-50/80 border border-coffee-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                            {formatItemOptionsSummary(item.selectedOptions)}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                            Catatan: {item.note}
                          </p>
                        )}
                        <p className={`text-sm font-bold mt-0.5 ${isSoldOut ? 'text-charcoal/40' : 'text-coffee-600'}`}>{formatPrice((item.price + calculateOptionsTotal(item.selectedOptions)) * item.quantity)}</p>
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
          {isNetworkError && (
            <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="truncate">Pesanan belum terkirim. Periksa koneksi internet lalu coba lagi.</span>
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs active:scale-95 transition-colors whitespace-nowrap shadow-2xs flex-shrink-0"
              >
                Coba Lagi
              </button>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={
              submitting ||
              isPaused ||
              isAwaitingOrderCode ||
              cartUnavailableIds.size > 0 ||
              (isGroupMode
                ? !groupSession || !groupCart || groupCart.items.length === 0 || !isGroupHost
                : (!name.trim() || !tableNumber.trim() || cart.length === 0))
            }
            className={`w-full py-4 rounded-xl font-bold transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft ${
              isPaused
                ? 'bg-amber-500 text-white'
                : cartUnavailableIds.size > 0
                ? 'bg-charcoal/20 text-charcoal/50'
                : 'bg-coffee-700 text-cream hover:bg-coffee-800'
            }`}
          >
            {submitting || isAwaitingOrderCode ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Pesanan sedang dikirim...
              </span>
            ) : isPaused ? (
              'Pemesanan Sedang Dijeda'
            ) : cartUnavailableIds.size > 0 ? (
              'Hapus menu yang habis untuk lanjut'
            ) : isGroupMode && groupCart ? (
              isGroupHost
                ? `Konfirmasi Pesanan Bareng — ${formatPrice(groupCart.total)}`
                : 'Menunggu Host Mengonfirmasi...'
            ) : (
              `Konfirmasi Pesanan — ${formatPrice(subtotal)}`
            )}
          </button>
          {submitError && !isNetworkError && (
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

      {/* Unavailable / Changed Items Modal */}
      <AnimatePresence>
        {unavailableModalData && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUnavailableModalData(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-cream rounded-t-3xl shadow-soft-xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <h2 className="font-extrabold text-coffee-900 text-base sm:text-lg">
                    {unavailableModalData.items.some((i) => i.reason === 'price_changed')
                      ? 'Perubahan Menu & Harga'
                      : 'Maaf, Beberapa Menu Habis'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setUnavailableModalData(null)}
                  className="w-8 h-8 rounded-lg hover:bg-coffee-100/60 flex items-center justify-center text-charcoal/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs sm:text-sm text-charcoal/70 mb-4 leading-relaxed">
                {unavailableModalData.error || 'Beberapa menu di keranjangmu sudah habis atau mengalami perubahan harga.'}
              </p>

              <div className="space-y-2 mb-5 max-h-56 overflow-y-auto">
                {unavailableModalData.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white border border-coffee-100 text-xs sm:text-sm"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-coffee-900 truncate">{item.name}</p>
                      {item.reason === 'price_changed' && item.old_price != null && item.new_price != null ? (
                        <p className="text-[11px] text-coffee-700 font-medium mt-0.5">
                          <span className="line-through text-charcoal/40">{formatPrice(item.old_price)}</span>
                          {' → '}
                          <span className="font-bold text-coffee-900">{formatPrice(item.new_price)}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-charcoal/50 mt-0.5">
                          {item.reason === 'sold_out' ? 'Stok saat ini habis' : 'Menu tidak tersedia'}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                        item.reason === 'price_changed'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {item.reason === 'price_changed' ? 'Harga Berubah' : 'Habis'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {unavailableModalData.items.some((i) => i.reason === 'price_changed') && (
                  <button
                    type="button"
                    onClick={() => {
                      const priceMap = new Map<string, number>();
                      for (const it of unavailableModalData.items) {
                        if (it.reason === 'price_changed' && it.new_price != null) {
                          priceMap.set(it.id, it.new_price);
                        }
                      }
                      acceptPriceChanges(priceMap);
                    }}
                    className="w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 shadow-soft"
                  >
                    Perbarui Harga & Lanjutkan
                  </button>
                )}

                {unavailableModalData.items.some((i) => i.reason === 'sold_out' || i.reason === 'not_found') && (
                  <button
                    type="button"
                    onClick={() => {
                      const unavailableIds = new Set(
                        unavailableModalData.items
                          .filter((i) => i.reason === 'sold_out' || i.reason === 'not_found')
                          .map((i) => i.id),
                      );
                      const next = cart.filter((c) => !unavailableIds.has(c.id));
                      persistCart(next);
                      setCartUnavailableIds(new Set());
                      setUnavailableModalData(null);
                      idempotencyKeyRef.current = '';
                    }}
                    className="w-full py-3.5 rounded-xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 transition-colors active:scale-95 shadow-soft flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Hapus dari Keranjang
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setUnavailableModalData(null);
                    router.push('/menu');
                  }}
                  className="w-full py-3 rounded-xl border border-coffee-200 text-coffee-800 font-bold text-sm hover:bg-coffee-50 transition-colors active:scale-95"
                >
                  Kembali ke Menu
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
