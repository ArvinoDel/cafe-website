'use client';

import { useEffect, useMemo, useState, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, Coffee, Building2, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';


type Branch = { id: string; name: string };

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

  const [origin, setOrigin] = useState('');
  const [prefix, setPrefix] = useState('A');
  const [count, setCount] = useState(12);

  // Branch selection (superadmin only)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedBranchName, setSelectedBranchName] = useState<string>('');
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);

    if (profile.role === 'superadmin') {
      setLoadingBranches(true);
      getSupabase()
        .from('branches')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
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

  const qrUrlFor = (table: string) =>
    selectedBranchId
      ? `${origin}/menu?table=${table}&branch=${selectedBranchId}`
      : `${origin}/menu?table=${table}`;

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Dashboard</span>
            </button>
            <h1 className="font-bold text-coffee-900">QR Code Meja</h1>
            <div className="w-24" />
          </div>
        </div>
      </div>

      {/* Controls — hidden when printing */}
      <div className="print:hidden max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5 flex flex-wrap items-end gap-4">
          {/* Branch selector (superadmin only) */}
          {profile.role === 'superadmin' && (
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />
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
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />
                Cabang
              </label>
              <div className="px-4 py-2.5 rounded-xl bg-coffee-50 border border-coffee-100 text-coffee-900 text-sm font-semibold">
                {selectedBranchName}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
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
            <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
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
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 ml-auto"
          >
            <Printer className="w-4 h-4" />
            Cetak Semua
          </button>
        </div>
        <p className="text-xs text-charcoal/40 mt-3">
          Setiap kode mengarah ke{' '}
          <span className="font-medium">
            /menu?table=&lt;nomor&gt;&amp;branch=&lt;cabang&gt;
          </span>{' '}
          — nomor meja dan cabang akan otomatis terisi saat pelanggan memindai.
        </p>
      </div>

      {/* Printable QR grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 print:p-0 print:max-w-none">
        <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-2 gap-4 print:gap-6">
          {tableNumbers.map((table) => (
            <div
              key={table}
              className="bg-white rounded-2xl border border-coffee-100/80 p-5 flex flex-col items-center text-center print:break-inside-avoid print:border-2 print:border-coffee-900 print:rounded-none"
            >
              <div className="flex items-center gap-1.5 text-coffee-700 mb-1">
                <Coffee className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Kopi Nako</span>
              </div>
              {selectedBranchName && (
                <p className="text-[10px] text-charcoal/50 mb-2 font-medium">{selectedBranchName}</p>
              )}
              <div className="bg-white p-2 rounded-lg">
                {origin && selectedBranchId ? (
                  <QRCodeSVG value={qrUrlFor(table)} size={140} marginSize={0} />
                ) : (
                  <div className="w-[140px] h-[140px] bg-coffee-50 rounded-lg animate-pulse" />
                )}
              </div>
              <p className="mt-3 text-lg font-extrabold text-coffee-900">Meja {table}</p>
              <p className="text-xs text-charcoal/40 mt-0.5">Scan untuk lihat menu &amp; pesan</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
