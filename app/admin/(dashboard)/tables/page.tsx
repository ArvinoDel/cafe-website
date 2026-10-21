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
  Camera,
  Sparkles,
  Plus,
  Pencil,
  Unlock,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
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
  id:             string;
  table_id:       string;
  branch_id:      string;
  status:         string;
  expires_at:     string;
  started_at:     string;
  released_reason: string | null;
};

type TableStatus = 'empty' | 'occupied' | 'reserved';

type TableCard = TableRow & {
  tableStatus: TableStatus;
  session:     TableSessionRow | null;
  remainingSec: number;
};

const DEFAULT_TARGET_URL = 'https://demoforcafe.vercel.app/menus';

function buildTableNumbers(prefix: string, count: number): string[] {
  const clean = prefix.trim().toUpperCase() || 'A';
  const safeCount = Math.min(Math.max(count, 1), 60);
  return Array.from({ length: safeCount }, (_, i) => `${clean}-${i + 1}`);
}

function getSupabase() {
  return getSupabaseBrowserClient();
}

export default function TableQrPage() {
  const router   = useRouter();
  const profile  = useAdminProfile();
  const { brandName } = useBrand();

  const [origin, setOrigin]     = useState('');
  const [baseUrl, setBaseUrl]   = useState(DEFAULT_TARGET_URL);
  const [prefix, setPrefix]     = useState('A');
  const [count, setCount]       = useState(12);
  const [copiedTable, setCopiedTable] = useState<string | null>(null);

  // Branch selection (superadmin only)
  const [branches, setBranches]               = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId]   = useState<string>('');
  const [selectedBranchName, setSelectedBranchName] = useState<string>('');
  const [loadingBranches, setLoadingBranches]   = useState(false);

  // Status Meja live grid
  const [tableCards, setTableCards]     = useState<TableCard[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState<string | null>(null);

  // Save-to-list modal
  const [saveModal, setSaveModal] = useState<{ code: string; label: string; seats: number } | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMsg, setSaveMsg]     = useState<string | null>(null);

  // Tick every second for countdown display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
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

  // ── Load status grid ──────────────────────────────────────────────────────────

  const loadTableStatus = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoadingStatus(true);

    const supabase = getSupabase();

    const [tablesRes, sessionsRes] = await Promise.all([
      supabase
        .from('tables')
        .select('id, branch_id, code, label, seats, is_active')
        .eq('branch_id', selectedBranchId)
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('table_sessions')
        .select('id, table_id, branch_id, status, expires_at, started_at, released_reason')
        .eq('branch_id', selectedBranchId)
        .eq('status', 'active'),
    ]);

    const tables   = (tablesRes.data ?? [])   as TableRow[];
    const sessions = (sessionsRes.data ?? []) as TableSessionRow[];

    const sessionByTable: Record<string, TableSessionRow> = {};
    for (const s of sessions) {
      sessionByTable[s.table_id] = s;
    }

    const cards: TableCard[] = tables.map((t) => {
      const sess = sessionByTable[t.id] ?? null;
      const remainingSec = sess ? secondsUntil(sess.expires_at) : 0;
      let tableStatus: TableStatus = 'empty';
      if (sess && remainingSec > 0) tableStatus = 'occupied';
      return { ...t, tableStatus, session: sess, remainingSec };
    });

    setTableCards(cards);
    setLoadingStatus(false);
  }, [selectedBranchId]);

  useEffect(() => {
    loadTableStatus();
  }, [loadTableStatus]);

  // Realtime subscription for table_sessions
  useEffect(() => {
    if (!selectedBranchId) return;
    const supabase = getSupabase();

    const channel = supabase
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

    return () => { void supabase.removeChannel(channel); };
  }, [selectedBranchId, loadTableStatus]);

  // ── Release session ───────────────────────────────────────────────────────────

  const handleRelease = useCallback(async (tableId: string) => {
    setReleaseLoading(tableId);
    try {
      await fetch('/api/admin/tables/release', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ table_id: tableId }),
      });
      await loadTableStatus();
    } catch {
      // silent
    } finally {
      setReleaseLoading(null);
    }
  }, [loadTableStatus]);

  // ── Save table to DB ──────────────────────────────────────────────────────────

  const handleSaveTable = useCallback(async () => {
    if (!saveModal || !selectedBranchId) return;
    setSaveLoading(true);
    setSaveMsg(null);
    const supabase = getSupabase();
    const { error } = await supabase
      .from('tables')
      .upsert(
        {
          branch_id: selectedBranchId,
          code:      saveModal.code.trim().toUpperCase(),
          label:     saveModal.label.trim() || null,
          seats:     saveModal.seats,
          is_active: true,
        },
        { onConflict: 'branch_id,code' },
      );
    if (error) {
      setSaveMsg('Gagal menyimpan: ' + error.message);
    } else {
      setSaveMsg('Berhasil disimpan!');
      await loadTableStatus();
    }
    setSaveLoading(false);
  }, [saveModal, selectedBranchId, loadTableStatus]);

  // ── QR helpers ────────────────────────────────────────────────────────────────

  const tableNumbers = useMemo(() => buildTableNumbers(prefix, count), [prefix, count]);

  const qrUrlFor = (table: string) => {
    const raw = (baseUrl || DEFAULT_TARGET_URL).trim();
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      url.searchParams.set('table', table);
      if (selectedBranchId) url.searchParams.set('branch', selectedBranchId);
      return url.toString();
    } catch {
      const sep = raw.includes('?') ? '&' : '?';
      return selectedBranchId
        ? `${raw}${sep}table=${table}&branch=${selectedBranchId}`
        : `${raw}${sep}table=${table}`;
    }
  };

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

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Dashboard</span>
            </button>
            <div className="text-center">
              <h1 className="font-bold text-coffee-900">QR Code Meja</h1>
              <p className="text-[11px] text-charcoal/50">
                Google Lens &amp; Kamera HP &amp; Website Scanner Ready
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coffee-700 text-cream font-bold text-xs hover:bg-coffee-800 transition-colors active:scale-95 shadow-soft"
            >
              <Printer className="w-4 h-4" />
              Cetak Semua
            </button>
          </div>
        </div>
      </div>

      <div className="print:hidden max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* ── Status Meja Grid ─────────────────────────────────────────────── */}
        {selectedBranchId && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-coffee-900 text-base">Status Meja</h2>
              <button
                onClick={loadTableStatus}
                className="text-xs text-coffee-600 hover:text-coffee-800 transition-colors flex items-center gap-1"
              >
                <Loader2 className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {loadingStatus && tableCards.length === 0 ? (
              <div className="text-sm text-charcoal/50 text-center py-8">Memuat status meja…</div>
            ) : tableCards.length === 0 ? (
              <div className="bg-coffee-50 border border-coffee-100 rounded-2xl p-6 text-center">
                <Coffee className="w-8 h-8 text-coffee-300 mx-auto mb-2" />
                <p className="text-sm text-charcoal/50">Belum ada meja yang tersimpan di daftar.</p>
                <p className="text-xs text-charcoal/40 mt-1">Gunakan "Simpan ke daftar meja" di bawah untuk mendaftarkan meja.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {tableCards.map((t) => {
                  const remainSec = t.session ? secondsUntil(t.session.expires_at) : 0;
                  const occupied  = t.tableStatus === 'occupied' && remainSec > 0;
                  return (
                    <div
                      key={t.id}
                      className={`relative rounded-2xl border p-3.5 flex flex-col gap-2 transition-all ${
                        occupied
                          ? 'bg-red-50 border-red-200'
                          : 'bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      {/* Status badge */}
                      <div className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${occupied ? 'text-red-600' : 'text-emerald-700'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${occupied ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                        {occupied ? 'Terisi' : 'Kosong'}
                      </div>

                      {/* Table code */}
                      <p className="text-lg font-extrabold text-coffee-900 leading-none">Meja {t.code}</p>
                      {t.label && <p className="text-[11px] text-charcoal/50 -mt-1 truncate">{t.label}</p>}

                      {/* Occupied info */}
                      {occupied && t.session && (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
                            <Clock className="w-3 h-3" />
                            {formatCountdown(Math.max(0, secondsUntil(t.session.expires_at)))}
                          </div>
                          <p className="text-[11px] text-charcoal/50">
                            Berakhir {formatHHMM(t.session.expires_at)} WIB
                          </p>
                        </div>
                      )}

                      {/* Seats info */}
                      <div className="flex items-center gap-1 text-[11px] text-charcoal/40">
                        <Users className="w-3 h-3" />
                        {t.seats} kursi
                      </div>

                      {/* Release button */}
                      {occupied && (
                        <button
                          type="button"
                          disabled={releaseLoading === t.id}
                          onClick={() => handleRelease(t.id)}
                          className="mt-1 flex items-center justify-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg py-1.5 transition-colors disabled:opacity-50 active:scale-95"
                        >
                          {releaseLoading === t.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                          Kosongkan Meja
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Info Banner */}
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-soft">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-soft">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-emerald-900 text-sm">QR Code siap pakai!</p>
            <p className="text-xs text-emerald-700/80 mt-0.5">
              Pelanggan bisa scan dengan Google Lens, kamera HP, atau scanner website. QR link langsung ke halaman menu dengan nomor meja otomatis terdeteksi.
            </p>
          </div>
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Branch selector (superadmin) */}
          {profile.role === 'superadmin' && (
            <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 shadow-soft space-y-3">
              <h3 className="font-bold text-coffee-900 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-coffee-600" /> Cabang
              </h3>
              {loadingBranches ? (
                <div className="flex items-center gap-2 text-sm text-charcoal/50">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat cabang…
                </div>
              ) : (
                <select
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200/80 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
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
              )}
            </div>
          )}

          {/* QR Config */}
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 shadow-soft space-y-3">
            <h3 className="font-bold text-coffee-900 text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-coffee-600" /> Pengaturan QR
            </h3>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-charcoal/60">URL Dasar</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={DEFAULT_TARGET_URL}
                className="w-full px-3 py-2 rounded-xl border border-coffee-200/80 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-charcoal/60">Prefix</label>
                <input
                  type="text"
                  maxLength={3}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200/80 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40 font-mono"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-charcoal/60">Jumlah</label>
                <input
                  type="number"
                  min={1} max={60}
                  value={count}
                  onChange={(e) => setCount(Math.min(60, Math.max(1, +e.target.value)))}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200/80 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Cards grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 pb-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 print:grid-cols-4">
          {tableNumbers.map((table) => {
            const fullUrl  = qrUrlFor(table);
            const isCopied = copiedTable === table;

            return (
              <div
                key={table}
                className="bg-white rounded-2xl border border-coffee-100/60 shadow-soft flex flex-col items-center p-4 text-center print:shadow-none print:border print:rounded-none print:break-inside-avoid"
              >
                {/* QR Code */}
                <div className="w-36 h-36 flex items-center justify-center bg-white rounded-xl border border-coffee-100/40 p-2">
                  <QRCodeSVG
                    id={`qr-code-${table}`}
                    value={fullUrl}
                    size={128}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <p className="mt-3 text-xl font-black text-coffee-950 tracking-tight">
                  Meja {table}
                </p>
                <p className="text-xs text-charcoal/60 mt-1 max-w-[220px] leading-snug">
                  Scan dengan <strong>Google Lens</strong>, <strong>Kamera HP</strong>, atau{' '}
                  <strong>Website</strong> untuk melihat menu &amp; pesan
                </p>
                <p className="text-[10px] text-charcoal/40 font-mono mt-1 break-all px-2">
                  {fullUrl.replace(/^https?:\/\//, '')}
                </p>

                {/* Action Buttons */}
                <div className="print:hidden mt-4 pt-3 border-t border-coffee-100/80 w-full flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(table)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-coffee-50 hover:bg-coffee-100 text-coffee-800 text-[11px] font-semibold transition-colors"
                    title="Salin tautan langsung"
                  >
                    {isCopied ? (
                      <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Tersalin!</span></>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /><span>Salin Link</span></>
                    )}
                  </button>

                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-coffee-50 hover:bg-coffee-100 text-coffee-800 text-[11px] font-semibold transition-colors"
                    title="Buka link di tab baru untuk menguji"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test Link</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleDownloadSvg(table)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-coffee-700 text-cream text-[11px] font-semibold hover:bg-coffee-800 transition-colors active:scale-95"
                    title="Unduh QR code SVG"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh SVG</span>
                  </button>

                  {/* Save to table list */}
                  {selectedBranchId && (
                    <button
                      type="button"
                      onClick={() => setSaveModal({ code: table, label: '', seats: 4 })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition-colors active:scale-95"
                      title="Simpan meja ini ke daftar Status Meja"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Simpan ke Daftar</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save to table list modal */}
      {saveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-coffee-900">Simpan Meja {saveModal.code}</h3>
              <button onClick={() => { setSaveModal(null); setSaveMsg(null); }}>
                <X className="w-5 h-5 text-charcoal/40 hover:text-charcoal" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-charcoal/60 block mb-1">Label Meja (opsional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200/80 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                  placeholder="contoh: Dekat Jendela, Area Luar"
                  value={saveModal.label}
                  onChange={(e) => setSaveModal((m) => m ? { ...m, label: e.target.value } : m)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-charcoal/60 block mb-1">Kapasitas Kursi</label>
                <input
                  type="number"
                  min={1} max={20}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200/80 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                  value={saveModal.seats}
                  onChange={(e) => setSaveModal((m) => m ? { ...m, seats: Math.min(20, Math.max(1, +e.target.value)) } : m)}
                />
              </div>
            </div>

            {saveMsg && (
              <div className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2 ${saveMsg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {saveMsg.startsWith('Gagal') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {saveMsg}
              </div>
            )}

            <button
              type="button"
              disabled={saveLoading}
              onClick={handleSaveTable}
              className="w-full py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saveLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan ke Daftar Meja
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
