'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';
import { useBrand } from '@/components/providers/BrandProvider';

type Branch = { id: string; name: string };

const DEFAULT_TARGET_URL = 'https://cafe-website-lac-kappa.vercel.app/menus';

function buildTableNumbers(prefix: string, count: number): string[] {
  const clean = prefix.trim().toUpperCase() || 'A';
  const safeCount = Math.min(Math.max(count, 1), 60);
  return Array.from({ length: safeCount }, (_, i) => `${clean}-${i + 1}`);
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );
}

export default function TableQrPage() {
  const router = useRouter();
  const profile = useAdminProfile();
  const { brandName } = useBrand();

  const [origin, setOrigin] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_TARGET_URL);
  const [prefix, setPrefix] = useState('A');
  const [count, setCount] = useState(12);
  const [copiedTable, setCopiedTable] = useState<string | null>(null);

  // Branch selection (superadmin only)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedBranchName, setSelectedBranchName] = useState<string>('');
  const [loadingBranches, setLoadingBranches] = useState(false);

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
      // admin — locked to their own branch
      setSelectedBranchId(profile.branch_id ?? '');
      setSelectedBranchName(profile.branch_name ?? '');
    }
  }, [profile]);

  const tableNumbers = useMemo(() => buildTableNumbers(prefix, count), [prefix, count]);

  const qrUrlFor = (table: string) => {
    const raw = (baseUrl || DEFAULT_TARGET_URL).trim();
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      url.searchParams.set('table', table);
      if (selectedBranchId) {
        url.searchParams.set('branch', selectedBranchId);
      }
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
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-Meja-${table}.svg`;
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

      {/* Controls & Configuration — hidden when printing */}
      <div className="print:hidden max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-4">
        {/* Info Banner */}
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-soft">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-soft">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-xs text-emerald-950 space-y-1">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <span>Mendukung Scan Google Lens &amp; Kamera Ponsel Langsung</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                Direct URL Active
              </span>
            </div>
            <p className="text-emerald-800/90 leading-relaxed">
              Setiap QR code berisi tautan HTTPS lengkap. Pelanggan dapat memindai langsung menggunakan{' '}
              <strong>Google Lens</strong>, <strong>kamera bawaan HP</strong> (Android / iPhone), ataupun{' '}
              <strong>kamera scanner website</strong>. Setelah dipindai, mereka akan langsung diarahkan ke menu dengan nomor meja otomatis terkunci.
            </p>
          </div>
        </div>

        {/* Configuration Card */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 space-y-4 shadow-soft">
          <div className="flex flex-wrap items-end gap-4">
            {/* Target URL Configuration */}
            <div className="flex-1 min-w-[280px]">
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-coffee-600" />
                Target URL Tujuan QR (Google Lens &amp; Kamera HP)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={DEFAULT_TARGET_URL}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-xs font-mono focus:outline-none focus:border-coffee-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setBaseUrl(DEFAULT_TARGET_URL)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                    baseUrl === DEFAULT_TARGET_URL
                      ? 'bg-coffee-700 text-cream border-coffee-700'
                      : 'bg-coffee-50 hover:bg-coffee-100 text-coffee-800 border-coffee-200'
                  }`}
                  title="Gunakan URL Produksi Vercel"
                >
                  Vercel Live
                </button>
                {origin && origin !== 'null' && (
                  <button
                    type="button"
                    onClick={() => setBaseUrl(`${origin}/menus`)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                      baseUrl === `${origin}/menus`
                        ? 'bg-coffee-700 text-cream border-coffee-700'
                        : 'bg-coffee-50 hover:bg-coffee-100 text-coffee-800 border-coffee-200'
                    }`}
                    title="Gunakan Host Browser Saat Ini"
                  >
                    Host Ini
                  </button>
                )}
              </div>
            </div>

            {/* Branch selector (superadmin only) */}
            {profile.role === 'superadmin' && (
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  <Building2 className="w-3.5 h-3.5 inline mr-1 text-coffee-600" />
                  Cabang
                </label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 h-10">
                    <Loader2 className="w-4 h-4 animate-spin text-coffee-400" />
                    <span className="text-sm text-charcoal/50">Memuat...</span>
                  </div>
                ) : (
                  <select
                    value={selectedBranchId}
                    onChange={(e) => {
                      setSelectedBranchId(e.target.value);
                      setSelectedBranchName(
                        branches.find((b) => b.id === e.target.value)?.name ?? '',
                      );
                    }}
                    className="px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors min-w-[180px]"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Admin — locked branch display */}
            {profile.role === 'admin' && selectedBranchName && (
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  <Building2 className="w-3.5 h-3.5 inline mr-1 text-coffee-600" />
                  Cabang
                </label>
                <div className="px-4 py-2.5 rounded-xl bg-coffee-50 border border-coffee-100 text-coffee-900 text-sm font-semibold">
                  {selectedBranchName}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Prefix Meja
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="A"
                className="w-24 px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                Jumlah Meja
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className="w-28 px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-coffee-100 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal/60">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-coffee-700 break-all">
              <span className="font-semibold text-charcoal/50">Contoh URL Meja 1:</span>
              <span className="bg-coffee-50 px-2 py-0.5 rounded border border-coffee-200/60">
                {tableNumbers[0] ? qrUrlFor(tableNumbers[0]) : ''}
              </span>
            </div>
            <div className="text-[11px] text-charcoal/50">
              Format QR: SVG Vektor Presisi Tinggi + Error Correction Level Q + Quiet Zone Margin
            </div>
          </div>
        </div>
      </div>

      {/* Printable & Interactive QR Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 print:p-0 print:max-w-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 gap-5 print:gap-6">
          {tableNumbers.map((table) => {
            const fullUrl = qrUrlFor(table);
            const isCopied = copiedTable === table;

            return (
              <div
                key={table}
                className="bg-white rounded-3xl border border-coffee-100/90 p-5 flex flex-col items-center text-center shadow-soft hover:shadow-soft-lg transition-all print:break-inside-avoid print:border-2 print:border-coffee-900 print:rounded-2xl print:shadow-none"
              >
                {/* Brand & Branch header */}
                <div className="flex items-center gap-1.5 text-coffee-800 mb-1">
                  <Coffee className="w-4 h-4 text-coffee-700" />
                  <span className="text-xs font-black uppercase tracking-wider">{brandName}</span>
                </div>
                {selectedBranchName && (
                  <p className="text-[11px] text-charcoal/60 mb-2 font-medium">
                    Cabang {selectedBranchName}
                  </p>
                )}

                {/* Google Lens Indicator (Badge) */}
                <div className="print:hidden mb-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                  <Camera className="w-3 h-3" />
                  <span>Google Lens &amp; Kamera HP Ready</span>
                </div>

                {/* High Contrast QR Code Container */}
                <div className="bg-white p-3 rounded-2xl border border-coffee-100/80 shadow-inner flex items-center justify-center">
                  <QRCodeSVG
                    id={`qr-code-${table}`}
                    value={fullUrl}
                    size={155}
                    level="Q"
                    marginSize={2}
                    className="w-[155px] h-[155px]"
                  />
                </div>

                {/* Table Number Title */}
                <p className="mt-3 text-xl font-black text-coffee-950 tracking-tight">
                  Meja {table}
                </p>

                {/* Instructions */}
                <p className="text-xs text-charcoal/60 mt-1 max-w-[220px] leading-snug">
                  Scan dengan <strong>Google Lens</strong>, <strong>Kamera HP</strong>, atau{' '}
                  <strong>Website</strong> untuk melihat menu &amp; pesan
                </p>

                {/* Direct Link text on print card */}
                <p className="text-[10px] text-charcoal/40 font-mono mt-1 break-all px-2">
                  {fullUrl.replace(/^https?:\/\//, '')}
                </p>

                {/* Interactive Action Buttons (hidden during printing) */}
                <div className="print:hidden mt-4 pt-3 border-t border-coffee-100/80 w-full flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(table)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-coffee-50 hover:bg-coffee-100 text-coffee-800 text-[11px] font-semibold transition-colors"
                    title="Salin tautan langsung"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Link</span>
                      </>
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
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
