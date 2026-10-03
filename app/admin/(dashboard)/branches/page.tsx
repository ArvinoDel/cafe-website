'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Building2,
  Users,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  MapPin,
  Eye,
  EyeOff,
  Wifi,
  Clock,
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  address: string | null;
  opening_hours: string | null;
  maps_url: string | null;
  wifi_name: string | null;
  wifi_password: string | null;
  est_wait_minutes?: number | null;
  wait_per_order_minutes?: number | null;
  accepting_orders?: boolean;
  pause_message?: string | null;
  created_at: string;
};

type AdminUser = {
  id: string;
  full_name: string | null;
  branch_id: string;
  branch_name: string;
  email?: string;
};

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const profile = useAdminProfile();
  const router = useRouter();

  // Redirect non-superadmin immediately
  useEffect(() => {
    if (profile.role !== 'superadmin') router.replace('/admin');
  }, [profile.role, router]);

  if (profile.role !== 'superadmin') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-bold text-coffee-900">Access Denied</p>
          <p className="text-sm text-charcoal/50 mt-1">
            This page is only accessible to superadmins.
          </p>
        </div>
      </div>
    );
  }

  return <BranchesContent />;
}

function BranchesContent() {
  const supabase = getSupabase();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Branch form modal
  const [branchModal, setBranchModal] = useState<'create' | Branch | null>(null);
  // Admin creation form
  const [adminModal, setAdminModal] = useState(false);

  const fetchData = useCallback(async () => {
    const [branchRes, adminRes] = await Promise.all([
      supabase.from('branches').select('*').order('created_at'),
      supabase.from('profiles').select('id, full_name, branch_id, branches(name)').eq('role', 'admin'),
    ]);
    if (branchRes.data) setBranches(branchRes.data as Branch[]);
    if (adminRes.data) {
      setAdmins(
        (adminRes.data as any[]).map((r) => ({
          id: r.id,
          full_name: r.full_name,
          branch_id: r.branch_id,
          branch_name: r.branches?.name ?? '\u2013',
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-coffee-900">Branches &amp; Accounts</h1>
          <p className="text-sm text-charcoal/50 mt-0.5">
            {branches.length <= 1
              ? 'Manage your cafe location and admin accounts.'
              : `Manage ${branches.length} locations and admin accounts.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBranchModal('create')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coffee-700 text-cream text-sm font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            <Building2 className="w-4 h-4" />
            {branches.length === 0 ? 'Add Location' : branches.length === 1 ? 'Add Another Location' : 'Add Location'}
          </button>
          <button
            onClick={() => setAdminModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-coffee-100 text-coffee-700 text-sm font-bold hover:bg-coffee-50 transition-colors active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Add Admin
          </button>
        </div>
      </div>

      {/* Single-branch hint banner */}
      {branches.length === 1 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-coffee-50 border border-coffee-100">
          <Building2 className="w-5 h-5 text-coffee-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-coffee-900">Single location mode</p>
            <p className="text-xs text-charcoal/50 mt-0.5">
              Your cafe is running as a single location. Click &ldquo;Add Another Location&rdquo; above to expand to multiple branches — your public site will automatically switch to a multi-location view.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-coffee-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Branches list */}
          <section>
            <h2 className="text-sm font-bold text-charcoal/50 uppercase tracking-wide mb-3">
              Locations ({branches.length})
            </h2>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {branches.map((branch) => {
                const adminCount = admins.filter((a) => a.branch_id === branch.id).length;
                return (
                  <motion.div
                    key={branch.id}
                    variants={fadeInUp}
                    className="bg-white rounded-2xl border border-coffee-100/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-coffee-50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4.5 h-4.5 text-coffee-600" />
                        </div>
                        <div>
                          <p className="font-bold text-coffee-900 text-sm">{branch.name}</p>
                          {branch.address && (
                            <p className="text-xs text-charcoal/50 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              {branch.address}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setBranchModal(branch)}
                        className="p-1.5 rounded-lg text-charcoal/35 hover:text-coffee-700 hover:bg-coffee-50 transition-colors flex-shrink-0"
                        title="Edit cabang"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-3 pt-3 border-t border-coffee-50 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-charcoal/50">
                        <Users className="w-3.5 h-3.5" />
                        {adminCount} admin
                      </span>
                      {branch.wifi_name && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          <Wifi className="w-3 h-3" />
                          Wi-Fi
                        </span>
                      )}
                      {branch.est_wait_minutes ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                          <Clock className="w-3 h-3" />
                          ±{branch.est_wait_minutes} mnt
                          {branch.wait_per_order_minutes ? ` (+${branch.wait_per_order_minutes}m/antrean)` : ''}
                        </span>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
              {branches.length === 0 && (
                <div className="col-span-full text-center py-10 text-charcoal/40 text-sm">
                  No locations yet. Add your first location above.
                </div>
              )}
            </motion.div>
          </section>

          {/* Admins list */}
          <section>
            <h2 className="text-sm font-bold text-charcoal/50 uppercase tracking-wide mb-3">
              Branch Admin Accounts ({admins.length})
            </h2>
            <div className="bg-white rounded-2xl border border-coffee-100/80 overflow-hidden">
              {admins.length === 0 ? (
                <div className="text-center py-10 text-charcoal/40 text-sm">
                  No branch admin accounts yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-coffee-50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-charcoal/40 uppercase tracking-wide">
                        Nama
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-charcoal/40 uppercase tracking-wide">
                        Cabang
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-50">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-coffee-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-coffee-900">
                          {admin.full_name || '(Tanpa nama)'}
                        </td>
                        <td className="px-4 py-3 text-charcoal/60">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-coffee-400" />
                            {admin.branch_name}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {/* Branch form modal */}
      <AnimatePresence>
        {branchModal && (
          <BranchFormModal
            initial={branchModal === 'create' ? null : (branchModal as Branch)}
            onClose={() => setBranchModal(null)}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>

      {/* Admin create modal */}
      <AnimatePresence>
        {adminModal && (
          <AdminCreateModal
            branches={branches}
            onClose={() => setAdminModal(false)}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Branch form modal ────────────────────────────────────────────────────────

function BranchFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabase();
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [openingHours, setOpeningHours] = useState(initial?.opening_hours ?? '');
  const [mapsUrl, setMapsUrl] = useState(initial?.maps_url ?? '');
  const [wifiName, setWifiName] = useState(initial?.wifi_name ?? '');
  const [wifiPassword, setWifiPassword] = useState(initial?.wifi_password ?? '');
  const [estWaitMinutes, setEstWaitMinutes] = useState(
    initial?.est_wait_minutes !== null && initial?.est_wait_minutes !== undefined
      ? String(initial.est_wait_minutes)
      : '',
  );
  const [waitPerOrderMinutes, setWaitPerOrderMinutes] = useState(
    initial?.wait_per_order_minutes !== null && initial?.wait_per_order_minutes !== undefined
      ? String(initial.wait_per_order_minutes)
      : '0',
  );
  const [acceptingOrders, setAcceptingOrders] = useState(initial?.accepting_orders ?? true);
  const [pauseMessage, setPauseMessage] = useState(initial?.pause_message ?? '');
  const [showWifiPwd, setShowWifiPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Location name is required.'); return; }
    setSaving(true);
    setError(null);

    const parsedWait = estWaitMinutes.trim() ? parseInt(estWaitMinutes.trim(), 10) : null;
    const parsedWaitPerOrder = waitPerOrderMinutes.trim() ? parseInt(waitPerOrderMinutes.trim(), 10) : 0;
    const safeWaitPerOrder = isNaN(parsedWaitPerOrder) ? 0 : Math.min(30, Math.max(0, parsedWaitPerOrder));

    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      opening_hours: openingHours.trim() || null,
      maps_url: mapsUrl.trim() || null,
      wifi_name: wifiName.trim() || null,
      wifi_password: wifiPassword.trim() || null,
      est_wait_minutes: isNaN(parsedWait as number) ? null : parsedWait,
      wait_per_order_minutes: safeWaitPerOrder,
      accepting_orders: acceptingOrders,
      pause_message: pauseMessage.trim() || null,
    };

    if (initial) {
      const { error: err } = await supabase.from('branches').update(payload).eq('id', initial.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('branches').insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
    }

    // Invalidate cached branch data for the homepage
    try {
      const res = await fetch('/api/admin/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'branches' }),
      });
      if (!res.ok) {
        toast('Tersimpan, tapi tampilan publik mungkin baru berubah dalam beberapa menit.');
      }
    } catch {
      toast('Tersimpan, tapi tampilan publik mungkin baru berubah dalam beberapa menit.');
    }

    onSaved();
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-soft-xl border border-coffee-100 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-coffee-100/80 bg-white flex-shrink-0">
          <div>
            <h3 className="font-extrabold text-lg text-coffee-900">
              {initial ? 'Edit Lokasi Cabang' : 'Tambah Cabang Baru'}
            </h3>
            <p className="text-xs text-charcoal/50 mt-0.5">
              Atur detail lokasi, estimasi waktu antrean, dan Wi-Fi cabang.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-charcoal/40 hover:text-coffee-900 hover:bg-coffee-50 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {error && <ErrorAlert message={error} />}

            {/* Section 1: Detail Cabang */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-coffee-900 mb-1.5">
                  Nama Cabang <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Kopi Nako Pajajaran"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                  Alamat (opsional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Jl. Pajajaran No. 12, Bogor"
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    Jam Operasional (opsional)
                  </label>
                  <input
                    type="text"
                    value={openingHours}
                    onChange={(e) => setOpeningHours(e.target.value)}
                    placeholder="Sen–Min 08:00–22:00"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">
                    Link Google Maps (opsional)
                  </label>
                  <input
                    type="url"
                    value={mapsUrl}
                    onChange={(e) => setMapsUrl(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Estimasi Waktu Tunggu & Antrean Pintar */}
            <div className="pt-4 border-t border-coffee-100/70">
              <div className="flex items-center gap-1.5 mb-3">
                <Clock className="w-3.5 h-3.5 text-coffee-600" />
                <h4 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">
                  Estimasi Waktu Tunggu
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Waktu Dasar (menit)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={estWaitMinutes}
                    onChange={(e) => setEstWaitMinutes(e.target.value)}
                    placeholder="Contoh: 15"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">
                    Waktu persiapan awal saat tidak ada antrean.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Tambahan per Antrean (menit)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={waitPerOrderMinutes}
                    onChange={(e) => setWaitPerOrderMinutes(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">
                    0 = waktu tetap. Tambah per pesanan di antrean.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Wi-Fi Tamu */}
            <div className="pt-4 border-t border-coffee-100/70">
              <div className="flex items-center gap-1.5 mb-3">
                <Wifi className="w-3.5 h-3.5 text-coffee-600" />
                <h4 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">
                  Akses Wi-Fi Tamu (opsional)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Nama Jaringan (SSID)
                  </label>
                  <input
                    type="text"
                    value={wifiName}
                    onChange={(e) => setWifiName(e.target.value)}
                    placeholder="KopiNako-FreeWifi"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Password Wi-Fi
                  </label>
                  <div className="relative">
                    <input
                      type={showWifiPwd ? 'text' : 'password'}
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-10 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPwd((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal/70 transition-colors"
                      aria-label={showWifiPwd ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showWifiPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Status Pemesanan (Jeda Pesanan) */}
            <div className="pt-4 border-t border-coffee-100/70">
              <h4 className="text-xs font-bold text-coffee-900 uppercase tracking-wide mb-3">
                Status Pemesanan Tamu
              </h4>
              <div className="p-3.5 rounded-2xl bg-coffee-50/60 border border-coffee-100 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-coffee-900">
                      {acceptingOrders ? 'Menerima Pesanan' : 'Pemesanan Dijeda'}
                    </p>
                    <p className="text-xs text-charcoal/50 mt-0.5">
                      {acceptingOrders
                        ? 'Tamu dapat membuka menu dan memesan normal.'
                        : 'Pemesanan baru dinonaktifkan sementara.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAcceptingOrders((v) => !v)}
                    aria-pressed={acceptingOrders}
                    aria-label={acceptingOrders ? 'Jeda pemesanan' : 'Buka pemesanan'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 focus:outline-none ${
                      acceptingOrders ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        acceptingOrders ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {!acceptingOrders && (
                  <div className="pt-2 border-t border-coffee-200/60">
                    <label className="block text-xs font-semibold text-charcoal/70 mb-1.5">
                      Pesan Jeda untuk Tamu (maks. 120 karakter)
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={pauseMessage}
                      onChange={(e) => setPauseMessage(e.target.value)}
                      placeholder="Contoh: Sedang persiapan, buka kembali pukul 10.00"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-charcoal text-xs focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-6 py-4 bg-coffee-50/50 border-t border-coffee-100/80 flex items-center justify-end gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-coffee-200/80 bg-white text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors active:scale-95"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60 flex items-center gap-1.5 shadow-soft"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Cabang</span>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </ModalBackdrop>
  );
}

// ─── Admin create modal ───────────────────────────────────────────────────────

function AdminCreateModal({
  branches,
  onClose,
  onSaved,
}: {
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !branchId) {
      setError('Harap isi semua field wajib.');
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch('/api/admin/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim(), branchId }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Gagal membuat akun admin.');
      setSaving(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 1500);
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft-lg"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-coffee-900">Buat Akun Admin Cabang</h3>
          <button onClick={onClose} className="text-charcoal/35 hover:text-charcoal/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="font-bold text-coffee-900">Akun berhasil dibuat!</p>
          </div>
        ) : (
          <>
            {error && <ErrorAlert message={error} />}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                  Cabang <span className="text-red-500">*</span>
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Admin Bogor"
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin.cabang@cafe.id"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 karakter"
                    required
                    className="w-full pr-11 px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/35 hover:text-charcoal/60"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
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
                  className="flex-1 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60"
                >
                  {saving ? 'Membuat...' : 'Buat Akun'}
                </button>
              </div>
            </form>
          </>
        )}
      </motion.div>
    </ModalBackdrop>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      key="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center my-auto py-2">
        {children}
      </div>
    </motion.div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200/80 mb-4">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
