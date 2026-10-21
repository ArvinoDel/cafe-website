'use client';

/**
 * /admin/reservations — Manajemen Reservasi
 *
 * Menampilkan semua reservasi untuk cabang yang dipilih.
 * Staff dapat mengkonfirmasi, membatalkan, menandai tidak hadir,
 * atau menyelesaikan reservasi.
 * Realtime updates via Supabase subscription.
 */

import { useEffect, useState, useCallback } from 'react';
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
  TableIcon,
  Search,
  ChevronDown,
  UserX,
  Star,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { useAdminProfile } from '../../AdminShell';
import { formatDateTime, formatHHMM, APP_TIMEZONE } from '@/lib/datetime';
import { fadeInUp, staggerContainer } from '@/lib/animations';

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string };

type Reservation = {
  id:                string;
  code:              string;
  branch_id:         string;
  customer_name:     string;
  customer_phone:    string;
  customer_email:    string | null;
  party_size:        number;
  notes:             string | null;
  starts_at:         string;
  ends_at:           string;
  status:            ReservationStatus;
  hold_expires_at:   string | null;
  preorder_total:    number;
  payment_proof_url: string | null;
  created_at:        string;
  table: { code: string; label: string | null };
};

type ReservationStatus =
  | 'pending_payment'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'completed';

type DateFilter = 'today' | 'tomorrow' | 'week' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabase() { return getSupabaseBrowserClient(); }

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending_payment:      'Menunggu Bayar',
  awaiting_confirmation:'Menunggu Konfirmasi',
  confirmed:            'Dikonfirmasi',
  cancelled:            'Dibatalkan',
  no_show:              'Tidak Hadir',
  completed:            'Selesai',
};

