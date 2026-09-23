'use client';

import { useEffect, useState, useCallback, useRef, forwardRef, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Clock,
  TrendingUp,
  ChevronRight,
  X,
  AlertCircle,
  CheckCircle2,
  Coffee,
  CreditCard,
  Wallet,
  MessageSquare,
  Loader2,
  Building2,
  Pencil,
  Trash2,
  Calendar,
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../AdminShell';
import { fadeInUp, staggerContainer } from '@/lib/animations';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type Order = {
  id: string;
  order_code: string;
  customer_name: string;
  table_number: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'qris';
  notes: string | null;
  status: OrderStatus;
  branch_id: string;
  created_at: string;
  branches?: { name: string } | null;
};

type Branch = { id: string; name: string };

type DayStats = {
  count: number;
  revenue: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 6000;

const STATUS_TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Pending' },
  { key: 'preparing', label: 'Disiapkan' },
  { key: 'ready', label: 'Siap Diantar' },
  { key: 'completed', label: 'Selesai' },
  { key: 'cancelled', label: 'Dibatalkan' },
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Disiapkan',
  ready: 'Siap Diantar',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-coffee-100 text-coffee-700',
  cancelled: 'bg-red-100 text-red-700',
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'completed',
};

const NEXT_LABELS: Partial<Record<OrderStatus, string>> = {
  pending: 'Mulai Siapkan',
  preparing: 'Siap Diantar',
  ready: 'Selesai',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );
}

