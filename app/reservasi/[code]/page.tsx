'use client';

/**
 * /reservasi/[code] — Halaman Rincian & Status Reservasi
 *
 * Pelanggan dapat:
 *   1. Melihat status terkini dan rincian pemesanan meja serta pre-order.
 *   2. Memverifikasi dengan cookie pemilik otomatis, atau input 4 digit terakhir nomor HP.
 *   3. Mengunggah bukti pembayaran & klaim bayar (jika pending).
 *   4. Mengubah catatan & acara (PATCH /api/reservations/[code]/update).
 *   5. Menjadwalkan ulang meja / waktu (POST /api/reservations/[code]/reschedule).
 *   6. Membatalkan reservasi (POST /api/reservations/[code]/cancel) dengan pemberitahuan refund.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  Clock,
  Users,
  Building2,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Coffee,
  ArrowLeft,
  Loader2,
  Edit3,
  Calendar,
  XCircle,
  Upload,
  QrCode,
  ShieldCheck,
  FileText,
  PartyPopper,
  X,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  APP_TIMEZONE,
  formatDateTime,
  formatHHMM,
  formatDateYYYYMMDD,
  buildIsoWithTimezone,
  buildTimeSlots,
  formatCountdown,
  secondsUntil,
} from '@/lib/datetime';

type ReservationPublic = {
  id: string;
  code: string;
  branch_id: string;
  table_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  party_size: number;
  occasion: string | null;
  notes: string | null;
  table_code: string;
  table_label: string | null;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    note?: string | null;
    selected_options?: any[] | null;
  }>;
  preorder_total?: number;
  total?: number;
  hold_expires_at: string | null;
  refund_status: 'none' | 'needs_refund' | 'refunded';
};

type TableOption = {
  id: string;
  code: string;
  label: string | null;
  seats: number;
};

const STATUS_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  pending_payment: {
    label: 'Menunggu Pembayaran',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    desc: 'Silakan selesaikan pembayaran sebelum waktu hold berakhir.',
  },
  awaiting_confirmation: {
    label: 'Menunggu Konfirmasi Staf',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    desc: 'Bukti pembayaran sedang diverifikasi oleh staf kasir/barista.',
  },
  confirmed: {
    label: 'Dikonfirmasi',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    desc: 'Reservasi Anda telah disetujui! Meja telah siap.',
  },
  seated: {
    label: 'Telah Check-in (Sedang di Meja)',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    desc: 'Anda sudah menempati meja reservasi.',
  },
  completed: {
    label: 'Selesai',
    color: 'bg-coffee-100 text-coffee-800 border-coffee-300',
    desc: 'Sesi kunjungan reservasi telah selesai. Terima kasih!',
  },
  cancelled: {
    label: 'Dibatalkan',
    color: 'bg-red-100 text-red-800 border-red-300',
    desc: 'Reservasi ini telah dibatalkan.',
  },
  expired: {
    label: 'Kedaluwarsa',
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    desc: 'Waktu pembayaran reservasi telah berakhir.',
  },
  no_show: {
    label: 'Tidak Hadir',
    color: 'bg-red-100 text-red-800 border-red-300',
    desc: 'Pelanggan tidak hadir melewati batas waktu kedatangan.',
  },
};

function formatPrice(num: number): string {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

export default function ReservationDetailPage({
  params,
}: {
  params?: { code?: string } | Promise<{ code?: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeParams = useParams();

  const rawCode = (
    (typeof routeParams?.code === 'string' ? routeParams.code : null) ||
    (params && typeof (params as any)?.code === 'string' ? (params as any).code : '')
  );
  const code = (rawCode || '').trim().toUpperCase();

  const [reservation, setReservation] = useState<ReservationPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsVerifier, setNeedsVerifier] = useState(false);
  const [verifierInput, setVerifierInput] = useState(searchParams.get('v') || '');
  const [activeVerifier, setActiveVerifier] = useState(searchParams.get('v') || '');

  const [copied, setCopied] = useState(false);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);

  // Modals state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editOccasion, setEditOccasion] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleTables, setRescheduleTables] = useState<TableOption[]>([]);
  const [rescheduleTableId, setRescheduleTableId] = useState('');
  const [loadingRescheduleTables, setLoadingRescheduleTables] = useState(false);
  const [savingReschedule, setSavingReschedule] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Upload state
  const [uploadingProof, setUploadingProof] = useState(false);
  const [claimingPayment, setClaimingPayment] = useState(false);

  // ─── Fetch Reservation ────────────────────────────────────────────────────────

  const fetchReservation = useCallback(
    async (verifierArg?: string) => {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (verifierArg) {
          headers['x-reservation-verifier'] = verifierArg;
        }
        const res = await fetch(`/api/reservations/${code}`, { headers });
        if (res.status === 404) {
          setNeedsVerifier(true);
          setReservation(null);
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setReservation(json.reservation);
          if (typeof window !== 'undefined' && json.reservation?.code) {
            localStorage.setItem('last_reservation_code', json.reservation.code.toUpperCase());
          }
          setNeedsVerifier(false);
          setEditNotes(json.reservation.notes || '');
          setEditOccasion(json.reservation.occasion || '');
        } else {
          toast.error('Gagal memuat rincian reservasi.');
        }
      } catch {
        toast.error('Terjadi kesalahan jaringan.');
      } finally {
        setLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    void fetchReservation(activeVerifier);
  }, [fetchReservation, activeVerifier]);

  // Hold countdown ticker
  useEffect(() => {
    if (!reservation?.hold_expires_at) return;
    function tick() {
      if (!reservation?.hold_expires_at) return;
      const rem = secondsUntil(reservation.hold_expires_at);
      setHoldSecondsLeft(rem);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [reservation?.hold_expires_at]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async function handleSaveEdit() {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/reservations/${code}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: editNotes,
          occasion: editOccasion,
          verifier: activeVerifier || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal mengubah rincian reservasi.');
        return;
      }
      toast.success('Rincian berhasil diperbarui.');
      setShowEditModal(false);
      void fetchReservation(activeVerifier);
    } catch {
      toast.error('Gagal mengubah rincian.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleLoadRescheduleTables() {
    if (!reservation || !rescheduleDate || !rescheduleTime) return;
    setLoadingRescheduleTables(true);
    setRescheduleTables([]);
    setRescheduleTableId('');
    try {
      const startsAt = buildIsoWithTimezone(rescheduleDate, rescheduleTime, APP_TIMEZONE);
      const res = await fetch(
        `/api/reservations/available-tables?branch_id=${reservation.branch_id}&starts_at=${encodeURIComponent(
          startsAt,
        )}&duration_minutes=${reservation.duration_minutes}&party_size=${reservation.party_size}`,
      );
      if (res.ok) {
        const json = await res.json();
        setRescheduleTables(json.tables || []);
      }
    } catch {
      toast.error('Gagal memeriksa meja.');
    } finally {
      setLoadingRescheduleTables(false);
    }
  }

  async function handleExecuteReschedule() {
    if (!rescheduleDate || !rescheduleTime || !rescheduleTableId) return;
    setSavingReschedule(true);
    try {
      const newStartsAt = buildIsoWithTimezone(rescheduleDate, rescheduleTime, APP_TIMEZONE);
      const res = await fetch(`/api/reservations/${code}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_starts_at: newStartsAt,
          new_table_id: rescheduleTableId,
          verifier: activeVerifier || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal menjadwalkan ulang.');
        return;
      }
      toast.success('Jadwal reservasi berhasil dipindahkan!');
      setShowRescheduleModal(false);
      void fetchReservation(activeVerifier);
    } catch {
      toast.error('Gagal menjadwalkan ulang.');
    } finally {
      setSavingReschedule(false);
    }
  }

  async function handleExecuteCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/reservations/${code}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifier: activeVerifier || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal membatalkan reservasi.');
        return;
      }
      toast.success(data.message || 'Reservasi berhasil dibatalkan.');
      setShowCancelModal(false);
      void fetchReservation(activeVerifier);
    } catch {
      toast.error('Gagal membatalkan reservasi.');
    } finally {
      setCancelling(false);
    }
  }

  async function handleUploadProof(file: File) {
    setUploadingProof(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const urlRes = await fetch(`/api/reservations/${code}/proof-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ext: ext, verifier: activeVerifier || undefined }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok || !urlData.uploadUrl) {
        toast.error(urlData.error || 'Gagal membuat URL bukti.');
        return;
      }

      const putRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!putRes.ok) {
        toast.error('Gagal mengunggah berkas.');
        return;
      }

      // Claim payment with proof path
      const payRes = await fetch(`/api/reservations/${code}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_path: urlData.path,
          verifier: activeVerifier || undefined,
        }),
      });
      const payData = await payRes.json();
      if (payRes.ok) {
        toast.success('Bukti pembayaran berhasil dikirim!');
        void fetchReservation(activeVerifier);
      } else {
        toast.error(payData.error || 'Gagal mengonfirmasi bukti.');
      }
    } catch {
      toast.error('Terjadi kesalahan unggah.');
    } finally {
      setUploadingProof(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const displayTotal = reservation
    ? (reservation.preorder_total ?? (reservation as any).total ?? (
        Array.isArray(reservation.items)
          ? reservation.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
          : 0
      ))
    : 0;

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-24 text-charcoal">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-coffee-100/70 shadow-sm">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/reservasi')}
            className="p-2 -ml-2 rounded-xl text-charcoal/70 hover:text-coffee-900 hover:bg-coffee-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-coffee-900 text-sm">Rincian Reservasi</span>
          </div>
          <div className="w-7" />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-coffee-700 mx-auto" />
            <p className="text-xs text-charcoal/60">Memuat rincian reservasi {code}...</p>
          </div>
        ) : needsVerifier ? (
          /* Verifier Prompt (404) */
          <div className="bg-white p-6 rounded-2xl border border-coffee-100 shadow-soft text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-coffee-900">Verifikasi Pemesan</h2>
            <p className="text-xs text-charcoal/60 max-w-sm mx-auto">
              Untuk melindungi privasi, masukkan <strong>4 digit terakhir nomor WhatsApp</strong> yang Anda gunakan saat memesan kode <strong>{code}</strong>.
            </p>
            <div className="max-w-xs mx-auto space-y-3">
              <input
                type="text"
                placeholder="4 digit terakhir (cth: 4444)"
                value={verifierInput}
                onChange={(e) => setVerifierInput(e.target.value.replace(/\D/g, ''))}
                maxLength={4}
                className="w-full text-center tracking-widest font-mono text-lg font-bold px-4 py-2.5 rounded-xl border border-coffee-200 focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
              />
              <button
                type="button"
                disabled={verifierInput.length < 4}
                onClick={() => {
                  setActiveVerifier(verifierInput.trim());
                  void fetchReservation(verifierInput.trim());
                }}
                className="w-full py-2.5 rounded-xl bg-coffee-800 text-cream font-bold text-xs shadow disabled:opacity-50 hover:bg-coffee-900"
              >
                Buka Reservasi
              </button>
            </div>
          </div>
        ) : !reservation ? (
          <div className="bg-white p-8 rounded-2xl border border-coffee-100 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <h2 className="text-base font-bold text-coffee-900">Reservasi Tidak Ditemukan</h2>
            <p className="text-xs text-charcoal/60">Periksa kembali kode reservasi atau verifikasi Anda.</p>
            <button
              onClick={() => router.push('/reservasi')}
              className="px-5 py-2 rounded-xl bg-coffee-800 text-cream text-xs font-bold"
            >
              Buat Reservasi Baru
            </button>
          </div>
        ) : (
          <>
            {/* Status Card */}
            {(() => {
              const st = STATUS_LABELS[reservation.status] || {
                label: reservation.status,
                color: 'bg-coffee-100 text-coffee-800',
                desc: '',
              };
              return (
                <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-charcoal/50">KODE: {reservation.code}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(reservation.code);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                        toast.success('Kode disalin!');
                      }}
                      className="p-1 rounded text-charcoal/40 hover:text-coffee-800"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="space-y-1">
                    <span className={`inline-block text-xs font-black px-3 py-1 rounded-full border ${st.color}`}>
                      {st.label}
                    </span>
                    <p className="text-xs text-charcoal/60 pt-1">{st.desc}</p>
                  </div>

                  {/* Hold timer & Proof upload for pending payment */}
                  {reservation.status === 'pending_payment' && (
                    <div className="space-y-3 pt-2">
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                        <span>Sisa waktu pembayaran:</span>
                        <span className="font-mono font-bold text-sm text-red-600">
                          {formatCountdown(holdSecondsLeft)}
                        </span>
                      </div>

                      <div className="p-4 bg-coffee-50/60 rounded-xl border border-coffee-200 space-y-3 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-coffee-900 flex items-center gap-1.5">
                            <Upload className="w-4 h-4 text-coffee-700" /> Unggah Bukti Pembayaran
                          </span>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                            Wajib
                          </span>
                        </div>
                        <p className="text-[11px] text-charcoal/60 leading-relaxed">
                          Selesaikan pembayaran pre-order sejumlah <strong>{formatPrice(displayTotal)}</strong> lalu unggah tangkapan layar bukti transfer / QRIS di bawah ini.
                        </p>
                        <label className={`w-full py-2.5 px-4 rounded-xl border border-dashed cursor-pointer text-center text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                          uploadingProof
                            ? 'bg-coffee-100 border-coffee-400 text-coffee-700 cursor-not-allowed'
                            : 'bg-white border-coffee-300 text-coffee-800 hover:border-coffee-500 hover:bg-coffee-50 shadow-sm'
                        }`}>
                          {uploadingProof ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-coffee-700" />
                              Mengunggah & Mengonfirmasi Bukti...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-coffee-700" />
                              Pilih Foto / Screenshot Bukti Transfer
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={uploadingProof}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadProof(f);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {reservation.refund_status === 'needs_refund' && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                      ⚠️ <strong>Pengembalian Dana:</strong> Reservasi ini berstatus menunggu pengembalian dana dari pihak kasir/staf.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Reservation Summary */}
            <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft space-y-3 text-xs">
              <h3 className="font-bold text-coffee-900 text-sm border-b border-coffee-50 pb-2">Jadwal & Meja</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-charcoal/50 block">Waktu Mulai:</span>
                  <span className="font-bold text-coffee-900">{formatDateTime(reservation.starts_at)}</span>
                </div>
                <div>
                  <span className="text-charcoal/50 block">Meja:</span>
                  <span className="font-bold text-coffee-900">
                    {reservation.table_code} ({reservation.table_label || 'Meja Reguler'})
                  </span>
                </div>
                <div>
                  <span className="text-charcoal/50 block">Tamu & Durasi:</span>
                  <span className="font-bold text-coffee-900">
                    {reservation.party_size} Orang • {reservation.duration_minutes} Menit
                  </span>
                </div>
                <div>
                  <span className="text-charcoal/50 block">Acara:</span>
                  <span className="font-bold text-coffee-900">{reservation.occasion || 'Santai'}</span>
                </div>
              </div>
              {reservation.notes && (
                <div className="pt-2 border-t border-coffee-50">
                  <span className="text-charcoal/50 block">Catatan:</span>
                  <span className="font-medium text-coffee-900 italic">"{reservation.notes}"</span>
                </div>
              )}
            </div>

            {/* Pre-order Items */}
            {reservation.items && reservation.items.length > 0 && (
              <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-coffee-50 pb-2">
                  <h3 className="font-bold text-coffee-900 text-sm">Pre-Order Menu</h3>
                  <span className="font-bold text-coffee-900">{formatPrice(displayTotal)}</span>
                </div>
                <div className="divide-y divide-coffee-50">
                  {reservation.items.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-coffee-900">{item.quantity}x {item.name}</p>
                        {item.note && <p className="text-[11px] text-coffee-700 italic">"{item.note}"</p>}
                      </div>
                      <span className="font-semibold text-coffee-800">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {['pending_payment', 'awaiting_confirmation', 'confirmed'].includes(reservation.status) && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="py-2.5 rounded-xl border border-coffee-200 bg-white text-xs font-bold text-coffee-900 hover:bg-coffee-50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Ubah Catatan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const startsD = new Date(reservation.starts_at);
                    setRescheduleDate(formatDateYYYYMMDD(startsD));
                    setRescheduleTime(formatHHMM(startsD).replace('.', ':'));
                    setShowRescheduleModal(true);
                  }}
                  className="py-2.5 rounded-xl border border-coffee-200 bg-white text-xs font-bold text-coffee-900 hover:bg-coffee-50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Jadwal Ulang
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="py-2.5 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-700 hover:bg-red-100 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Batalkan
                </button>
              </div>
            )}

            {/* Seated State: Arrival Confirmed & Add-on Order CTA */}
            {reservation.status === 'seated' && (
              <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-5 text-center space-y-3.5 shadow-soft">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-extrabold text-emerald-950 text-base">
                    Anda Telah Menempati Meja {reservation.table_code}
                  </h3>
                  <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">
                    Kedatangan Anda telah terverifikasi dan meja aktif. Struk pemesanan Anda telah tersimpan.
                  </p>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => router.push(`/menu?table=${encodeURIComponent(reservation.table_code)}&branch=${encodeURIComponent(reservation.branch_id)}`)}
                    className="w-full py-3.5 px-4 rounded-xl bg-coffee-800 hover:bg-coffee-900 text-cream font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                  >
                    <UtensilsCrossed className="w-4 h-4 text-cream/90" />
                    Pesan Makanan / Minuman Tambahan
                  </button>
                  <p className="text-[11px] text-charcoal/50 mt-2">
                    Ingin tambah kopi, cemilan, atau menu lain? Pesanan tambahan akan langsung dikirim ke meja ini.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Modal: Ubah Catatan & Acara ─────────────────────────────────────── */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-coffee-100 pb-2">
                <h3 className="font-bold text-coffee-900 text-sm">Ubah Rincian Reservasi</h3>
                <button onClick={() => setShowEditModal(false)} className="text-charcoal/50 hover:text-coffee-900">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="text-xs font-bold text-charcoal/70 mb-1 block">Acara / Keperluan</label>
                <input
                  type="text"
                  value={editOccasion}
                  onChange={(e) => setEditOccasion(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-charcoal/70 mb-1 block">Catatan untuk Staf</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-xs focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 rounded-xl border border-coffee-200 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveEdit}
                  className="flex-1 py-2 rounded-xl bg-coffee-800 text-cream text-xs font-bold shadow disabled:opacity-50"
                >
                  {savingEdit ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Jadwalkan Ulang (Reschedule) ──────────────────────────────── */}
      <AnimatePresence>
        {showRescheduleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-coffee-100 pb-2">
                <h3 className="font-bold text-coffee-900 text-sm">Jadwalkan Ulang Reservasi</h3>
                <button onClick={() => setShowRescheduleModal(false)} className="text-charcoal/50 hover:text-coffee-900">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-charcoal/70 mb-1 block">Tanggal Baru</label>
                <input
                  type="date"
                  min={formatDateYYYYMMDD(new Date())}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-charcoal/70 mb-1 block">Jam Baru</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-coffee-200 text-xs focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleLoadRescheduleTables}
                disabled={!rescheduleDate || !rescheduleTime || loadingRescheduleTables}
                className="w-full py-2 rounded-xl bg-coffee-100 text-coffee-800 text-xs font-bold hover:bg-coffee-200 disabled:opacity-50"
              >
                {loadingRescheduleTables ? 'Memeriksa Meja...' : 'Cari Meja Tersedia'}
              </button>

              {rescheduleTables.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-charcoal/70 mb-1 block">Pilih Meja Baru</label>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                    {rescheduleTables.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setRescheduleTableId(t.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs ${
                          rescheduleTableId === t.id
                            ? 'bg-coffee-900 text-cream border-coffee-900 font-bold'
                            : 'bg-white text-charcoal border-coffee-200'
                        }`}
                      >
                        <p className="font-mono font-bold">{t.code}</p>
                        <p className="text-[10px] opacity-75">{t.seats} Kursi</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="flex-1 py-2 rounded-xl border border-coffee-200 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingReschedule || !rescheduleTableId}
                  onClick={handleExecuteReschedule}
                  className="flex-1 py-2 rounded-xl bg-coffee-800 text-cream text-xs font-bold shadow disabled:opacity-50"
                >
                  {savingReschedule ? 'Memindahkan...' : 'Konfirmasi Pindah'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Batalkan Reservasi (Cancel with Refund Notice) ───────────── */}
      <AnimatePresence>
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <h3 className="font-bold text-coffee-900 text-sm">Batalkan Reservasi Meja?</h3>
              </div>
              <p className="text-xs text-charcoal/70">
                Apakah Anda yakin ingin membatalkan reservasi <strong>{code}</strong>?
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                ℹ️ <strong>Ketentuan Pengembalian Dana:</strong>
                <br />
                Jika pembayaran telah terkonfirmasi, dana Anda akan ditandai untuk dikembalikan (refund) oleh staf kasir.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-2 rounded-xl border border-coffee-200 text-xs font-bold"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleExecuteCancel}
                  className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-bold shadow hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Membatalkan...' : 'Ya, Batalkan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