const STATUS_COLORS: Record<ReservationStatus, string> = {
  pending_payment:      'bg-amber-100 text-amber-800 border-amber-200',
  awaiting_confirmation:'bg-blue-100 text-blue-800 border-blue-200',
  confirmed:            'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled:            'bg-red-100 text-red-700 border-red-200',
  no_show:              'bg-charcoal/10 text-charcoal/60 border-charcoal/20',
  completed:            'bg-coffee-100 text-coffee-700 border-coffee-200',
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
  const profile = useAdminProfile();
  const supabase = getSupabase();

  const [branches, setBranches]           = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [reservations, setReservations]   = useState<Reservation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter]       = useState<DateFilter>('today');
  const [statusFilter, setStatusFilter]   = useState<string>('active');
  const [search, setSearch]               = useState('');

  // Selected reservation for detail panel
  const [selected, setSelected]           = useState<Reservation | null>(null);

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
    setError(null);

    let query = supabase
      .from('reservations')
      .select('*, table:tables(code, label)')
      .eq('branch_id', selectedBranchId)
      .order('starts_at', { ascending: true });

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
    }

    // Status filter
    if (statusFilter === 'active') {
      query = query.in('status', ['pending_payment', 'awaiting_confirmation', 'confirmed']);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error: err } = await query;
    if (err) {
      setError('Gagal memuat data reservasi.');
    } else {
      setReservations((data ?? []) as Reservation[]);
    }
    setLoading(false);
  }, [selectedBranchId, dateFilter, statusFilter, supabase]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedBranchId) return;
    const channel = supabase
      .channel(`reservations:${selectedBranchId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'reservations',
        filter: `branch_id=eq.${selectedBranchId}`,
      }, () => { void loadReservations(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [selectedBranchId, supabase, loadReservations]);

  // ── Action ─────────────────────────────────────────────────────────────────

  async function handleAction(res: Reservation, action: string) {
    const label = action === 'confirm' ? 'mengkonfirmasi'
      : action === 'cancel'   ? 'membatalkan'
      : action === 'no_show'  ? 'menandai tidak hadir'
      : 'menyelesaikan';

    if (!confirm(`Yakin ingin ${label} reservasi ${res.code}?`)) return;

    setActionLoading(res.id);
    const r = await fetch(`/api/admin/reservations/${res.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await r.json();
    if (!r.ok) {
      alert(json.error ?? 'Gagal memperbarui reservasi.');
    } else {
      // Update locally & re-close panel
      setSelected(null);
      void loadReservations();
    }
    setActionLoading(null);
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = reservations.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.code.toLowerCase().includes(q) ||
      r.customer_name.toLowerCase().includes(q) ||
      r.customer_phone.includes(q) ||
      r.table?.code.toLowerCase().includes(q)
    );
  });

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-coffee-900">Reservasi</h1>
          <p className="text-sm text-charcoal/50 mt-0.5">Kelola semua reservasi meja.</p>
        </div>
        <button
          onClick={loadReservations}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-coffee-100 text-coffee-700 text-sm font-bold hover:bg-coffee-50 transition-colors active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Perbarui
        </button>
      </div>

      {/* Branch selector (superadmin only) */}
      {profile.role === 'superadmin' && branches.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBranchId(b.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedBranchId === b.id
                  ? 'bg-coffee-700 text-cream'
                  : 'bg-white border border-coffee-100 text-charcoal/70 hover:bg-coffee-50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Date filter */}
        {(['today', 'tomorrow', 'week', 'all'] as DateFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setDateFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              dateFilter === f
                ? 'bg-coffee-700 text-cream'
                : 'bg-white border border-coffee-100 text-charcoal/60 hover:bg-coffee-50'
            }`}
          >
            {f === 'today' ? 'Hari Ini' : f === 'tomorrow' ? 'Besok' : f === 'week' ? '7 Hari' : 'Semua'}
          </button>
        ))}

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-coffee-100 text-charcoal/70 focus:outline-none focus:border-coffee-400 transition-colors"
        >
          <option value="active">Aktif</option>
          <option value="all">Semua Status</option>
          <option value="pending_payment">Menunggu Bayar</option>
          <option value="awaiting_confirmation">Menunggu Konfirmasi</option>
          <option value="confirmed">Dikonfirmasi</option>
          <option value="cancelled">Dibatalkan</option>
          <option value="no_show">Tidak Hadir</option>
          <option value="completed">Selesai</option>
        </select>

        {/* Search */}
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-charcoal/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, kode, meja..."
            className="w-full pl-8 pr-4 py-1.5 rounded-xl text-xs bg-white border border-coffee-100 text-charcoal focus:outline-none focus:border-coffee-400 transition-colors"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-coffee-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-charcoal/40 text-sm">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 text-charcoal/20" />
          Tidak ada reservasi di filter ini.
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-2"
        >
          {filtered.map((res) => {
            const isLoading = actionLoading === res.id;
            const terminal  = ['cancelled', 'no_show', 'completed'].includes(res.status);
            return (
              <motion.div
                key={res.id}
                variants={fadeInUp}
                className={`bg-white rounded-2xl border ${
                  selected?.id === res.id ? 'border-coffee-300 shadow-soft-md' : 'border-coffee-100'
                } overflow-hidden`}
              >
                {/* Row header */}
                <button
                  onClick={() => setSelected(selected?.id === res.id ? null : res)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-coffee-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      res.status === 'confirmed' ? 'bg-emerald-500'
                      : res.status === 'awaiting_confirmation' ? 'bg-blue-500'
                      : res.status === 'pending_payment' ? 'bg-amber-500'
                      : 'bg-charcoal/30'
                    }`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-coffee-700 bg-coffee-50 px-2 py-0.5 rounded-lg">
                          {res.code}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[res.status]}`}>
                          {STATUS_LABELS[res.status]}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-coffee-900 truncate mt-0.5">{res.customer_name}</p>
                      <p className="text-xs text-charcoal/50">
                        Meja {res.table?.code} · {formatHHMM(res.starts_at)} WIB · {res.party_size} orang
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-charcoal/40 flex-shrink-0 transition-transform ${
                    selected?.id === res.id ? 'rotate-180' : ''
                  }`} />
                </button>

                {/* Detail panel */}
                <AnimatePresence>
                  {selected?.id === res.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3 border-t border-coffee-100">
                        {/* Info grid */}
                        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Waktu" value={formatDateTime(res.starts_at)} />
                          <InfoRow icon={<TableIcon className="w-3.5 h-3.5" />} label="Meja" value={`${res.table?.code}${res.table?.label ? ` – ${res.table.label}` : ''}`} />
                          <InfoRow icon={<Users className="w-3.5 h-3.5" />} label="Jumlah" value={`${res.party_size} orang`} />
                          <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Telepon" value={res.customer_phone} />
                          {res.customer_email && (
                            <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={res.customer_email} />
                          )}
                          {res.notes && (
                            <InfoRow icon={<StickyNote className="w-3.5 h-3.5" />} label="Catatan" value={res.notes} />
                          )}
                          {res.payment_proof_url && (
                            <div className="col-span-2">
                              <a
                                href={res.payment_proof_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-coffee-600 underline underline-offset-2"
                              >
                                Lihat Bukti Pembayaran
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        {!terminal && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {(res.status === 'pending_payment' || res.status === 'awaiting_confirmation') && (
                              <ActionButton
                                label="Konfirmasi"
                                icon={<Check className="w-3.5 h-3.5" />}
                                color="emerald"
                                loading={isLoading}
                                onClick={() => handleAction(res, 'confirm')}
                              />
                            )}
                            {res.status === 'confirmed' && (
                              <>
                                <ActionButton
                                  label="Selesai"
                                  icon={<Star className="w-3.5 h-3.5" />}
                                  color="coffee"
                                  loading={isLoading}
                                  onClick={() => handleAction(res, 'complete')}
                                />
                                <ActionButton
                                  label="Tidak Hadir"
                                  icon={<UserX className="w-3.5 h-3.5" />}
                                  color="amber"
                                  loading={isLoading}
                                  onClick={() => handleAction(res, 'no_show')}
                                />
                              </>
                            )}
                            <ActionButton
                              label="Batalkan"
                              icon={<X className="w-3.5 h-3.5" />}
                              color="red"
                              loading={isLoading}
                              onClick={() => handleAction(res, 'cancel')}
                            />
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-charcoal/40 mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <span className="text-[10px] font-bold text-charcoal/40 uppercase tracking-wide">{label}</span>
        <p className="text-xs font-semibold text-coffee-900 break-words">{value}</p>
      </div>
    </div>
  );
}

function ActionButton({
  label, icon, color, loading, onClick,
}: { label: string; icon: React.ReactNode; color: string; loading: boolean; onClick: () => void }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    coffee:  'bg-coffee-700 hover:bg-coffee-800 text-cream',
    amber:   'bg-amber-500 hover:bg-amber-600 text-white',
    red:     'bg-red-100 hover:bg-red-200 text-red-700 border border-red-200',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors active:scale-95 disabled:opacity-60 ${colors[color] ?? colors.coffee}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