function formatPrice(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID') + ',-';
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

function isToday(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const profile = useAdminProfile();
  const supabase = useRef(getSupabase());

  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<OrderStatus | 'all'>('all');
  const [timeRange, setTimeRange] = useState<'today' | 'all'>('today');

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // ── Fetch orders ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    const sb = supabase.current;
    let query = sb.from('orders').select('*, branches(name)').order('created_at', { ascending: false });

    if (profile.role === 'admin' && profile.branch_id) {
      query = query.eq('branch_id', profile.branch_id);
    } else if (profile.role === 'superadmin' && selectedBranchId !== 'all') {
      query = query.eq('branch_id', selectedBranchId);
    }

    const { data } = await query;
    if (data) {
      setOrders(data as Order[]);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, [profile, selectedBranchId]);

  // ── Fetch branches (superadmin only) ─────────────────────────────────────

  const fetchBranches = useCallback(async () => {
    if (profile.role !== 'superadmin') return;
    const { data } = await supabase.current.from('branches').select('id, name').order('name');
    if (data) setBranches(data as Branch[]);
  }, [profile.role]);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    fetchOrders();
    const id = setInterval(fetchOrders, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchOrders]);

  // ── Status update ─────────────────────────────────────────────────────────

  async function advanceStatus(orderId: string, nextStatus: OrderStatus) {
    setUpdating(orderId);
    await supabase.current.from('orders').update({ status: nextStatus }).eq('id', orderId);
    await fetchOrders();
    setUpdating(null);
  }

  async function cancelOrder(orderId: string) {
    setUpdating(orderId);
    await supabase.current.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
    await fetchOrders();
    setUpdating(null);
    setCancelTarget(null);
  }

  async function deleteOrder(orderId: string) {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/admin/orders?id=${orderId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Gagal menghapus pesanan.');
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err: any) {
      console.error('Failed to delete order:', err);
      // Fallback attempt with direct supabase client
      const { error: sbErr } = await supabase.current.from('orders').delete().eq('id', orderId);
      if (sbErr) {
        alert(err?.message || sbErr.message || 'Gagal menghapus pesanan.');
      }
    } finally {
      await fetchOrders();
      setUpdating(null);
      setDeleteTarget(null);
    }
  }

  // ── Stats calculation ─────────────────────────────────────────────────────

  const statsOrders = orders.filter((o) => {
    if (o.status === 'cancelled') return false;
    if (timeRange === 'today') return isToday(o.created_at);
    return true;
  });

  const stats: DayStats = {
    count: statsOrders.length,
    revenue: statsOrders.reduce((s, o) => s + o.total, 0),
  };

  const branchStats = new Map<string, DayStats>();
  if (profile.role === 'superadmin') {
    for (const o of statsOrders) {
      const prev = branchStats.get(o.branch_id) ?? { count: 0, revenue: 0 };
      branchStats.set(o.branch_id, { count: prev.count + 1, revenue: prev.revenue + o.total });
    }
  }

  // ── Filtered orders ───────────────────────────────────────────────────────

  const filtered = orders.filter((o) =>
    statusTab === 'all' ? true : o.status === statusTab,
  );

  const tabCounts = Object.fromEntries(
    STATUS_TABS.map(({ key }) => [
      key,
      key === 'all' ? orders.length : orders.filter((o) => o.status === key).length,
    ]),
  ) as Record<string, number>;

  return (
    <div className="space-y-6">
      {/* Stats header & Timeframe selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl border border-coffee-100/80 p-4">
        <div>
          <h2 className="font-extrabold text-coffee-900 text-base">Ringkasan Penjualan</h2>
          <p className="text-xs text-charcoal/50 mt-0.5">
            Statistik pesanan aktif dan selesai (tidak termasuk dibatalkan).
          </p>
        </div>

        {/* Timeframe Toggle Pills */}
        <div className="flex items-center gap-1.5 bg-coffee-50/80 p-1 rounded-xl border border-coffee-100 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTimeRange('today')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              timeRange === 'today'
                ? 'bg-coffee-700 text-cream shadow-sm'
                : 'text-charcoal/60 hover:text-coffee-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Hari Ini</span>
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              timeRange === 'all'
                ? 'bg-coffee-700 text-cream shadow-sm'
                : 'text-charcoal/60 hover:text-coffee-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Semua Waktu</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3"
      >
        <motion.div
          variants={fadeInUp}
          className="bg-white rounded-2xl border border-coffee-100/80 p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <Coffee className="w-4 h-4 text-coffee-500" />
            <span className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">
              {timeRange === 'today' ? 'Pesanan Hari Ini' : 'Total Semua Pesanan'}
            </span>
          </div>
          <p className="text-3xl font-extrabold text-coffee-900">{stats.count}</p>
        </motion.div>
        <motion.div
          variants={fadeInUp}
          className="bg-white rounded-2xl border border-coffee-100/80 p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-coffee-500" />
            <span className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">
              {timeRange === 'today' ? 'Revenue Today' : 'All-Time Revenue'}
            </span>
          </div>
          <p className="text-xl font-extrabold text-coffee-900">{formatPrice(stats.revenue)}</p>
        </motion.div>
      </motion.div>

      {/* Per-branch stats — only shown in superadmin all-branch view when 2+ branches */}
      {profile.role === 'superadmin' && selectedBranchId === 'all' && branches.length > 1 && (
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-4">
          <p className="text-xs font-bold text-charcoal/50 uppercase tracking-wide mb-3">
            By Location ({timeRange === 'today' ? 'Today' : 'All Time'})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {branches.map((b) => {
              const s = branchStats.get(b.id) ?? { count: 0, revenue: 0 };
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100/60"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-coffee-400" />
                    <span className="text-sm font-semibold text-coffee-900 truncate max-w-[120px]">
                      {b.name}
                    </span>
                  </div>
                  <div className="text-right ml-2">
                    <p className="text-xs font-bold text-coffee-800">{s.count} orders</p>
                    <p className="text-[10px] text-charcoal/50">{formatPrice(s.revenue)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls: branch selector + refresh indicator */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Branch selector: only show dropdown when 2+ branches exist.
            Single-branch tenants just see their shop name — no concept of "branches". */}
        {profile.role === 'superadmin' && branches.length > 1 && (
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-coffee-100 text-charcoal text-sm font-semibold focus:outline-none focus:border-coffee-400 transition-colors"
          >
            <option value="all">All Locations</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {profile.role === 'superadmin' && branches.length === 1 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-coffee-50 border border-coffee-100">
            <Building2 className="w-4 h-4 text-coffee-500" />
            <span className="text-sm font-semibold text-coffee-900">{branches[0]?.name}</span>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="flex items-center gap-1.5 text-xs text-charcoal/40 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live · updated {relativeTime(lastRefresh.toISOString())}
          </span>
          <button
            onClick={() => { setLoading(true); fetchOrders(); }}
            className="p-2 rounded-xl hover:bg-coffee-50 text-charcoal/50 hover:text-coffee-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
              statusTab === key
                ? 'bg-coffee-700 text-cream shadow-soft'
                : 'bg-white text-charcoal/60 border border-coffee-100/80 hover:bg-coffee-50 hover:text-coffee-900'
            }`}
          >
            {label}
            {tabCounts[key] > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  statusTab === key ? 'bg-coffee-800/60 text-cream/80' : 'bg-coffee-100 text-coffee-700'
                }`}
              >
                {tabCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-coffee-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-coffee-200 mb-3" />
          <p className="text-charcoal/50 font-medium">Tidak ada pesanan</p>
          <p className="text-xs text-charcoal/35 mt-1">
            {statusTab === 'all' ? 'Belum ada pesanan masuk.' : `Tidak ada pesanan dengan status "${STATUS_LABELS[statusTab as OrderStatus]}".`}
          </p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isSuperadmin={profile.role === 'superadmin'}
                updating={updating === order.id}
                onAdvance={(nextStatus) => advanceStatus(order.id, nextStatus)}
                onCancelRequest={() => setCancelTarget(order.id)}
                onEdit={() => setEditTarget(order)}
                onDelete={() => setDeleteTarget(order)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Cancel confirmation modal */}
      <AnimatePresence>
        {cancelTarget && (
          <ModalBackdrop onClose={() => setCancelTarget(null)}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft-lg"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-coffee-900">Batalkan Pesanan?</h3>
                  <p className="text-xs text-charcoal/50 mt-0.5">Tindakan ini tidak dapat diurungkan.</p>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setCancelTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-coffee-100 text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors"
                >
                  Kembali
                </button>
                <button
                  onClick={() => cancelTarget && cancelOrder(cancelTarget)}
                  disabled={!!updating}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {updating ? 'Membatalkan...' : 'Ya, Batalkan'}
                </button>
              </div>
            </motion.div>
          </ModalBackdrop>
        )}
      </AnimatePresence>

      {/* Delete Order Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <ModalBackdrop onClose={() => setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft-lg"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-coffee-900">Hapus Riwayat Pesanan?</h3>
                  <p className="text-xs text-charcoal/50 mt-0.5">
                    Pesanan <span className="font-mono font-bold text-coffee-900">#{deleteTarget.order_code}</span> ({deleteTarget.customer_name}) akan dihapus permanen dari riwayat database.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-coffee-100 text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => deleteOrder(deleteTarget.id)}
                  disabled={!!updating}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {updating ? (
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

      {/* Edit Order Modal */}
      <AnimatePresence>
        {editTarget && (
          <EditOrderModal
            order={editTarget}
            branches={branches}
            isSuperadmin={profile.role === 'superadmin'}
            onClose={() => setEditTarget(null)}
            onSaved={fetchOrders}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

const OrderCard = forwardRef<
  HTMLDivElement,
  {
    order: Order;
    isSuperadmin: boolean;
    updating: boolean;
    onAdvance: (next: OrderStatus) => void;
    onCancelRequest: () => void;
    onEdit: () => void;
    onDelete: () => void;
  }
>(function OrderCard(
  {
    order,
    isSuperadmin,
    updating,
    onAdvance,
    onCancelRequest,
    onEdit,
    onDelete,
  },
  ref
) {
  const next = NEXT_STATUS[order.status];
  const nextLabel = NEXT_LABELS[order.status];
  const canAdvance = !!next && order.status !== 'completed' && order.status !== 'cancelled';
  const canCancel = order.status !== 'completed' && order.status !== 'cancelled';

  return (
    <motion.div
      ref={ref}
      variants={fadeInUp}
      layout
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-2xl border border-coffee-100/80 p-4 flex flex-col gap-3 shadow-soft justify-between"
    >
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-coffee-900 font-mono tracking-wide">
                #{order.order_code}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-charcoal/50">
              <span className="font-semibold text-charcoal/70">Meja {order.table_number}</span>
              <span>·</span>
              <span>{order.customer_name}</span>
              {isSuperadmin && order.branches?.name && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {order.branches.name}
                  </span>
                </>
              )}
            </div>
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
            {/* Edit & Delete Action Buttons */}
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-charcoal/40 hover:text-coffee-700 hover:bg-coffee-50 transition-colors"
              title="Edit pesanan"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-charcoal/40 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Hapus riwayat pesanan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-1">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-charcoal/80">
                {item.quantity}× {item.name}
              </span>
              <span className="text-coffee-700 font-semibold text-xs">
                {formatPrice(item.price * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="flex items-start gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
            <MessageSquare className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 italic">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-coffee-50 pt-3 mt-1">
        <div>
          <p className="text-base font-extrabold text-coffee-800">{formatPrice(order.total)}</p>
          <p className="flex items-center gap-1 text-[10px] text-charcoal/40 mt-0.5">
            <Clock className="w-3 h-3" />
            {relativeTime(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canCancel && (
            <button
              onClick={onCancelRequest}
              disabled={updating}
              className="p-2 rounded-xl text-charcoal/40 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              title="Batalkan pesanan"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {canAdvance && (
            <button
              onClick={() => onAdvance(next!)}
              disabled={updating}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60"
            >
              {updating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  {nextLabel}
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// ─── Edit Order Modal ─────────────────────────────────────────────────────────

function EditOrderModal({
  order,
  branches,
  isSuperadmin,
  onClose,
  onSaved,
}: {
  order: Order;
  branches: Branch[];
  isSuperadmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabase();

  const [customerName, setCustomerName] = useState(order.customer_name);
  const [tableNumber, setTableNumber] = useState(order.table_number);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris'>(order.payment_method);
  const [notes, setNotes] = useState(order.notes ?? '');
  const [branchId, setBranchId] = useState(order.branch_id);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || !tableNumber.trim()) {
      setError('Nama pelanggan dan nomor meja wajib diisi.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload: any = {
      customer_name: customerName.trim(),
      table_number: tableNumber.trim(),
      status,
      payment_method: paymentMethod,
      notes: notes.trim() || null,
    };

    if (isSuperadmin) {
      payload.branch_id = branchId;
    }

    const { error: err } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', order.id);

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
        className="w-full max-w-md bg-white rounded-2xl p-6 shadow-soft-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4 border-b border-coffee-50 pb-3">
          <div>
            <h3 className="font-bold text-coffee-900 text-base">Edit Riwayat Pesanan</h3>
            <p className="text-xs text-charcoal/50 font-mono mt-0.5">#{order.order_code}</p>
          </div>
          <button onClick={onClose} className="text-charcoal/40 hover:text-charcoal transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200/80 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Nama Pelanggan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                No. Meja <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Status Pesanan
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                className="w-full px-3.5 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 cursor-pointer"
              >
                <option value="pending">Pending</option>
                <option value="preparing">Disiapkan</option>
                <option value="ready">Siap Diantar</option>
                <option value="completed">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Metode Pembayaran
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'qris')}
                className="w-full px-3.5 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 cursor-pointer"
              >
                <option value="cash">Tunai (Cash)</option>
                <option value="qris">QRIS</option>
              </select>
            </div>
          </div>

          {isSuperadmin && branches.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Cabang
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
              Catatan
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan pesanan..."
              className="w-full px-3.5 py-2 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 resize-none"
            />
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
                <span>Simpan Perubahan</span>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </ModalBackdrop>
  );
}

// ─── Modal Backdrop ───────────────────────────────────────────────────────────

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
