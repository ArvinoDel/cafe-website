'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Printer,
  Coffee,
  Building2,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Download,
  Globe,
  Sparkles,
  Plus,
  Pencil,
  Unlock,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Filter,
  Search,
  QrCode,
  CalendarDays,
  Settings2,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { useAdminProfile } from '../../AdminShell';
import { useBrand } from '@/components/providers/BrandProvider';
import { formatHHMM, secondsUntil, formatCountdown } from '@/lib/datetime';

type Branch = { id: string; name: string };

type TableRow = {
  id:        string;
  branch_id: string;
  code:      string;
  label:     string | null;
  seats:     number;
  is_active: boolean;
};

type TableSessionRow = {
  id:              string;
  table_id:        string;
  branch_id:       string;
  status:          string;
  expires_at:      string;
  started_at:      string;
  released_reason: string | null;
  upgraded_at:     string | null;
};

type UpcomingRes = {
  id:            string;
  starts_at:     string;
  ends_at:       string;
  party_size:    number;
  customer_name: string;
  status:        string;
};

type TableStatus = 'empty' | 'held' | 'occupied' | 'seated' | 'reserved' | 'inactive';

type TableCard = TableRow & {
  tableStatus:          TableStatus;
  statusLabel:          string;
  session:              TableSessionRow | null;
  remainingSec:         number;
  upcomingReservations: UpcomingRes[];
  activeReservation:    UpcomingRes | null;
};

function getSupabase() {
  return getSupabaseBrowserClient();
}

