'use client';

/**
 * /admin/reservations — Manajemen Reservasi
 *
 * Menampilkan reservasi dengan filter tanggal dan status.
 * Setiap baris menampilkan: Meja, Jumlah Tamu, Acara (Occasion), Catatan,
 * Daftar Pre-order Items, Total, dan Bukti Pembayaran (Signed URL).
 *
 * Aksi:
 *   - Konfirmasi pembayaran (menangani SLOT_LOST -> perlu refund)
 *   - Batalkan
 *   - Tandai tidak hadir
 *   - Selesai
 *   - Tandai refund selesai
 *
 * Scoped ke branch_id untuk admin cabang, superadmin dapat memilih cabang.
 * Realtime updates via Supabase postgres_changes channel.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Phone,
  Mail,
  StickyNote,
  Building2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
  X,
  Table as TableIcon,
  Search,
  ChevronDown,
  ChevronUp,
  UserX,
  CheckCheck,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { useAdminProfile } from '../../AdminShell';
import { formatDateTime, formatHHMM, APP_TIMEZONE } from '@/lib/datetime';
import { fadeInUp, staggerContainer } from '@/lib/animations';

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string };

type PreorderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selected_options?: Record<string, string>;
  item_notes?: string;
};

type Reservation = {
  id:                string;
  code:              string;
  branch_id:         string;
  table_id:          string;
  customer_name:     string;
  customer_phone:    string;
  customer_email:    string | null;
  party_size:        number;
  duration_minutes:  number;
  occasion:          string | null;
  notes:             string | null;
  items:             PreorderItem[];
  preorder_total:    number;
  payment_method:    string | null;
  paid_at:           string | null;
  refund_status:     'none' | 'needs_refund' | 'refunded';
  starts_at:         string;
  ends_at:           string;
  status:            ReservationStatus;
  hold_expires_at:   string | null;
  payment_proof_url: string | null;
  needs_kitchen_order?: boolean;
  created_at:        string;
  table:             { code: string; label: string | null } | null;
};

type ReservationStatus =
  | 'pending_payment'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'expired';

type DateFilterPreset = 'today' | 'tomorrow' | 'week' | 'all' | 'custom';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabase() { return getSupabaseBrowserClient(); }

function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending_payment:       'Menunggu Bayar',
  awaiting_confirmation: 'Menunggu Konfirmasi',
  confirmed:             'Dikonfirmasi',
  seated:                'Duduk / Aktif',
  completed:             'Selesai',
  cancelled:             'Dibatalkan',
  no_show:               'Tidak Hadir',
  expired:               'Kedaluwarsa',
};

const STATUS_BADGES: Record<ReservationStatus, string> = {
  pending_payment:       'bg-amber-100 text-amber-800 border-amber-200',
  awaiting_confirmation: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed:             'bg-emerald-100 text-emerald-800 border-emerald-200',
  seated:                'bg-purple-100 text-purple-800 border-purple-200',
  completed:             'bg-coffee-100 text-coffee-700 border-coffee-200',
  cancelled:             'bg-red-100 text-red-700 border-red-200',
  no_show:               'bg-charcoal/10 text-charcoal/60 border-charcoal/20',
  expired:               'bg-gray-100 text-gray-500 border-gray-200',
};

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE });
}
function jakartaTomorrow(): string {
  const d = new Date(Date.now() + 86400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const profile  = useAdminProfile();
  const supabase = getSupabase();

  const [branches, setBranches]                 = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [reservations, setReservations]         = useState<Reservation[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [actionLoading, setActionLoading]       = useState<string | null>(null);
  const [proofLoading, setProofLoading]         = useState<string | null>(null);
  const [errorMsg, setErrorMsg]                 = useState<string | null>(null);
  const [successMsg, setSuccessMsg]             = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter]             = useState<DateFilterPreset>('today');
  const [customDate, setCustomDate]             = useState<string>(jakartaToday());
  const [statusFilter, setStatusFilter]         = useState<string>('all');
  const [search, setSearch]                     = useState('');

  // Expanded items
  const [expandedId, setExpandedId]             = useState<string | null>(null);

  // ── Load branches ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      if (profile.role === 'admin') {
        const { data } = await supabase
          .from('branches')
          .select('id, name')
          .eq('id', profile.branch_id!);
        if (data?.length) {
          setBranches(data);
          setSelectedBranchId(data[0].id);
        }
      } else {
        const { data } = await supabase.from('branches').select('id, name').order('created_at');
        if (data?.length) {
          setBranches(data);
          setSelectedBranchId(data[0].id);
        }
      }
    }
    void load();
  }, [profile, supabase]);

  // ── Load reservations ──────────────────────────────────────────────────────

  const loadReservations = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    setErrorMsg(null);

    let query = supabase
      .from('reservations')
      .select('*, table:tables(code, label)')
      .eq('branch_id', selectedBranchId)
      .order('starts_at', { ascending: false });

    // Date filter
    if (dateFilter === 'today') {
      const d = jakartaToday();
      query = query.gte('starts_at', `${d}T00:00:00+07:00`).lte('starts_at', `${d}T23:59:59+07:00`);
    } else if (dateFilter === 'tomorrow') {
      const d = jakartaTomorrow();
      query = query.gte('starts_at', `${d}T00:00:00+07:00`).lte('starts_at', `${d}T23:59:59+07:00`);
    } else if (dateFilter === 'week') {
      const from = jakartaToday();
      const to   = new Date(Date.now() + 7 * 86400_000).toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE });
      query = query.gte('starts_at', `${from}T00:00:00+07:00`).lte('starts_at', `${to}T23:59:59+07:00`);
    } else if (dateFilter === 'custom' && customDate) {
      query = query.gte('starts_at', `${customDate}T00:00:00+07:00`).lte('starts_at', `${customDate}T23:59:59+07:00`);
    }

    // Status filter
    if (statusFilter === 'needs_refund') {
      query = query.eq('refund_status', 'needs_refund');
    } else if (statusFilter === 'active') {
      query = query.in('status', ['pending_payment', 'awaiting_confirmation', 'confirmed', 'seated']);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      setErrorMsg('Gagal memuat reservasi: ' + error.message);
    } else {
      setReservations((data ?? []) as Reservation[]);
    }
    setLoading(false);
  }, [selectedBranchId, dateFilter, customDate, statusFilter, supabase]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedBranchId) return;

    const channel = supabase
      .channel(`reservations_admin_${selectedBranchId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'reservations',
          filter: `branch_id=eq.${selectedBranchId}`,
        },
        () => {
          void loadReservations();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedBranchId, supabase, loadReservations]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleAction = async (res: Reservation, action: string) => {
    const actionLabels: Record<string, string> = {
      confirm:       'Konfirmasi pembayaran',
      cancel:        'Batalkan reservasi',
      no_show:       'Tandai tidak hadir',
      complete:      'Selesaikan reservasi',
      mark_refunded: 'Tandai refund selesai',
    };

    const label = actionLabels[action] || action;
    if (!confirm(`Apakah Anda yakin ingin ${label} untuk reservasi ${res.code}?`)) {
      return;
    }

    setActionLoading(res.id + '-' + action);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch(`/api/admin/reservations/${res.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      });

      const json = await response.json();

      if (!response.ok) {
        if (json.code === 'SLOT_LOST') {
          setErrorMsg(
            `⚠️ SLOT_LOST: ${json.error || 'Waktu hold habis dan slot terisi lain.'} Status otomatis ditandai 'Perlu Refund'.`,
          );
        } else {
          setErrorMsg(json.error || 'Gagal mengubah status reservasi.');
        }
      } else {
        setSuccessMsg(`Berhasil: ${label} untuk kode ${res.code}.`);
        await loadReservations();
      }
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryKitchenOrder = async (res: Reservation) => {
    if (!confirm(`Buat pesanan ulang ke dapur untuk reservasi ${res.code}?`)) return;
    setActionLoading(res.id + '-retry_order');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const resp = await fetch(`/api/admin/reservations/${res.id}/retry-kitchen-order`, {
        method: 'POST',
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Gagal membuat pesanan dapur ulang.');
      } else {
        setSuccessMsg(json.message || 'Pesanan dapur berhasil dibuat ulang.');
        await loadReservations();
      }
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Signed proof opener ────────────────────────────────────────────────────

  const handleOpenProof = async (reservationId: string) => {
    setProofLoading(reservationId);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/proof`);
      const data = await res.json();
      if (!res.ok || !data.signedUrl) {
        alert(data.error || 'Gagal memuat bukti pembayaran.');
      } else {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      alert('Gagal memuat bukti pembayaran.');
    } finally {
      setProofLoading(null);
    }
  };

  // ── Filtered search ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return reservations;
    const q = search.toLowerCase();
    return reservations.filter((r) => {
      return (
        r.code.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_phone.includes(q) ||
        (r.table?.code && r.table.code.toLowerCase().includes(q)) ||
        (r.occasion && r.occasion.toLowerCase().includes(q))
      );
    });
  }, [reservations, search]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-coffee-900">Manajemen Reservasi</h1>
          <p className="text-xs text-charcoal/50 mt-0.5">
            Daftar reservasi meja, verifikasi bukti pembayaran, dan kelola sesi meja.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReservations()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-coffee-100 text-coffee-700 text-xs font-bold hover:bg-coffee-50 transition-colors active:scale-95 shadow-soft"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Segarkan
        </button>
      </div>

      {/* Branch selector (superadmin only) */}
      {profile.role === 'superadmin' && branches.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-charcoal/60 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Cabang:
          </span>
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBranchId(b.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedBranchId === b.id
                  ? 'bg-coffee-700 text-cream shadow-soft'
                  : 'bg-white border border-coffee-100 text-charcoal/70 hover:bg-coffee-50'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white p-3 rounded-2xl border border-coffee-100 shadow-soft space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date presets */}
          {(['today', 'tomorrow', 'week', 'all', 'custom'] as DateFilterPreset[]).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                dateFilter === f
                  ? 'bg-coffee-700 text-cream'
                  : 'bg-coffee-50/60 border border-coffee-100 text-charcoal/60 hover:bg-coffee-100/60'
              }`}
            >
              {f === 'today' ? 'Hari Ini' : f === 'tomorrow' ? 'Besok' : f === 'week' ? '7 Hari' : f === 'all' ? 'Semua' : 'Pilih Tanggal'}
            </button>
          ))}

          {dateFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="px-2.5 py-1 rounded-xl text-xs bg-white border border-coffee-200 text-charcoal focus:outline-none focus:border-coffee-400"
            />
          )}

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-coffee-200 text-charcoal/80 focus:outline-none focus:border-coffee-400 ml-auto"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif (Belum Selesai)</option>
            <option value="awaiting_confirmation">Menunggu Konfirmasi</option>
            <option value="pending_payment">Menunggu Bayar</option>
            <option value="confirmed">Dikonfirmasi</option>
            <option value="seated">Duduk / Seated</option>
            <option value="completed">Selesai</option>
            <option value="needs_refund">Perlu Refund</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="no_show">Tidak Hadir</option>
            <option value="expired">Kedaluwarsa</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-charcoal/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari berdasarkan kode, nama tamu, no. telepon, atau meja..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-coffee-50/40 border border-coffee-100 text-charcoal placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Reservations Table / Cards */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-coffee-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-coffee-100 text-charcoal/40 text-xs">
          <CalendarDays className="w-10 h-10 mx-auto mb-2 text-charcoal/20" />
          Tidak ada reservasi yang cocok dengan filter yang dipilih.
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {filtered.map((res) => {
            const isExpanded = expandedId === res.id;
            const items = Array.isArray(res.items) ? res.items : [];
            const isTerminal = ['completed', 'cancelled', 'no_show', 'expired'].includes(res.status);

            return (
              <motion.div
                key={res.id}
                variants={fadeInUp}
                className="bg-white rounded-2xl border border-coffee-100 shadow-soft overflow-hidden transition-all hover:border-coffee-200"
              >
                {/* Main Card Row */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {/* Header info */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-extrabold text-coffee-800 bg-coffee-50 px-2.5 py-1 rounded-lg border border-coffee-200">
                        {res.code}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                          STATUS_BADGES[res.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_LABELS[res.status] || res.status}
                      </span>
                      {res.refund_status === 'needs_refund' && (
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-600 text-white animate-pulse flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Perlu Refund
                        </span>
                      )}
                      {res.refund_status === 'refunded' && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-charcoal/10 text-charcoal/60">
                          Refund Selesai
                        </span>
                      )}
                      {res.needs_kitchen_order && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3 text-orange-600" />
                          Pesanan Dapur Gagal
                        </span>
                      )}
                    </div>

                    {/* Time & Total */}
                    <div className="text-right">
                      <div className="text-xs font-extrabold text-coffee-900">
                        {formatIdr(res.preorder_total || 0)}
                      </div>
                      <div className="text-[11px] text-charcoal/50">
                        {formatDateTime(res.starts_at)}
                      </div>
                    </div>
                  </div>

                  {/* Summary Columns */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-coffee-50 text-xs">
                    {/* Table */}
                    <div className="flex items-center gap-1.5 text-charcoal/80">
                      <TableIcon className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-charcoal/40 block">Meja</span>
                        <span className="font-bold text-coffee-900">
                          Meja {res.table?.code || '-'}
                        </span>
                        {res.table?.label && (
                          <span className="text-[10px] text-charcoal/50 ml-1">
                            ({res.table.label})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Guest & Occasion */}
                    <div className="flex items-center gap-1.5 text-charcoal/80">
                      <Users className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-charcoal/40 block">Tamu & Acara</span>
                        <span className="font-bold text-coffee-900">{res.party_size} orang</span>
                        {res.occasion && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1 rounded ml-1">
                            {res.occasion}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Customer */}
                    <div className="flex items-center gap-1.5 text-charcoal/80">
                      <Phone className="w-3.5 h-3.5 text-coffee-600 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-charcoal/40 block">Pemesan</span>
                        <span className="font-bold text-coffee-900 truncate block max-w-[120px]">
                          {res.customer_name}
                        </span>
                        <span className="text-[10px] font-mono text-charcoal/50">
                          {res.customer_phone}
                        </span>
                      </div>
                    </div>

                    {/* Pre-order & Proof Action */}
                    <div className="flex items-center justify-end gap-2">
                      {res.payment_proof_url ? (
                        <button
                          type="button"
                          disabled={proofLoading === res.id}
                          onClick={() => void handleOpenProof(res.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold border border-blue-200 transition-colors disabled:opacity-50"
                        >
                          {proofLoading === res.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3 h-3" />
                          )}
                          Bukti Bayar
                        </button>
                      ) : (
                        <span className="text-[11px] text-charcoal/40 italic">Tanpa Bukti</span>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : res.id)}
                        className="flex items-center gap-0.5 text-[11px] text-coffee-700 hover:text-coffee-900 font-bold px-2 py-1 rounded-lg hover:bg-coffee-50 transition-colors"
                      >
                        Detail
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Notes snippet if present */}
                  {res.notes && (
                    <div className="text-[11px] text-charcoal/70 bg-amber-50/50 border border-amber-100 rounded-lg p-2 flex items-start gap-1.5">
                      <StickyNote className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Catatan:</strong> {res.notes}
                      </span>
                    </div>
                  )}

                  {/* Pre-order items quick preview */}
                  {items.length > 0 && (
                    <div className="text-[11px] text-charcoal/70 flex items-center gap-1.5 flex-wrap">
                      <ShoppingBag className="w-3 h-3 text-coffee-600 flex-shrink-0" />
                      <span className="font-semibold text-coffee-900">Pre-order:</span>
                      {items.map((it, idx) => (
                        <span
                          key={idx}
                          className="bg-coffee-50 text-coffee-800 px-2 py-0.5 rounded-md font-medium text-[10px] border border-coffee-100"
                        >
                          {it.quantity}x {it.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Allowed Action Transitions Row */}
                  <div className="pt-2 border-t border-coffee-50 flex items-center gap-2 flex-wrap">
                    {/* 1. Confirm: allowed for pending_payment and awaiting_confirmation */}
                    {(res.status === 'pending_payment' || res.status === 'awaiting_confirmation') && (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => void handleAction(res, 'confirm')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        {actionLoading === `${res.id}-confirm` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Konfirmasi Pembayaran
                      </button>
                    )}

                    {/* 2. Selesai: allowed for confirmed or seated */}
                    {(res.status === 'confirmed' || res.status === 'seated') && (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => void handleAction(res, 'complete')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-coffee-700 hover:bg-coffee-800 text-cream text-xs font-bold transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        {actionLoading === `${res.id}-complete` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5" />
                        )}
                        Selesai
                      </button>
                    )}

                    {/* 3. Tandai Tidak Hadir: allowed for confirmed */}
                    {res.status === 'confirmed' && (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => void handleAction(res, 'no_show')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all disabled:opacity-50 active:scale-95"
                      >
                        {actionLoading === `${res.id}-no_show` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserX className="w-3.5 h-3.5" />
                        )}
                        Tandai Tidak Hadir
                      </button>
                    )}

                    {/* 4. Batalkan: allowed for any non-terminal status */}
                    {!isTerminal && (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => void handleAction(res, 'cancel')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-all disabled:opacity-50 active:scale-95 border border-red-200"
                      >
                        {actionLoading === `${res.id}-cancel` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        Batalkan
                      </button>
                    )}

                    {/* Retry Kitchen Order */}
                    {res.needs_kitchen_order && (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => void handleRetryKitchenOrder(res)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        {actionLoading === `${res.id}-retry_order` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShoppingBag className="w-3.5 h-3.5" />
                        )}
                        Buat pesanan ulang
                      </button>
                    )}

                    {/* 5. Tandai Refund Selesai: allowed when refund_status === 'needs_refund' */}
                    {res.refund_status === 'needs_refund' && (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => void handleAction(res, 'mark_refunded')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-95 ml-auto shadow-sm"
                      >
                        {actionLoading === `${res.id}-mark_refunded` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Tandai Refund Selesai
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Detailed Panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-coffee-100 bg-coffee-50/20 p-4 space-y-3 text-xs"
                    >
                      <div className="font-bold text-coffee-900 flex items-center gap-1">
                        <ShoppingBag className="w-4 h-4 text-coffee-700" />
                        Rincian Pre-order & Pembayaran
                      </div>

                      {/* Items table */}
                      <div className="bg-white rounded-xl border border-coffee-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-coffee-50/70 border-b border-coffee-100 text-[10px] text-charcoal/50 uppercase font-semibold">
                              <th className="p-2.5">Menu</th>
                              <th className="p-2.5 text-center">Qty</th>
                              <th className="p-2.5 text-right">Harga</th>
                              <th className="p-2.5 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-coffee-50">
                            {items.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-charcoal/40 italic">
                                  Tidak ada item pre-order.
                                </td>
                              </tr>
                            ) : (
                              items.map((it, idx) => (
                                <tr key={idx} className="hover:bg-coffee-50/30">
                                  <td className="p-2.5">
                                    <div className="font-semibold text-coffee-900">{it.name}</div>
                                    {it.selected_options && Object.keys(it.selected_options).length > 0 && (
                                      <div className="text-[10px] text-charcoal/50">
                                        {Object.entries(it.selected_options).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                      </div>
                                    )}
                                    {it.item_notes && (
                                      <div className="text-[10px] text-amber-700 italic">
                                        Catatan: {it.item_notes}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center font-bold text-charcoal/80">
                                    {it.quantity}
                                  </td>
                                  <td className="p-2.5 text-right text-charcoal/60">
                                    {formatIdr(it.price)}
                                  </td>
                                  <td className="p-2.5 text-right font-bold text-coffee-900">
                                    {formatIdr(it.price * it.quantity)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-coffee-50/40 border-t border-coffee-100 font-extrabold text-coffee-900">
                              <td colSpan={3} className="p-2.5 text-right">
                                Total Pre-order:
                              </td>
                              <td className="p-2.5 text-right text-sm text-coffee-800">
                                {formatIdr(res.preorder_total || 0)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Customer contact info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                        <div>
                          <span className="text-charcoal/50">Durasi:</span>{' '}
                          <span className="font-semibold text-charcoal/80">{res.duration_minutes || 120} menit</span>
                        </div>
                        {res.customer_email && (
                          <div>
                            <span className="text-charcoal/50">Email:</span>{' '}
                            <span className="font-semibold text-charcoal/80">{res.customer_email}</span>
                          </div>
                        )}
                        {res.payment_method && (
                          <div>
                            <span className="text-charcoal/50">Metode Bayar:</span>{' '}
                            <span className="font-semibold text-charcoal/80">{res.payment_method.toUpperCase()}</span>
                          </div>
                        )}
                        {res.paid_at && (
                          <div>
                            <span className="text-charcoal/50">Waktu Bayar:</span>{' '}
                            <span className="font-semibold text-emerald-700">{formatDateTime(res.paid_at)}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
