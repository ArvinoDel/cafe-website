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
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
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
  walkin_lock_minutes?: number | null;
  claim_soft_hold_minutes?: number | null;
  claim_soft_hold_max_minutes?: number | null;
  reservations_enabled?: boolean;
  reservation_open_time?: string | null;
  reservation_close_time?: string | null;
  reservation_min_lead_minutes?: number | null;
  reservation_max_days_ahead?: number | null;
  reservation_hold_minutes?: number | null;
  reservation_grace_minutes?: number | null;
  reservation_buffer_minutes?: number | null;
  reservation_min_preorder?: number | null;
  qris_image_url?: string | null;
  claim_max_holds_per_ip?: number | null;
  trusted_ip_hashes?: any;
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
  return getSupabaseBrowserClient();
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
  const [walkinLockMinutes, setWalkinLockMinutes] = useState(
    initial?.walkin_lock_minutes !== null && initial?.walkin_lock_minutes !== undefined
      ? String(initial.walkin_lock_minutes)
      : '180',
  );
  const [claimSoftHoldMinutes, setClaimSoftHoldMinutes] = useState(
    initial?.claim_soft_hold_minutes !== null && initial?.claim_soft_hold_minutes !== undefined
      ? String(initial.claim_soft_hold_minutes)
      : '20',
  );
  const [claimSoftHoldMaxMinutes, setClaimSoftHoldMaxMinutes] = useState(
    initial?.claim_soft_hold_max_minutes !== null && initial?.claim_soft_hold_max_minutes !== undefined
      ? String(initial.claim_soft_hold_max_minutes)
      : '45',
  );
  const [claimMaxHoldsPerIp, setClaimMaxHoldsPerIp] = useState(
    initial?.claim_max_holds_per_ip !== null && initial?.claim_max_holds_per_ip !== undefined
      ? String(initial.claim_max_holds_per_ip)
      : '15',
  );
  const [trustedWifiEntries, setTrustedWifiEntries] = useState<
    Array<{ id: string; hash_prefix: string; added_by: string; added_at: string; label: string }>
  >([]);
  const [wifiLabelInput, setWifiLabelInput] = useState('');
  const [loadingWifiEntries, setLoadingWifiEntries] = useState(false);
  const [savingTrustedIp, setSavingTrustedIp] = useState(false);
  const [deletingWifiId, setDeletingWifiId] = useState<string | null>(null);

  // Reservation settings
  const [reservationsEnabled, setReservationsEnabled] = useState(initial?.reservations_enabled ?? false);
  const [reservationOpenTime, setReservationOpenTime]     = useState(initial?.reservation_open_time ?? '08:00');
  const [reservationCloseTime, setReservationCloseTime]   = useState(initial?.reservation_close_time ?? '21:00');
  const [reservationMinLead, setReservationMinLead]       = useState(String(initial?.reservation_min_lead_minutes ?? 120));
  const [reservationMaxDays, setReservationMaxDays]       = useState(String(initial?.reservation_max_days_ahead ?? 30));
  const [reservationHold, setReservationHold]             = useState(String(initial?.reservation_hold_minutes ?? 15));
  const [reservationGrace, setReservationGrace]           = useState(String(initial?.reservation_grace_minutes ?? 15));
  const [reservationBuffer, setReservationBuffer]         = useState(String(initial?.reservation_buffer_minutes ?? 15));
  const [reservationMinPreorder, setReservationMinPreorder] = useState(String(initial?.reservation_min_preorder ?? 0));
  const [qrisImageUrl, setQrisImageUrl]                   = useState(initial?.qris_image_url ?? '');
  const [showWifiPwd, setShowWifiPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWifiEntries = useCallback(async () => {
    if (!initial?.id) return;
    setLoadingWifiEntries(true);
    try {
      const res = await fetch(`/api/admin/branches/trusted-ip?branch_id=${initial.id}`);
      const data = await res.json();
      if (res.ok && data.entries) {
        setTrustedWifiEntries(data.entries);
      }
    } catch (err) {
      console.error('Failed to fetch trusted wifi entries:', err);
    } finally {
      setLoadingWifiEntries(false);
    }
  }, [initial?.id]);

  useEffect(() => {
    if (initial?.id) {
      fetchWifiEntries();
    }
  }, [initial?.id, fetchWifiEntries]);

  async function handleSaveCurrentIp() {
    if (!initial?.id) {
      toast('Simpan cabang terlebih dahulu sebelum mendaftarkan IP Wi-Fi kafe.');
      return;
    }
    if (trustedWifiEntries.length >= 5) {
      toast('Maksimal 5 Wi-Fi terpercaya per cabang. Hapus entri lama terlebih dahulu.');
      return;
    }
    setSavingTrustedIp(true);
    try {
      const res = await fetch('/api/admin/branches/trusted-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: initial.id,
          label: wifiLabelInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan hash IP');
      setWifiLabelInput('');
      toast('Hash IP Wi-Fi kafe berhasil disimpan.');
      await fetchWifiEntries();
    } catch (err: any) {
      toast(`Gagal: ${err.message}`);
    } finally {
      setSavingTrustedIp(false);
    }
  }

  async function handleDeleteWifiEntry(id: string) {
    if (!initial?.id) return;
    setDeletingWifiId(id);
    try {
      const res = await fetch(
        `/api/admin/branches/trusted-ip?id=${encodeURIComponent(id)}&branch_id=${initial.id}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus entri Wi-Fi');
      toast('Wi-Fi kafe berhasil dihapus.');
      await fetchWifiEntries();
    } catch (err: any) {
      toast(`Gagal: ${err.message}`);
    } finally {
      setDeletingWifiId(null);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Location name is required.'); return; }
    setSaving(true);
    setError(null);

    const parsedWait = estWaitMinutes.trim() ? parseInt(estWaitMinutes.trim(), 10) : null;
    const parsedWaitPerOrder = waitPerOrderMinutes.trim() ? parseInt(waitPerOrderMinutes.trim(), 10) : 0;
    const safeWaitPerOrder = isNaN(parsedWaitPerOrder) ? 0 : Math.min(30, Math.max(0, parsedWaitPerOrder));

    const parsedLockMin = walkinLockMinutes.trim() ? parseInt(walkinLockMinutes.trim(), 10) : 180;
    const safeLockMin   = isNaN(parsedLockMin) ? 180 : Math.min(720, Math.max(15, parsedLockMin));

    const parsedSoftHold = claimSoftHoldMinutes.trim() ? parseInt(claimSoftHoldMinutes.trim(), 10) : 20;
    const safeSoftHold   = isNaN(parsedSoftHold) ? 20 : Math.min(60, Math.max(5, parsedSoftHold));

    const parsedSoftHoldMax = claimSoftHoldMaxMinutes.trim() ? parseInt(claimSoftHoldMaxMinutes.trim(), 10) : 45;
    const safeSoftHoldMax   = isNaN(parsedSoftHoldMax) ? 45 : Math.min(60, Math.max(20, parsedSoftHoldMax));

    const parsedMaxHolds = claimMaxHoldsPerIp.trim() ? parseInt(claimMaxHoldsPerIp.trim(), 10) : 15;
    const safeMaxHolds   = isNaN(parsedMaxHolds) ? 15 : Math.max(1, parsedMaxHolds);

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
      walkin_lock_minutes: safeLockMin,
      claim_soft_hold_minutes: safeSoftHold,
      claim_soft_hold_max_minutes: safeSoftHoldMax,
      claim_max_holds_per_ip: safeMaxHolds,
      reservations_enabled: reservationsEnabled,
      reservation_open_time: reservationOpenTime,
      reservation_close_time: reservationCloseTime,
      reservation_min_lead_minutes: Math.min(1440, Math.max(15, parseInt(reservationMinLead, 10) || 120)),
      reservation_max_days_ahead:   Math.min(365, Math.max(1, parseInt(reservationMaxDays, 10) || 30)),
      reservation_hold_minutes:     Math.min(60, Math.max(5, parseInt(reservationHold, 10) || 15)),
      reservation_grace_minutes:    Math.min(60, Math.max(0, parseInt(reservationGrace, 10) || 15)),
      reservation_buffer_minutes:   Math.min(60, Math.max(0, parseInt(reservationBuffer, 10) || 15)),
      reservation_min_preorder:     Math.max(0, parseInt(reservationMinPreorder, 10) || 0),
      qris_image_url: qrisImageUrl.trim() || null,
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

            {/* Section 3b: Klaim Meja (Walk-in Lock) */}
            <div className="pt-4 border-t border-coffee-100/70">
              <div className="flex items-center gap-1.5 mb-3">
                <Clock className="w-3.5 h-3.5 text-coffee-600" />
                <h4 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">
                  Klaim Meja (Walk-in)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Durasi Kunci Meja Penuh (menit)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={720}
                    value={walkinLockMinutes}
                    onChange={(e) => setWalkinLockMinutes(e.target.value)}
                    placeholder="180"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">
                    Berapa lama (dalam menit) meja terkunci setelah pelanggan memesan (default: 180 menit / 3 jam).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Durasi Tahan Awal / Soft Hold (menit)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={claimSoftHoldMinutes}
                    onChange={(e) => setClaimSoftHoldMinutes(e.target.value)}
                    placeholder="20"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">
                    Durasi meja ditahan sementara saat QR discan sebelum pesanan dibuat (5–60 mnt, default 20).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Durasi Tahan Maksimal / Max Soft Hold (menit)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={60}
                    value={claimSoftHoldMaxMinutes}
                    onChange={(e) => setClaimSoftHoldMaxMinutes(e.target.value)}
                    placeholder="45"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">
                    Batas atas perpanjangan hold via aktivitas keranjang (20–60 mnt, default 45). Hold tidak dapat diperpanjang melewati nilai ini.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Batas Hold per IP (Walk-in)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={claimMaxHoldsPerIp}
                    onChange={(e) => setClaimMaxHoldsPerIp(e.target.value)}
                    placeholder="15"
                    className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">
                    Maksimum meja aktif non-upgraded yang dapat ditahan bersamaan dari IP yang sama (default: 15). Meja pada IP terpercaya (Wi-Fi kafe) tidak dibatasi batas ini.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3c: Reservasi */}
            <div className="pt-4 border-t border-coffee-100/70">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-coffee-600" />
                  <h4 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">Reservasi Meja</h4>
                </div>
                {/* Enable toggle */}
                <button
                  type="button"
                  onClick={() => setReservationsEnabled((v) => !v)}
                  aria-pressed={reservationsEnabled}
                  aria-label={reservationsEnabled ? 'Nonaktifkan reservasi' : 'Aktifkan reservasi'}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 focus:outline-none ${
                    reservationsEnabled ? 'bg-emerald-600' : 'bg-charcoal/20'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    reservationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {reservationsEnabled && (
                <div className="space-y-3">
                  {/* Open / close time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Jam Buka Slot</label>
                      <input
                        type="time"
                        value={reservationOpenTime}
                        onChange={(e) => setReservationOpenTime(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Jam Tutup Slot</label>
                      <input
                        type="time"
                        value={reservationCloseTime}
                        onChange={(e) => setReservationCloseTime(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Min lead / max days */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Min. Pemesanan Awal (menit)</label>
                      <input type="number" min={15} max={1440} value={reservationMinLead}
                        onChange={(e) => setReservationMinLead(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                      <p className="text-[10px] text-charcoal/40 mt-0.5">Sebelum waktu mulai reservasi.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Maks. Hari ke Depan</label>
                      <input type="number" min={1} max={365} value={reservationMaxDays}
                        onChange={(e) => setReservationMaxDays(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                    </div>
                  </div>

                  {/* Hold / grace / buffer */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Tahan (mnt)</label>
                      <input type="number" min={5} max={60} value={reservationHold}
                        onChange={(e) => setReservationHold(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                      <p className="text-[10px] text-charcoal/40 mt-0.5">Batas bayar.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Toleransi (mnt)</label>
                      <input type="number" min={0} max={60} value={reservationGrace}
                        onChange={(e) => setReservationGrace(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                      <p className="text-[10px] text-charcoal/40 mt-0.5">Keterlambatan.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1">Buffer (mnt)</label>
                      <input type="number" min={0} max={60} value={reservationBuffer}
                        onChange={(e) => setReservationBuffer(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                      <p className="text-[10px] text-charcoal/40 mt-0.5">Jarak antar sesi.</p>
                    </div>
                  </div>

                  {/* Min pre-order */}
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/70 mb-1">Min. Pre-order (Rp, 0 = tidak wajib)</label>
                    <input type="number" min={0} value={reservationMinPreorder}
                      onChange={(e) => setReservationMinPreorder(e.target.value)}
                      placeholder="0"
                      className="w-full max-w-[200px] px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                  </div>

                  {/* QRIS image URL */}
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/70 mb-1">URL Gambar QRIS (opsional)</label>
                    <input type="url" value={qrisImageUrl}
                      onChange={(e) => setQrisImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors" />
                    <p className="text-[10px] text-charcoal/40 mt-0.5">Ditampilkan saat pelanggan harus bayar pre-order.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Wi-Fi kafe */}
            <div className="pt-4 border-t border-coffee-100/70">
              <div className="flex items-center gap-1.5 mb-3">
                <Wifi className="w-3.5 h-3.5 text-coffee-600" />
                <h4 className="text-xs font-bold text-coffee-900 uppercase tracking-wide">
                  Wi-Fi kafe
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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

              {/* Wi-Fi kafe trusted IP registration & list */}
              <div className="p-4 rounded-2xl bg-coffee-50/60 border border-coffee-100 space-y-3.5">
                <div>
                  <p className="text-xs font-bold text-coffee-900">
                    Jaringan Wi-Fi Terpercaya (Bypass Batas Hold &amp; Cooldown)
                  </p>
                  <p className="text-[11px] text-charcoal/60 mt-0.5">
                    Maksimal 5 entri per cabang. Pelanggan yang tersambung ke Wi-Fi kafe dibebaskan dari pembatasan per-IP hold dan cooldown.
                  </p>
                </div>

                {/* Warning Alert */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    Tekan hanya saat HP/laptop Anda tersambung ke Wi-Fi kafe, bukan data seluler atau rumah.
                  </span>
                </div>

                {/* Add entry form */}
                {initial?.id ? (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <input
                      type="text"
                      value={wifiLabelInput}
                      onChange={(e) => setWifiLabelInput(e.target.value)}
                      placeholder="Label Wi-Fi (contoh: Wi-Fi Kasir / Router Utama)"
                      maxLength={50}
                      disabled={savingTrustedIp || trustedWifiEntries.length >= 5}
                      className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-coffee-100 text-charcoal text-xs focus:outline-none focus:border-coffee-400 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCurrentIp}
                      disabled={savingTrustedIp || trustedWifiEntries.length >= 5}
                      className="px-4 py-2 rounded-xl bg-coffee-600 hover:bg-coffee-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 shrink-0 shadow-sm"
                    >
                      {savingTrustedIp
                        ? 'Menyimpan...'
                        : trustedWifiEntries.length >= 5
                        ? 'Maksimal 5 Entri'
                        : 'Daftarkan Wi-Fi Ini'}
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-charcoal/40 italic">
                    Simpan cabang dulu untuk mendaftarkan Wi-Fi
                  </span>
                )}

                {/* Registered Wi-Fi list */}
                {initial?.id && (
                  <div className="space-y-2 pt-2 border-t border-coffee-100/60">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-coffee-800 uppercase tracking-wider">
                        Daftar Wi-Fi Terdaftar ({trustedWifiEntries.length}/5)
                      </p>
                    </div>

                    {loadingWifiEntries ? (
                      <p className="text-xs text-charcoal/50 italic py-1">Memuat daftar Wi-Fi...</p>
                    ) : trustedWifiEntries.length === 0 ? (
                      <p className="text-xs text-charcoal/40 italic py-1">
                        Belum ada IP Wi-Fi yang didaftarkan untuk cabang ini.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {trustedWifiEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-coffee-100 text-xs gap-2"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-coffee-950 truncate">
                                {entry.label || 'Wi-Fi Kafe'}
                              </p>
                              <p className="text-[10px] text-charcoal/50">
                                Hash: <code className="bg-coffee-50 px-1 py-0.5 rounded font-mono font-bold text-coffee-800">{entry.hash_prefix}...</code> • Ditambahkan: {entry.added_by}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteWifiEntry(entry.id)}
                              disabled={deletingWifiId === entry.id}
                              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
                            >
                              {deletingWifiId === entry.id ? 'Menghapus...' : 'Hapus'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