export default function TableQrPage() {
  const router        = useRouter();
  const profile       = useAdminProfile();
  const { brandName } = useBrand();

  const [origin, setOrigin]     = useState('');
  const [baseUrl, setBaseUrl]   = useState('');
  const [showUrlConfig, setShowUrlConfig] = useState(false);
  const [copiedTable, setCopiedTable]     = useState<string | null>(null);

  // Branch selection
  const [branches, setBranches]                     = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId]     = useState<string>('');
  const [selectedBranchName, setSelectedBranchName] = useState<string>('');
  const [loadingBranches, setLoadingBranches]       = useState(false);

  // Status Meja live grid
  const [tableCards, setTableCards]       = useState<TableCard[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading]   = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading]   = useState<string | null>(null);

  // Filters & view
  const [statusFilter, setStatusFilter] = useState<'all' | 'empty' | 'occupied_or_held' | 'reserved' | 'inactive'>('all');
  const [searchQuery, setSearchQuery]   = useState('');

  // Add / Edit Modal
  const [modalMode, setModalMode] = useState<'create' | 'batch' | 'edit' | null>(null);
  const [modalData, setModalData] = useState<{
    id?:     string;
    code:    string;
    label:   string;
    seats:   number;
    prefix?: string;
    from?:   number;
    count?:  number;
  }>({ code: '', label: '', seats: 4, prefix: 'A', from: 1, count: 10 });

  const [modalLoading, setModalLoading] = useState(false);
  const [modalMsg, setModalMsg]         = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Tick every second for countdown display
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const curOrigin = window.location.origin;
      setOrigin(curOrigin);
      setBaseUrl(`${curOrigin}/menu`);
    }

    if (profile.role === 'superadmin') {
      setLoadingBranches(true);
      getSupabase()
        .from('branches')
        .select('id, name')
        .order('name')
        .then(({ data }: any) => {
          if (data) {
            setBranches(data as Branch[]);
            if (data.length > 0) {
              setSelectedBranchId(data[0].id);
              setSelectedBranchName(data[0].name);
            }
          }
          setLoadingBranches(false);
        });
    } else {
      setSelectedBranchId(profile.branch_id ?? '');
      setSelectedBranchName(profile.branch_name ?? '');
    }
  }, [profile]);

  // ── Load tables & live status ──────────────────────────────────────────────
  const loadTableStatus = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoadingStatus(true);

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const [tablesRes, sessionsRes, reservationsRes] = await Promise.all([
      supabase
        .from('tables')
        .select('id, branch_id, code, label, seats, is_active')
        .eq('branch_id', selectedBranchId)
        .order('code'),
      supabase
        .from('table_sessions')
        .select('id, table_id, branch_id, status, expires_at, started_at, released_reason, upgraded_at')
        .eq('branch_id', selectedBranchId)
        .eq('status', 'active'),
      supabase
        .from('reservations')
        .select('id, table_id, starts_at, ends_at, party_size, customer_name, status')
        .eq('branch_id', selectedBranchId)
        .in('status', ['confirmed', 'seated'])
        .gte('ends_at', nowIso)
        .order('starts_at', { ascending: true }),
    ]);

    const tables       = (tablesRes.data ?? [])       as TableRow[];
    const sessions     = (sessionsRes.data ?? [])     as TableSessionRow[];
    const reservations = (reservationsRes.data ?? []) as (UpcomingRes & { table_id: string })[];

    const sessionByTable: Record<string, TableSessionRow> = {};
    for (const s of sessions) {
      sessionByTable[s.table_id] = s;
    }

    const reservationsByTable: Record<string, UpcomingRes[]> = {};
    for (const r of reservations) {
      if (!reservationsByTable[r.table_id]) reservationsByTable[r.table_id] = [];
      reservationsByTable[r.table_id].push(r);
    }

    const cards: TableCard[] = tables.map((t) => {
      const sess = sessionByTable[t.id] ?? null;
      const remainingSec = sess ? secondsUntil(sess.expires_at) : 0;
      const upcoming = reservationsByTable[t.id] ?? [];
      const seatedRes = upcoming.find((r) => r.status === 'seated');
      const nextRes = upcoming.find((r) => r.status === 'confirmed');

      let tableStatus: TableStatus = 'empty';
      let statusLabel = 'Kosong';
      let activeReservation: UpcomingRes | null = null;

      if (!t.is_active) {
        tableStatus = 'inactive';
        statusLabel = 'Nonaktif';
      } else if (seatedRes) {
        tableStatus = 'seated';
        statusLabel = 'Reservasi (Duduk)';
        activeReservation = seatedRes;
      } else if (sess && sess.upgraded_at && remainingSec > 0) {
        tableStatus = 'occupied';
        statusLabel = 'Terisi (Walk-in)';
      } else if (sess && remainingSec > 0) {
        tableStatus = 'held';
        statusLabel = 'Ditahan';
      } else if (nextRes) {
        tableStatus = 'reserved';
        statusLabel = `Reservasi (${formatHHMM(nextRes.starts_at)})`;
        activeReservation = nextRes;
      }

      return {
        ...t,
        tableStatus,
        statusLabel,
        session: sess,
        remainingSec,
        upcomingReservations: upcoming,
        activeReservation,
      };
    });

    setTableCards(cards);
    setLoadingStatus(false);
  }, [selectedBranchId]);

  useEffect(() => {
    loadTableStatus();
  }, [loadTableStatus]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedBranchId) return;
    const supabase = getSupabase();

    const channel1 = supabase
      .channel(`table-sessions-admin-${selectedBranchId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'table_sessions',
          filter: `branch_id=eq.${selectedBranchId}`,
        },
        () => { void loadTableStatus(); },
      )
      .subscribe();

    const channel2 = supabase
      .channel(`table-reservations-admin-${selectedBranchId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'reservations',
          filter: `branch_id=eq.${selectedBranchId}`,
        },
        () => { void loadTableStatus(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel1);
      void supabase.removeChannel(channel2);
    };
  }, [selectedBranchId, loadTableStatus]);

  // ── Release session (Kosongkan Meja) ─────────────────────────────────────────
  const handleRelease = useCallback(async (tableId: string) => {
    if (!confirm('Apakah Anda yakin ingin mengosongkan sesi aktif meja ini?')) return;
    setReleaseLoading(tableId);
    try {
      const res = await fetch('/api/admin/tables/release', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ table_id: tableId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Gagal mengosongkan meja.');
      } else {
        await loadTableStatus();
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setReleaseLoading(null);
    }
  }, [loadTableStatus]);

  // ── Toggle active ───────────────────────────────────────────────────────────
  const handleToggleActive = useCallback(async (tableId: string, currentActive: boolean) => {
    setToggleLoading(tableId);
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('tables')
        .update({ is_active: !currentActive })
        .eq('id', tableId);
      if (error) {
        alert('Gagal mengubah status aktif meja: ' + error.message);
      } else {
        await loadTableStatus();
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setToggleLoading(null);
    }
  }, [loadTableStatus]);

  // ── Delete Table ────────────────────────────────────────────────────────────
  const handleDeleteTable = useCallback(async (table: TableRow) => {
    if (!confirm(`Hapus permanen Meja ${table.code}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setDeleteLoading(table.id);
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', table.id);

      if (error) {
        if (error.code === '23503') {
          alert(`Meja ${table.code} tidak dapat dihapus karena sudah memiliki riwayat reservasi atau pesanan. Silakan gunakan opsi "Nonaktifkan Meja".`);
        } else {
          alert('Gagal menghapus meja: ' + error.message);
        }
      } else {
        await loadTableStatus();
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setDeleteLoading(null);
    }
  }, [loadTableStatus]);

  // ── Save Table (Single / Edit / Batch) ───────────────────────────────────────
  const handleSaveModal = useCallback(async () => {
    if (!selectedBranchId) return;
    setModalLoading(true);
    setModalMsg(null);
    const supabase = getSupabase();

    try {
      if (modalMode === 'edit') {
        const { error } = await supabase
          .from('tables')
          .update({
            code:  modalData.code.trim().toUpperCase(),
            label: modalData.label.trim() || null,
            seats: modalData.seats,
          })
          .eq('id', modalData.id!);

        if (error) throw error;
        setModalMsg({ type: 'success', text: 'Meja berhasil diperbarui!' });
      } else if (modalMode === 'create') {
        const cleanCode = modalData.code.trim().toUpperCase();
        if (!cleanCode) {
          setModalMsg({ type: 'error', text: 'Nomor/Kode meja wajib diisi.' });
          setModalLoading(false);
          return;
        }

        const { error } = await supabase
          .from('tables')
          .upsert(
            {
              branch_id: selectedBranchId,
              code:      cleanCode,
              label:     modalData.label.trim() || null,
              seats:     modalData.seats,
              is_active: true,
            },
            { onConflict: 'branch_id,code' },
          );

        if (error) throw error;
        setModalMsg({ type: 'success', text: `Meja ${cleanCode} berhasil disimpan!` });
      } else if (modalMode === 'batch') {
        const prefix = (modalData.prefix || 'A').trim().toUpperCase();
        const startFrom = Math.max(1, modalData.from || 1);
        const count = Math.min(50, Math.max(1, modalData.count || 10));

        const batchRows = Array.from({ length: count }, (_, i) => ({
          branch_id: selectedBranchId,
          code:      `${prefix}-${startFrom + i}`,
          label:     modalData.label.trim() || null,
          seats:     modalData.seats || 4,
          is_active: true,
        }));

        const { error } = await supabase
          .from('tables')
          .upsert(batchRows, { onConflict: 'branch_id,code' });

        if (error) throw error;
        setModalMsg({
          type: 'success',
          text: `Berhasil menambahkan ${count} meja (${prefix}-${startFrom} s/d ${prefix}-${startFrom + count - 1}) ke database!`,
        });
      }

      await loadTableStatus();
      setTimeout(() => {
        setModalMode(null);
        setModalMsg(null);
      }, 900);
    } catch (err: any) {
      setModalMsg({ type: 'error', text: err?.message || 'Gagal menyimpan meja.' });
    } finally {
      setModalLoading(false);
    }
  }, [modalMode, modalData, selectedBranchId, loadTableStatus]);

  // ── QR URL helper ───────────────────────────────────────────────────────────
  const qrUrlFor = useCallback((tableCode: string) => {
    const fallbackOrigin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
    const raw = (baseUrl || (origin ? `${origin}/menu` : `${fallbackOrigin}/menu`)).trim();
    try {
      const base = raw.startsWith('http') ? undefined : fallbackOrigin;
      const url = new URL(raw, base);
      url.searchParams.set('table', tableCode);
      if (selectedBranchId) url.searchParams.set('branch', selectedBranchId);
      return url.toString();
    } catch {
      const sep = raw.includes('?') ? '&' : '?';
      return selectedBranchId
        ? `${raw}${sep}table=${encodeURIComponent(tableCode)}&branch=${encodeURIComponent(selectedBranchId)}`
        : `${raw}${sep}table=${encodeURIComponent(tableCode)}`;
    }
  }, [baseUrl, origin, selectedBranchId]);

  const handleCopy = (table: string) => {
    const link = qrUrlFor(table);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedTable(table);
      setTimeout(() => setCopiedTable(null), 2000);
    }
  };

  const handleDownloadSvg = (table: string) => {
    const svg = document.getElementById(`qr-code-${table}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `QR-Meja-${table}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered tables
  const filteredCards = useMemo(() => {
    return tableCards.filter((t) => {
      if (statusFilter === 'empty' && t.tableStatus !== 'empty') return false;
      if (statusFilter === 'occupied_or_held' && t.tableStatus !== 'occupied' && t.tableStatus !== 'held') return false;
      if (statusFilter === 'reserved' && t.tableStatus !== 'reserved' && t.tableStatus !== 'seated') return false;
      if (statusFilter === 'inactive' && t.tableStatus !== 'inactive') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode  = t.code.toLowerCase().includes(q);
        const matchLabel = (t.label || '').toLowerCase().includes(q);
        const matchCust  = (t.activeReservation?.customer_name || '').toLowerCase().includes(q);
        if (!matchCode && !matchLabel && !matchCust) return false;
      }
      return true;
    });
  }, [tableCards, statusFilter, searchQuery]);

  // Summary counts
  const counts = useMemo(() => {
    let empty = 0;
    let occupiedHeld = 0;
    let reserved = 0;
    let inactive = 0;
    for (const t of tableCards) {
      if (t.tableStatus === 'inactive') inactive++;
      else if (t.tableStatus === 'empty') empty++;
      else if (t.tableStatus === 'occupied' || t.tableStatus === 'held') occupiedHeld++;
      else if (t.tableStatus === 'reserved' || t.tableStatus === 'seated') reserved++;
    }
    return { total: tableCards.length, empty, occupiedHeld, reserved, inactive };
  }, [tableCards]);

  return (
    <div className="min-h-screen bg-cream">
      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-40 bg-cream/90 backdrop-blur-xl border-b border-coffee-100/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors font-semibold text-sm"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>

            <div className="text-center">
              <h1 className="font-extrabold text-coffee-950 text-base sm:text-lg flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-coffee-700" />
                Manajemen Meja &amp; QR Code
              </h1>
              <p className="text-[11px] text-charcoal/50">
                Status operasional meja, reservasi aktif, dan QR resmi tiap meja
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalData({ code: '', label: '', seats: 4, prefix: 'A', from: 1, count: 10 });
                  setModalMode('create');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-all active:scale-95 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Tambah Meja</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-coffee-800 text-cream font-bold text-xs hover:bg-coffee-900 transition-all active:scale-95 shadow-sm"
                title="Cetak semua QR meja cabang ini"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Cetak Semua</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Interactive Content ─────────────────────────────────────────── */}
      <div className="print:hidden max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-6">

        {/* Top Controls & Branch Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl border border-coffee-100 p-4 shadow-soft">
          {/* Superadmin branch dropdown */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-coffee-50 border border-coffee-200/60 flex items-center justify-center text-coffee-700 flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-charcoal/50 font-bold uppercase tracking-wider">Cabang Aktif</p>
              {profile.role === 'superadmin' ? (
                loadingBranches ? (
                  <div className="flex items-center gap-1.5 text-xs text-charcoal/50 mt-0.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat cabang...
                  </div>
                ) : (
                  <select
                    className="font-bold text-coffee-900 bg-transparent text-sm focus:outline-none cursor-pointer"
                    value={selectedBranchId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedBranchId(id);
                      setSelectedBranchName(branches.find((b) => b.id === id)?.name ?? '');
                    }}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )
              ) : (
                <p className="font-extrabold text-coffee-900 text-sm">{selectedBranchName || 'Cabang Saya'}</p>
              )}
            </div>
          </div>

          {/* Quick Actions & URL config toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUrlConfig((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-coffee-200 bg-coffee-50/70 hover:bg-coffee-100/70 text-coffee-800 text-xs font-semibold transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5 text-coffee-600" />
              <span>Pengaturan Link QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModalData({ code: '', label: '', seats: 4, prefix: 'A', from: 1, count: 10 });
                setModalMode('batch');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Generate Banyak Meja</span>
            </button>

            <button
              type="button"
              onClick={loadTableStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-coffee-200 bg-white hover:bg-coffee-50 text-coffee-700 text-xs font-semibold transition-colors"
            >
              <Loader2 className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Collapsible QR URL Config */}
        {showUrlConfig && (
          <div className="bg-white rounded-2xl border border-coffee-200/80 p-4 shadow-soft space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-coffee-900 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-coffee-600" /> Pengaturan URL Dasar QR Code
              </h3>
              <button onClick={() => setShowUrlConfig(false)}>
                <X className="w-4 h-4 text-charcoal/40 hover:text-charcoal" />
              </button>
            </div>
            <p className="text-[11px] text-charcoal/50">
              URL dasar yang dibuka pelanggan saat scan QR di meja (format otomatis: <code>{baseUrl || '...'}?table=NOMOR_MEJA&amp;branch=ID_CABANG</code>)
            </p>
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={`${origin}/menu`}
                className="flex-1 px-3 py-2 rounded-xl border border-coffee-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-coffee-400"
              />
              <button
                type="button"
                onClick={() => setBaseUrl(`${origin}/menu`)}
                className="px-3 py-2 rounded-xl bg-coffee-100 hover:bg-coffee-200 text-coffee-800 text-xs font-bold transition-colors"
              >
                Reset Default
              </button>
            </div>
          </div>
        )}

        {/* ── Summary & Filter Pills ────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                statusFilter === 'all'
                  ? 'bg-coffee-900 border-coffee-900 text-white shadow-soft scale-[1.02]'
                  : 'bg-white border-coffee-100 hover:border-coffee-300 text-charcoal'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${statusFilter === 'all' ? 'text-cream/70' : 'text-charcoal/50'}`}>Semua Meja</p>
              <p className="text-xl font-extrabold mt-0.5">{counts.total}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('empty')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                statusFilter === 'empty'
                  ? 'bg-emerald-700 border-emerald-700 text-white shadow-soft scale-[1.02]'
                  : 'bg-white border-emerald-100 hover:border-emerald-300 text-emerald-950'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${statusFilter === 'empty' ? 'text-white/80' : 'text-emerald-700'}`}>Tersedia / Kosong</p>
              <p className="text-xl font-extrabold mt-0.5">{counts.empty}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('occupied_or_held')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                statusFilter === 'occupied_or_held'
                  ? 'bg-red-700 border-red-700 text-white shadow-soft scale-[1.02]'
                  : 'bg-white border-red-100 hover:border-red-300 text-red-950'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${statusFilter === 'occupied_or_held' ? 'text-white/80' : 'text-red-700'}`}>Terisi / Ditahan</p>
              <p className="text-xl font-extrabold mt-0.5">{counts.occupiedHeld}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('reserved')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                statusFilter === 'reserved'
                  ? 'bg-purple-700 border-purple-700 text-white shadow-soft scale-[1.02]'
                  : 'bg-white border-purple-100 hover:border-purple-300 text-purple-950'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${statusFilter === 'reserved' ? 'text-white/80' : 'text-purple-700'}`}>Ada Reservasi</p>
              <p className="text-xl font-extrabold mt-0.5">{counts.reserved}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`p-3 rounded-2xl border text-left col-span-2 sm:col-span-1 transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-charcoal border-charcoal text-white shadow-soft scale-[1.02]'
                  : 'bg-white border-charcoal/10 hover:border-charcoal/30 text-charcoal'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${statusFilter === 'inactive' ? 'text-white/80' : 'text-charcoal/50'}`}>Nonaktif</p>
              <p className="text-xl font-extrabold mt-0.5">{counts.inactive}</p>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-charcoal/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nomor meja (contoh: A-1), label, atau nama pemesan..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-coffee-100 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400 placeholder:text-charcoal/40 shadow-soft"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal text-xs"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Unified Tables Grid (Actual DB Tables with QR Codes) ──────────── */}
        {loadingStatus && tableCards.length === 0 ? (
          <div className="text-sm text-charcoal/50 text-center py-16 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-coffee-600" />
            <span>Memuat meja &amp; QR code...</span>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="bg-white border border-coffee-100 rounded-3xl p-10 text-center shadow-soft max-w-md mx-auto">
            <Coffee className="w-10 h-10 text-coffee-300 mx-auto mb-3" />
            <h3 className="font-extrabold text-coffee-900 text-base">Tidak ada meja yang sesuai</h3>
            <p className="text-xs text-charcoal/50 mt-1">
              {tableCards.length === 0
                ? 'Belum ada meja yang terdaftar untuk cabang ini.'
                : 'Coba ubah kata kunci pencarian atau filter status di atas.'}
            </p>
            {tableCards.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setModalData({ code: '', label: '', seats: 4, prefix: 'A', from: 1, count: 10 });
                  setModalMode('batch');
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coffee-800 text-cream text-xs font-bold hover:bg-coffee-900 transition-colors shadow-soft"
              >
                <Plus className="w-4 h-4" />
                Generate Meja Sekarang
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredCards.map((t) => {
              const fullUrl        = qrUrlFor(t.code);
              const isCopied       = copiedTable === t.code;
              const remainSec      = t.session ? secondsUntil(t.session.expires_at) : 0;
              const hasActiveClaim = (t.tableStatus === 'occupied' || t.tableStatus === 'held' || t.tableStatus === 'seated') && remainSec > 0;
              const isInactive     = t.tableStatus === 'inactive';
              const isOccupied     = t.tableStatus === 'occupied';
              const isHeld         = t.tableStatus === 'held';
              const isSeated       = t.tableStatus === 'seated';
              const isReserved     = t.tableStatus === 'reserved';

              return (
                <div
                  key={t.id}
                  className={`relative rounded-3xl border bg-white shadow-soft transition-all flex flex-col justify-between overflow-hidden hover:shadow-md ${
                    isInactive
                      ? 'border-charcoal/20 opacity-70 bg-stone-50/70'
                      : isSeated
                      ? 'border-purple-300 ring-1 ring-purple-200'
                      : isOccupied
                      ? 'border-red-200 ring-1 ring-red-100'
                      : isHeld
                      ? 'border-amber-200 ring-1 ring-amber-100'
                      : isReserved
                      ? 'border-blue-200'
                      : 'border-emerald-200/90'
                  }`}
                >
                  {/* Card Header & Status */}
                  <div className="p-4 border-b border-coffee-100/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xl font-black text-coffee-950 tracking-tight">
                        Meja {t.code}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          isInactive
                            ? 'bg-charcoal/10 text-charcoal/70'
                            : isSeated
                            ? 'bg-purple-100 text-purple-900 border border-purple-300'
                            : isOccupied
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : isHeld
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : isReserved
                            ? 'bg-blue-100 text-blue-900 border border-blue-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isInactive
                              ? 'bg-charcoal/40'
                              : isSeated || isOccupied || isHeld
                              ? 'bg-current animate-pulse'
                              : 'bg-current'
                          }`}
                        />
                        {t.statusLabel}
                      </span>
                    </div>

                    {/* Table label & seats */}
                    <div className="flex items-center justify-between text-xs text-charcoal/60">
                      <span className="truncate max-w-[170px]" title={t.label || 'Tanpa label'}>
                        {t.label || 'Tanpa label khusus'}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-charcoal/50 flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-coffee-600" />
                        {t.seats} Kursi
                      </span>
                    </div>

                    {/* Active session timer if any */}
                    {hasActiveClaim && t.session && (
                      <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-[11px] text-amber-900 font-semibold">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                          {isHeld ? 'Batas pesan:' : 'Sisa waktu meja:'}
                        </span>
                        <span className="font-extrabold font-mono">
                          {formatCountdown(Math.max(0, remainSec))}
                        </span>
                      </div>
                    )}

                    {/* Active or upcoming reservation badge */}
                    {t.activeReservation && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl px-2.5 py-1.5 text-[11px] text-purple-900 space-y-0.5">
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-purple-700" />
                            {isSeated ? 'Tamu Sedang Duduk' : 'Reservasi Mendatang'}
                          </span>
                          <span>{formatHHMM(t.activeReservation.starts_at)} WIB</span>
                        </div>
                        <p className="text-[10px] text-purple-800 truncate">
                          Atas nama: <strong>{t.activeReservation.customer_name}</strong> ({t.activeReservation.party_size} orang)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* QR Code Section */}
                  <div className="p-4 flex flex-col items-center text-center bg-stone-50/40">
                    <div className="w-36 h-36 flex items-center justify-center bg-white rounded-2xl border border-coffee-100 p-2.5 shadow-sm group">
                      <QRCodeSVG
                        id={`qr-code-${t.code}`}
                        value={fullUrl}
                        size={128}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <p className="text-[10px] text-charcoal/40 font-mono mt-2 break-all px-1 max-w-[240px]">
                      {fullUrl.replace(/^https?:\/\//, '')}
                    </p>

                    {/* QR Action Buttons */}
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 w-full">
                      <button
                        type="button"
                        onClick={() => handleCopy(t.code)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-coffee-50 hover:bg-coffee-100 text-coffee-800 text-[11px] font-semibold transition-colors"
                        title="Salin tautan QR"
                      >
                        {isCopied ? (
                          <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Tersalin!</span></>
                        ) : (
                          <><Copy className="w-3.5 h-3.5 text-coffee-600" /><span>Salin</span></>
                        )}
                      </button>

                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-coffee-50 hover:bg-coffee-100 text-coffee-800 text-[11px] font-semibold transition-colors"
                        title="Buka link meja untuk melihat tampilan menu pelanggan"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-coffee-600" />
                        <span>Buka</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleDownloadSvg(t.code)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-coffee-800 text-cream text-[11px] font-semibold hover:bg-coffee-900 transition-colors"
                        title="Unduh file QR SVG"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>SVG</span>
                      </button>
                    </div>
                  </div>

                  {/* Card Operational Controls */}
                  <div className="p-3 bg-white border-t border-coffee-100/70 flex flex-col gap-1.5">
                    {/* Release button if occupied or held */}
                    {hasActiveClaim && (
                      <button
                        type="button"
                        disabled={releaseLoading === t.id}
                        onClick={() => handleRelease(t.id)}
                        className="w-full py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        {releaseLoading === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                        Kosongkan Meja Sekarang
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      {/* Edit table */}
                      <button
                        type="button"
                        onClick={() => {
                          setModalData({
                            id:    t.id,
                            code:  t.code,
                            label: t.label || '',
                            seats: t.seats,
                          });
                          setModalMode('edit');
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-coffee-700 hover:text-coffee-950 p-1 rounded transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>

                      {/* Toggle active */}
                      <button
                        type="button"
                        disabled={toggleLoading === t.id}
                        onClick={() => handleToggleActive(t.id, t.is_active)}
                        className={`text-[11px] font-bold p-1 rounded transition-colors ${
                          t.is_active
                            ? 'text-charcoal/50 hover:text-red-700'
                            : 'text-emerald-700 hover:text-emerald-800'
                        }`}
                      >
                        {toggleLoading === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                        ) : t.is_active ? (
                          'Nonaktifkan'
                        ) : (
                          'Aktifkan'
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        disabled={deleteLoading === t.id}
                        onClick={() => handleDeleteTable(t)}
                        className="text-red-600 hover:text-red-800 p-1 rounded transition-colors disabled:opacity-40"
                        title="Hapus meja dari sistem"
                      >
                        {deleteLoading === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Print Layout (Cetak Semua QR Meja Resmi) ────────────────────────── */}
      <div className="hidden print:block max-w-4xl mx-auto p-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-coffee-950 uppercase tracking-wide">
            {brandName || 'KOPI NAKO'}
          </h2>
          <p className="text-xs text-charcoal/60 mt-0.5 font-semibold">
            QR Code Meja Resmi &bull; Cabang {selectedBranchName || 'Utama'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {tableCards
            .filter((t) => t.is_active)
            .map((t) => {
              const fullUrl = qrUrlFor(t.code);
              return (
                <div
                  key={t.id}
                  className="border-2 border-dashed border-coffee-800 rounded-3xl p-6 flex flex-col items-center text-center bg-white break-inside-avoid"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-charcoal/60">
                    {brandName || 'Kopi Nako'}
                  </p>
                  <p className="text-3xl font-black text-coffee-950 mt-1 mb-1">
                    Meja {t.code}
                  </p>
                  {t.label && (
                    <p className="text-xs text-charcoal/60 font-semibold mb-3">
                      {t.label}
                    </p>
                  )}

                  <div className="w-48 h-48 flex items-center justify-center p-3 bg-white border border-coffee-200 rounded-2xl mb-3">
                    <QRCodeSVG
                      value={fullUrl}
                      size={180}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <p className="text-xs font-extrabold text-coffee-950 mt-1">
                    Scan untuk Melihat Menu &amp; Pesan
                  </p>
                  <p className="text-[10px] text-charcoal/50 mt-0.5">
                    Dapat di-scan dengan Google Lens atau Kamera HP
                  </p>
                  <p className="text-[9px] text-charcoal/40 font-mono mt-2 break-all">
                    {fullUrl}
                  </p>
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Modal (Create Single / Edit / Batch Generate) ────────────────────── */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-coffee-100 pb-3">
              <h3 className="font-extrabold text-coffee-950 text-base flex items-center gap-2">
                {modalMode === 'edit' ? (
                  <><Pencil className="w-4 h-4 text-coffee-700" /> Edit Meja {modalData.code}</>
                ) : modalMode === 'batch' ? (
                  <><Sparkles className="w-4 h-4 text-emerald-600" /> Generate Banyak Meja Sekaligus</>
                ) : (
                  <><Plus className="w-4 h-4 text-emerald-600" /> Tambah Meja Baru</>
                )}
              </h3>
              <button
                type="button"
                onClick={() => { setModalMode(null); setModalMsg(null); }}
                className="p-1 rounded-lg text-charcoal/40 hover:text-charcoal transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode selector if not editing */}
            {modalMode !== 'edit' && (
              <div className="flex rounded-xl bg-coffee-50 p-1 border border-coffee-100 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => { setModalMode('create'); setModalMsg(null); }}
                  className={`flex-1 py-1.5 rounded-lg transition-colors ${
                    modalMode === 'create' ? 'bg-white text-coffee-900 shadow-sm' : 'text-charcoal/60'
                  }`}
                >
                  Tambah 1 Meja
                </button>
                <button
                  type="button"
                  onClick={() => { setModalMode('batch'); setModalMsg(null); }}
                  className={`flex-1 py-1.5 rounded-lg transition-colors ${
                    modalMode === 'batch' ? 'bg-white text-coffee-900 shadow-sm' : 'text-charcoal/60'
                  }`}
                >
                  Generate Sekaligus (Batch)
                </button>
              </div>
            )}

            <div className="space-y-3.5">
              {modalMode === 'batch' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-charcoal/70 block mb-1">Prefix</label>
                      <input
                        type="text"
                        maxLength={4}
                        className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-coffee-400"
                        value={modalData.prefix || 'A'}
                        onChange={(e) => setModalData((d) => ({ ...d, prefix: e.target.value.toUpperCase() }))}
                        placeholder="A"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-charcoal/70 block mb-1">Mulai Dari</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400"
                        value={modalData.from || 1}
                        onChange={(e) => setModalData((d) => ({ ...d, from: Math.max(1, +e.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-charcoal/70 block mb-1">Jumlah</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400"
                        value={modalData.count || 10}
                        onChange={(e) => setModalData((d) => ({ ...d, count: Math.min(50, Math.max(1, +e.target.value)) }))}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-charcoal/50 bg-coffee-50 p-2.5 rounded-xl border border-coffee-100">
                    Akan membuat meja: <strong>{modalData.prefix || 'A'}-{modalData.from || 1}</strong> s/d{' '}
                    <strong>
                      {modalData.prefix || 'A'}-{(modalData.from || 1) + (modalData.count || 10) - 1}
                    </strong>{' '}
                    langsung ke database cabang {selectedBranchName}.
                  </p>
                </>
              ) : (
                <div>
                  <label className="text-xs font-bold text-charcoal/70 block mb-1">
                    Nomor / Kode Meja <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={modalMode === 'edit'}
                    className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-coffee-400 disabled:bg-coffee-50 disabled:text-charcoal/60"
                    placeholder="Contoh: A-1, B-12, VIP-1"
                    value={modalData.code}
                    onChange={(e) => setModalData((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-charcoal/70 block mb-1">Label Lokasi (Opsional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400"
                  placeholder="Contoh: Indoor Dekat Jendela, Lantai 2"
                  value={modalData.label}
                  onChange={(e) => setModalData((d) => ({ ...d, label: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-charcoal/70 block mb-1">Kapasitas Kursi (Orang)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400"
                  value={modalData.seats}
                  onChange={(e) => setModalData((d) => ({ ...d, seats: Math.min(50, Math.max(1, +e.target.value)) }))}
                />
              </div>
            </div>

            {modalMsg && (
              <div
                className={`flex items-center gap-2 text-xs rounded-xl px-3.5 py-2.5 font-medium ${
                  modalMsg.type === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {modalMsg.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{modalMsg.text}</span>
              </div>
            )}

            <button
              type="button"
              disabled={modalLoading}
              onClick={handleSaveModal}
              className="w-full py-3 rounded-2xl bg-coffee-800 text-cream font-bold text-sm hover:bg-coffee-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-soft"
            >
              {modalLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {modalMode === 'edit'
                ? 'Simpan Perubahan'
                : modalMode === 'batch'
                ? 'Generate & Simpan Semua Meja'
                : 'Simpan Meja Baru'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
