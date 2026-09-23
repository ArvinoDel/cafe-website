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
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useAdminProfile } from '../../AdminShell';
import { fadeInUp, staggerContainer } from '@/lib/animations';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  address: string | null;
  opening_hours: string | null;
  maps_url: string | null;
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
                    <div className="mt-3 pt-3 border-t border-coffee-50 flex items-center gap-1.5 text-xs text-charcoal/50">
                      <Users className="w-3.5 h-3.5" />
                      <span>{adminCount} admin</span>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Location name is required.'); return; }
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      opening_hours: openingHours.trim() || null,
      maps_url: mapsUrl.trim() || null,
    };

    if (initial) {
      const { error: err } = await supabase.from('branches').update(payload).eq('id', initial.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('branches').insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
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
        className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft-lg"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-coffee-900">
            {initial ? 'Edit Location' : 'Add New Location'}
          </h3>
          <button onClick={onClose} className="text-charcoal/35 hover:text-charcoal/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <ErrorAlert message={error} />}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
              Location Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Main Street Cafe"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
              Address (optional)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street, City"
              className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
              Opening Hours (optional)
            </label>
            <input
              type="text"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              placeholder="Mon–Fri 7am–10pm · Sat–Sun 8am–11pm"
              className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
              Google Maps URL (optional)
            </label>
            <input
              type="url"
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.google.com/?q=..."
              className="w-full px-4 py-2.5 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-coffee-100 text-charcoal/70 font-semibold text-sm hover:bg-coffee-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
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
      className="fixed inset-0 z-50 bg-charcoal/30 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
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
