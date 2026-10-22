'use client';

/**
 * /reservasi — Halaman Reservasi Meja (5-Step Stepper)
 *
 * Alur:
 *   1. Waktu & Tamu: Tanggal, jam, jumlah tamu, durasi (60-180 menit, step 30).
 *   2. Pilih Meja: Meja yang tersedia dari available_tables (kapasitas >= party size).
 *   3. Pre-Order: Menu cabang & ProductDetailModal di keranjang terpisah (cafe_reservation_cart).
 *   4. Data Pemesan: Nama, WhatsApp, acara/occasion, catatan.
 *   5. Pembayaran: Tampil QRIS cabang, countdown hold, upload bukti (signed URL privat),
 *      tombol "Saya sudah bayar", dan auto-refresh status konfirmasi staf.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  Clock,
  Users,
  Phone,
  User,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Coffee,
  Building2,
  Sparkles,
  QrCode,
  Upload,
  RefreshCw,
  Copy,
  Check,
  Search,
  Plus,
  Minus,
  UtensilsCrossed,
  ShieldCheck,
  PartyPopper,
  FileText,
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
import { fetchBranchMenu, type BranchMenuItem } from '@/lib/menu-availability';
import ProductDetailModal from '@/components/ui/ProductDetailModal';
import {
  loadReservationCart,
  saveReservationCart,
  clearReservationCart,
  type StoredCartItem,
} from '@/lib/cart';
import { saveReservationToHistory } from '@/lib/reservation-history';
import {
  getItemLineKey,
  type SelectedOption,
  calculateOptionsTotal,
  formatItemOptionsSummary,
} from '@/lib/item-options';

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  reservations_enabled: boolean;
  reservation_open_time: string;
  reservation_close_time: string;
  reservation_min_lead_minutes: number;
  reservation_max_days_ahead: number;
  reservation_hold_minutes: number;
  reservation_min_preorder: number;
  timezone?: string | null;
  qris_image_url?: string | null;
};

type TableOption = {
  id: string;
  code: string;
  label: string | null;
  seats: number;
};

type ReservationCreated = {
  id: string;
  code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  hold_expires_at: string | null;
  table_code?: string;
  table_label?: string | null;
};

const OCCASIONS = [
  'Santai / Kumpul',
  'Ulang Tahun',
  'Pertemuan / Rapat',
  'Buka Bersama',
  'Hari Spesial / Anniversary',
  'Lainnya',
];

const MENU_CATEGORIES = [
  { id: 'all', label: 'Semua' },
  { id: 'kopi', label: 'Kopi' },
  { id: 'non-kopi', label: 'Non-Kopi' },
  { id: 'makanan', label: 'Makanan' },
  { id: 'snack', label: 'Snack' },
];

function formatPrice(num: number): string {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReservasiPage() {
  const router = useRouter();

  // Branch data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Stepper: 1: Schedule | 2: Table | 3: Preorder | 4: Details | 5: Payment
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Schedule & Guests
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(120);

  // Step 2: Table Selection
  const [tables, setTables] = useState<TableOption[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableOption | null>(null);

  // Step 3: Pre-Order Menu
  const [menuItems, setMenuItems] = useState<BranchMenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartItems, setCartItems] = useState<StoredCartItem[]>([]);
  const [detailModalItem, setDetailModalItem] = useState<BranchMenuItem | null>(null);

  // Step 4: Customer Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [customOccasion, setCustomOccasion] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingHold, setSubmittingHold] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);

  // Step 5: Payment & Confirmation
  const [reservation, setReservation] = useState<ReservationCreated | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>('pending_payment');
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofUploadedPath, setProofUploadedPath] = useState<string | null>(null);
  const [claimingPayment, setClaimingPayment] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const branchTz = selectedBranch?.timezone || APP_TIMEZONE;

  // ─── Load Branches on Mount ───────────────────────────────────────────────────

  useEffect(() => {
    async function initBranches() {
      try {
        const res = await fetch('/api/branches/public');
        if (res.ok) {
          const json = await res.json();
          const list: Branch[] = json.branches ?? [];
          setBranches(list);
          if (list.length === 1) {
            setSelectedBranch(list[0]);
          } else if (list.length > 0 && !selectedBranch) {
            setSelectedBranch(list[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      } finally {
        setLoadingBranches(false);
      }
    }
    initBranches();
  }, []);

  // Set default date when branch is ready
  useEffect(() => {
    if (selectedBranch && !selectedDate) {
      const todayStr = formatDateYYYYMMDD(new Date(), branchTz);
      setSelectedDate(todayStr);
    }
  }, [selectedBranch, branchTz, selectedDate]);

  // Load existing reservation cart on mount
  useEffect(() => {
    const saved = loadReservationCart();
    setCartItems(saved);
  }, []);

  // Keep reservation cart saved
  const updateCart = useCallback((newItems: StoredCartItem[]) => {
    setCartItems(newItems);
    saveReservationCart(newItems);
  }, []);

  // ─── Available Tables Loader (Step 2) ─────────────────────────────────────────

  const fetchAvailableTables = useCallback(async () => {
    if (!selectedBranch || !selectedDate || !selectedTime) return;
    setLoadingTables(true);
    setTables([]);
    setSelectedTable(null);

    try {
      const startsAt = buildIsoWithTimezone(selectedDate, selectedTime, branchTz);
      const url = `/api/reservations/available-tables?branch_id=${selectedBranch.id}&starts_at=${encodeURIComponent(
        startsAt,
      )}&duration_minutes=${durationMinutes}&party_size=${partySize}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      } else {
        toast.error('Gagal memeriksa ketersediaan meja.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoadingTables(false);
    }
  }, [selectedBranch, selectedDate, selectedTime, durationMinutes, partySize, branchTz]);

  useEffect(() => {
    if (currentStep === 2 && selectedBranch && selectedDate && selectedTime) {
      void fetchAvailableTables();
    }
  }, [currentStep, selectedBranch, selectedDate, selectedTime, fetchAvailableTables]);

  // ─── Menu Loader (Step 3) ─────────────────────────────────────────────────────

  useEffect(() => {
    if (currentStep === 3 && selectedBranch && menuItems.length === 0) {
      setLoadingMenu(true);
      fetchBranchMenu(selectedBranch.id)
        .then((items) => setMenuItems(items || []))
        .catch(() => toast.error('Gagal memuat daftar menu.'))
        .finally(() => setLoadingMenu(false));
    }
  }, [currentStep, selectedBranch, menuItems.length]);

  // Preorder total calculation (client estimation for UI; server enforces real price)
  const preorderTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const optTotal = item.selectedOptions
        ? calculateOptionsTotal(item.selectedOptions as SelectedOption[])
        : 0;
      return sum + (item.price + optTotal) * item.quantity;
    }, 0);
  }, [cartItems]);

  const minPreorder = selectedBranch?.reservation_min_preorder || 0;
  const isPreorderValid = cartItems.length >= 1 && preorderTotal >= minPreorder;

  // ─── Step 4 -> 5: Create Reservation Hold ─────────────────────────────────────

  async function handleCreateHold() {
    if (!selectedBranch || !selectedTable || !selectedDate || !selectedTime) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('Silakan lengkapi nama dan nomor WhatsApp.');
      return;
    }
    if (!isPreorderValid) {
      toast.error('Pre-order menu belum memenuhi syarat minimum.');
      return;
    }

    setSubmittingHold(true);
    setHoldError(null);

    const startsAt = buildIsoWithTimezone(selectedDate, selectedTime, branchTz);
    const resolvedOccasion = occasion === 'Lainnya' ? (customOccasion.trim() || 'Lainnya') : occasion;

    const payloadLines = cartItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      note: item.note || null,
      selected_options: item.selectedOptions || null,
    }));

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: selectedBranch.id,
          table_id: selectedTable.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          party_size: partySize,
          starts_at: startsAt,
          duration_minutes: durationMinutes,
          occasion: resolvedOccasion,
          notes: notes.trim() || null,
          items: payloadLines,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setHoldError(data.error || 'Gagal membuat reservasi.');
        toast.error(data.error || 'Gagal membuat reservasi.');
        return;
      }

      const resCreated = data.reservation as ReservationCreated;
      setReservation(resCreated);
      setLiveStatus(resCreated.status || 'pending_payment');
      clearReservationCart();
      if (typeof window !== 'undefined' && resCreated?.code) {
        saveReservationToHistory(resCreated.code, {
          code: resCreated.code,
          status: resCreated.status,
          table_code: resCreated.table_code || selectedTable?.code || 'Meja',
          table_label: resCreated.table_label || selectedTable?.label,
          starts_at: resCreated.starts_at || startsAt,
          ends_at: resCreated.ends_at,
          party_size: partySize,
          customer_name: customerName,
          total: preorderTotal,
          preorder_total: preorderTotal,
          items: cartItems.map((ci) => ({
            id: ci.id,
            name: ci.name,
            price: ci.price,
            quantity: ci.quantity,
          })),
        });
      }
      setCurrentStep(5);
      toast.success(`Reservasi ${resCreated.code} berhasil dibuat!`);
    } catch {
      setHoldError('Terjadi kesalahan jaringan.');
      toast.error('Terjadi kesalahan jaringan.');
    } finally {
      setSubmittingHold(false);
    }
  }

  // ─── Step 5: Live Countdown & Status Polling ───────────────────────────────────

  useEffect(() => {
    if (currentStep !== 5 || !reservation?.hold_expires_at) return;

    function tick() {
      if (!reservation?.hold_expires_at) return;
      const rem = secondsUntil(reservation.hold_expires_at);
      setHoldSecondsLeft(rem);
      if (rem <= 0 && liveStatus === 'pending_payment') {
        setLiveStatus('expired');
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentStep, reservation?.hold_expires_at, liveStatus]);

  // Poll status from server every 5 seconds until confirmed or expired
  useEffect(() => {
    if (currentStep !== 5 || !reservation?.code) return;
    if (liveStatus === 'confirmed' || liveStatus === 'expired' || liveStatus === 'cancelled') return;

    let isCancelled = false;
    async function checkStatus() {
      try {
        const res = await fetch(`/api/reservations/${reservation!.code}`);
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled && json.reservation?.status) {
            setLiveStatus(json.reservation.status);
            if (json.reservation.status === 'confirmed') {
              toast.success('Pembayaran telah dikonfirmasi oleh staf!');
            }
          }
        }
      } catch {
        // network silent retry
      }
    }

    const poll = setInterval(checkStatus, 5000);
    return () => {
      isCancelled = true;
      clearInterval(poll);
    };
  }, [currentStep, reservation?.code, liveStatus]);

  // ─── Payment Proof Upload & Claim (Step 5) ────────────────────────────────────

  async function handleProofFileUpload(file: File) {
    if (!reservation?.code) return;
    setUploadingProof(true);
    try {
      // 1. Get private signed upload URL
      const ext = file.name.split('.').pop() || 'jpg';
      const urlRes = await fetch(`/api/reservations/${reservation.code}/proof-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ext: ext }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok || !urlData.uploadUrl) {
        toast.error(urlData.error || 'Gagal mempersiapkan unggahan bukti.');
        return;
      }

      // 2. Upload file via PUT to signed URL
      const uploadRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        toast.error('Gagal mengunggah berkas bukti pembayaran.');
        return;
      }

      setProofUploadedPath(urlData.path);
      toast.success('Bukti pembayaran berhasil diunggah.');
    } catch {
      toast.error('Terjadi kesalahan saat mengunggah bukti.');
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleClaimPayment() {
    if (!reservation?.code) return;
    if (!proofUploadedPath) {
      toast.error('Silakan pilih dan unggah bukti transfer / pembayaran terlebih dahulu.');
      return;
    }
    setClaimingPayment(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.code}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_path: proofUploadedPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal memproses klaim pembayaran.');
        return;
      }

      setLiveStatus('awaiting_confirmation');
      toast.success('Pemberitahuan telah dikirim ke staf barista. Mohon tunggu konfirmasi.');
    } catch {
      toast.error('Gagal memproses pembayaran.');
    } finally {
      setClaimingPayment(false);
    }
  }

  // ─── Time Slot Helpers ────────────────────────────────────────────────────────

  const todayStr = formatDateYYYYMMDD(new Date(), branchTz);
  const maxDays = selectedBranch?.reservation_max_days_ahead || 30;
  const maxDateStr = formatDateYYYYMMDD(
    new Date(Date.now() + maxDays * 86400_000),
    branchTz,
  );

  const rawSlots = useMemo(() => {
    return buildTimeSlots(
      selectedBranch?.reservation_open_time || '08:00',
      selectedBranch?.reservation_close_time || '21:00',
      30,
    );
  }, [selectedBranch?.reservation_open_time, selectedBranch?.reservation_close_time]);

  const availableSlots = useMemo(() => {
    if (selectedDate !== todayStr || !selectedBranch) return rawSlots;
    const minLeadMs = (selectedBranch.reservation_min_lead_minutes || 120) * 60_000;
    const now = Date.now();
    return rawSlots.filter((slot) => {
      const slotIso = buildIsoWithTimezone(selectedDate, slot, branchTz);
      return new Date(slotIso).getTime() - now >= minLeadMs;
    });
  }, [rawSlots, selectedDate, todayStr, selectedBranch, branchTz]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-24 text-charcoal">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-coffee-100/70 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (currentStep > 1 && currentStep < 5) setCurrentStep((s) => (s - 1) as any);
              else router.push('/menu');
            }}
            className="p-2 -ml-2 rounded-xl text-charcoal/70 hover:text-coffee-900 hover:bg-coffee-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-coffee-800 flex items-center justify-center text-cream">
              <Coffee className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-coffee-900 text-sm tracking-tight">Reservasi Meja</span>
          </div>
          <div className="w-7" />
        </div>
      </header>

      {/* Stepper Progress Bar */}
      {currentStep < 5 && (
        <div className="bg-white border-b border-coffee-100/50 py-3 px-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-coffee-100 -translate-y-1/2 z-0" />
            {[
              { num: 1, label: 'Waktu' },
              { num: 2, label: 'Meja' },
              { num: 3, label: 'Pre-order' },
              { num: 4, label: 'Data Diri' },
            ].map((st) => {
              const active = currentStep >= st.num;
              const isCurrent = currentStep === st.num;
              return (
                <div key={st.num} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-coffee-800 text-cream ring-4 ring-coffee-100 shadow'
                        : active
                        ? 'bg-coffee-600 text-white'
                        : 'bg-coffee-100 text-charcoal/40'
                    }`}
                  >
                    {active && currentStep > st.num ? <Check className="w-3.5 h-3.5" /> : st.num}
                  </div>
                  <span
                    className={`text-[11px] mt-1 font-semibold ${
                      isCurrent ? 'text-coffee-900' : 'text-charcoal/50'
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-6">
        {loadingBranches ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-coffee-600 mx-auto" />
            <p className="text-sm text-charcoal/60">Memuat informasi cabang...</p>
          </div>
        ) : branches.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-coffee-100 text-center space-y-4 my-8">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-bold text-coffee-900">Reservasi Belum Tersedia</h2>
            <p className="text-sm text-charcoal/60">Saat ini belum ada cabang yang mengaktifkan pemesanan reservasi meja online.</p>
            <button
              onClick={() => router.push('/menu')}
              className="px-6 py-2.5 rounded-xl bg-coffee-800 text-cream font-bold text-sm"
            >
              Lihat Menu Dine-In
            </button>
          </div>
        ) : (
          <div>
            {/* Branch Switcher (if multiple) */}
            {branches.length > 1 && currentStep < 5 && (
              <div className="mb-6 bg-white p-3 rounded-2xl border border-coffee-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-5 h-5 text-coffee-700" />
                  <div>
                    <p className="text-[11px] font-semibold text-charcoal/50 uppercase">Cabang Terpilih</p>
                    <p className="font-bold text-coffee-900 text-sm">{selectedBranch?.name}</p>
                  </div>
                </div>
                <select
                  className="text-xs font-semibold bg-coffee-50 border border-coffee-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                  value={selectedBranch?.id}
                  onChange={(e) => {
                    const b = branches.find((x) => x.id === e.target.value);
                    if (b) {
                      setSelectedBranch(b);
                      setSelectedTable(null);
                      setTables([]);
                    }
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ── STEP 1: Waktu & Tamu ────────────────────────────────────────── */}
            {currentStep === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-xl font-black text-coffee-900">Pilih Jadwal & Tamu</h1>
                  <p className="text-sm text-charcoal/60 mt-1">
                    Pemesanan minimal {selectedBranch?.reservation_min_lead_minutes || 120} menit sebelumnya.
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft space-y-5">
                  {/* Date Input */}
                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <CalendarDays className="w-4 h-4 text-coffee-700" /> Tanggal Kunjungan
                    </label>
                    <input
                      type="date"
                      min={todayStr}
                      max={maxDateStr}
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setSelectedTime('');
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-coffee-200 text-sm font-semibold text-coffee-900 focus:outline-none focus:ring-2 focus:ring-coffee-500/40"
                    />
                  </div>

                  {/* Party Size */}
                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <Users className="w-4 h-4 text-coffee-700" /> Jumlah Tamu
                    </label>
                    <div className="flex items-center gap-3">
                      {[1, 2, 4, 6, 8, 10, 12].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPartySize(num)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                            partySize === num
                              ? 'bg-coffee-800 text-cream border-coffee-800 shadow-sm'
                              : 'bg-white text-charcoal/70 border-coffee-200 hover:bg-coffee-50'
                          }`}
                        >
                          {num} org
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration Minutes (60..180, step 30) */}
                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <Clock className="w-4 h-4 text-coffee-700" /> Durasi Reservasi
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {[60, 90, 120, 150, 180].map((dur) => (
                        <button
                          key={dur}
                          type="button"
                          onClick={() => setDurationMinutes(dur)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            durationMinutes === dur
                              ? 'bg-coffee-800 text-cream border-coffee-800 shadow-sm'
                              : 'bg-white text-charcoal/70 border-coffee-200 hover:bg-coffee-50'
                          }`}
                        >
                          {dur / 60 >= 1 ? `${dur / 60} jam` : `${dur}m`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Slots */}
                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                      <Clock className="w-4 h-4 text-coffee-700" /> Jam Mulai
                    </label>
                    {availableSlots.length === 0 ? (
                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                        Tidak ada jam yang dapat dipesan untuk tanggal ini. Silakan pilih tanggal lain.
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
                        {availableSlots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2 rounded-xl text-xs font-mono font-bold border transition-all ${
                              selectedTime === slot
                                ? 'bg-coffee-800 text-cream border-coffee-800 shadow'
                                : 'bg-white text-charcoal/80 border-coffee-200 hover:border-coffee-400'
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!selectedDate || !selectedTime}
                  onClick={() => setCurrentStep(2)}
                  className="w-full py-3.5 rounded-xl bg-coffee-800 text-cream font-bold text-sm shadow-md hover:bg-coffee-900 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  Lanjut: Pilih Meja
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* ── STEP 2: Pilih Meja ──────────────────────────────────────────── */}
            {currentStep === 2 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-black text-coffee-900">Pilih Meja</h1>
                    <p className="text-xs text-charcoal/60 mt-0.5">
                      {selectedDate} • {selectedTime} • {partySize} Tamu ({durationMinutes} menit)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-coffee-700 font-bold hover:underline"
                  >
                    Ubah Waktu
                  </button>
                </div>

                {loadingTables ? (
                  <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-coffee-100">
                    <Loader2 className="w-7 h-7 animate-spin text-coffee-700 mx-auto" />
                    <p className="text-xs text-charcoal/60">Mengecek meja yang tersedia...</p>
                  </div>
                ) : tables.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-amber-200/80 text-center space-y-3">
                    <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                    <h3 className="font-bold text-coffee-900 text-base">Tidak Ada Meja Tersedia</h3>
                    <p className="text-xs text-charcoal/60 max-w-sm mx-auto">
                      Semua meja untuk kapasitas {partySize} orang sudah terpesan di jam {selectedTime}. Silakan pilih jam atau tanggal lain.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="px-5 py-2.5 rounded-xl bg-coffee-800 text-cream text-xs font-bold"
                    >
                      Pilih Jam Lain
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {tables.map((tbl) => {
                      const isSel = selectedTable?.id === tbl.id;
                      return (
                        <button
                          key={tbl.id}
                          type="button"
                          onClick={() => setSelectedTable(tbl)}
                          className={`p-4 rounded-2xl border text-left transition-all ${
                            isSel
                              ? 'bg-coffee-900 text-cream border-coffee-900 shadow-md ring-2 ring-coffee-400/40 scale-[1.02]'
                              : 'bg-white text-charcoal border-coffee-100 hover:border-coffee-300 shadow-soft'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className={`text-xs font-mono font-black px-2 py-0.5 rounded-md ${
                                isSel ? 'bg-cream/20 text-cream' : 'bg-coffee-50 text-coffee-800'
                              }`}
                            >
                              {tbl.code}
                            </span>
                            <span className="text-[11px] font-semibold opacity-70 flex items-center gap-1">
                              <Users className="w-3 h-3" /> {tbl.seats} kursi
                            </span>
                          </div>
                          <p className={`font-bold text-sm truncate ${isSel ? 'text-cream' : 'text-coffee-900'}`}>
                            {tbl.label || `Meja ${tbl.code}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="w-1/3 py-3 rounded-xl border border-coffee-200 text-xs font-bold text-charcoal/70 hover:bg-coffee-50"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTable}
                    onClick={() => setCurrentStep(3)}
                    className="w-2/3 py-3 rounded-xl bg-coffee-800 text-cream font-bold text-sm shadow-md hover:bg-coffee-900 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    Lanjut: Pre-Order Menu
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Pre-Order Menu ──────────────────────────────────────── */}
            {currentStep === 3 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-xl font-black text-coffee-900">Pre-Order Menu</h1>
                  <p className="text-xs text-charcoal/60 mt-0.5">
                    Pilih minimal 1 menu. {minPreorder > 0 && `Minimum pemesanan: ${formatPrice(minPreorder)}.`}
                  </p>
                </div>

                {/* Pre-Order Cart Summary Bar */}
                <div className="bg-white p-4 rounded-2xl border border-coffee-100 shadow-soft flex items-center justify-between">
                  <div>
                    <span className="text-xs text-charcoal/50 font-semibold block">Total Pre-Order:</span>
                    <span className="text-base font-black text-coffee-900">{formatPrice(preorderTotal)}</span>
                    <span className="text-[11px] text-charcoal/60 ml-2">({cartItems.length} item)</span>
                  </div>
                  {minPreorder > 0 && (
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                        preorderTotal >= minPreorder
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {preorderTotal >= minPreorder ? 'Min. Terpenuhi ✓' : `Kurang ${formatPrice(minPreorder - preorderTotal)}`}
                    </span>
                  )}
                </div>

                {/* Selected Items List */}
                {cartItems.length > 0 && (
                  <div className="bg-white p-4 rounded-2xl border border-coffee-100 shadow-sm space-y-3">
                    <p className="text-xs font-bold text-charcoal/60 uppercase tracking-wide">Item Terpilih:</p>
                    <div className="divide-y divide-coffee-50 max-h-56 overflow-y-auto">
                      {cartItems.map((cItem) => {
                        const optSummary = cItem.selectedOptions
                          ? formatItemOptionsSummary(cItem.selectedOptions as SelectedOption[])
                          : '';
                        const optAdd = cItem.selectedOptions
                          ? calculateOptionsTotal(cItem.selectedOptions as SelectedOption[])
                          : 0;
                        const lineTotal = (cItem.price + optAdd) * cItem.quantity;
                        return (
                          <div key={cItem.lineKey || cItem.id} className="py-2.5 flex items-center justify-between text-xs">
                            <div className="pr-3 flex-1">
                              <p className="font-bold text-coffee-900">{cItem.name}</p>
                              {optSummary && <p className="text-[11px] text-charcoal/50">{optSummary}</p>}
                              {cItem.note && <p className="text-[11px] text-coffee-700 italic">"{cItem.note}"</p>}
                              <p className="font-semibold text-coffee-800">{formatPrice(lineTotal)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (cItem.quantity > 1) {
                                    updateCart(
                                      cartItems.map((x) =>
                                        (x.lineKey || x.id) === (cItem.lineKey || cItem.id)
                                          ? { ...x, quantity: x.quantity - 1 }
                                          : x,
                                      ),
                                    );
                                  } else {
                                    updateCart(
                                      cartItems.filter(
                                        (x) => (x.lineKey || x.id) !== (cItem.lineKey || cItem.id),
                                      ),
                                    );
                                  }
                                }}
                                className="w-6 h-6 rounded-lg bg-coffee-100 text-coffee-800 flex items-center justify-center font-bold"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-bold w-4 text-center">{cItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  updateCart(
                                    cartItems.map((x) =>
                                      (x.lineKey || x.id) === (cItem.lineKey || cItem.id)
                                        ? { ...x, quantity: x.quantity + 1 }
                                        : x,
                                    ),
                                  );
                                }}
                                className="w-6 h-6 rounded-lg bg-coffee-800 text-cream flex items-center justify-center font-bold"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Categories & Search */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-charcoal/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari menu kopi, makanan..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-coffee-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {MENU_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                          activeCategory === cat.id
                            ? 'bg-coffee-800 text-cream'
                            : 'bg-white text-charcoal/70 border border-coffee-200 hover:bg-coffee-50'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Menu Grid */}
                {loadingMenu ? (
                  <div className="py-12 text-center text-xs text-charcoal/50">Memuat menu...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                    {menuItems
                      .filter((m) => !m.sold_out)
                      .filter((m) => (activeCategory === 'all' ? true : m.category?.toLowerCase() === activeCategory))
                      .filter((m) =>
                        searchQuery.trim()
                          ? m.name.toLowerCase().includes(searchQuery.toLowerCase())
                          : true,
                      )
                      .map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setDetailModalItem(item)}
                          className="bg-white rounded-2xl border border-coffee-100 overflow-hidden shadow-soft hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                        >
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-28 object-cover"
                            />
                          ) : (
                            <div className="w-full h-28 bg-coffee-50 flex items-center justify-center text-coffee-300">
                              <Coffee className="w-8 h-8" />
                            </div>
                          )}
                          <div className="p-3 space-y-1">
                            <p className="font-bold text-coffee-900 text-xs line-clamp-1">{item.name}</p>
                            <p className="text-coffee-800 font-extrabold text-xs">{formatPrice(item.price)}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Product Detail Modal */}
                <ProductDetailModal
                  item={detailModalItem}
                  isOpen={!!detailModalItem}
                  onClose={() => setDetailModalItem(null)}
                  allItems={menuItems}
                  onAddToCart={({ item, note, quantity, selectedOptions }) => {
                    const lineKey = getItemLineKey(item.id, note, selectedOptions);
                    const existingIdx = cartItems.findIndex((x) => (x.lineKey || x.id) === lineKey);
                    if (existingIdx >= 0) {
                      const updated = [...cartItems];
                      updated[existingIdx].quantity += quantity;
                      updateCart(updated);
                    } else {
                      updateCart([
                        ...cartItems,
                        {
                          id: item.id,
                          lineKey,
                          name: item.name,
                          price: item.price,
                          image_url: item.image_url,
                          quantity,
                          note,
                          selectedOptions,
                        },
                      ]);
                    }
                    setDetailModalItem(null);
                    toast.success(`${quantity}x ${item.name} ditambahkan.`);
                  }}
                />

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="w-1/3 py-3 rounded-xl border border-coffee-200 text-xs font-bold text-charcoal/70 hover:bg-coffee-50"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!isPreorderValid}
                    onClick={() => setCurrentStep(4)}
                    className="w-2/3 py-3 rounded-xl bg-coffee-800 text-cream font-bold text-sm shadow-md hover:bg-coffee-900 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    Lanjut: Data Pemesan
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 4: Data Pemesan ────────────────────────────────────────── */}
            {currentStep === 4 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-xl font-black text-coffee-900">Informasi Pemesan</h1>
                  <p className="text-xs text-charcoal/60 mt-0.5">
                    Masukkan data diri Anda untuk verifikasi reservasi di cafe.
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft space-y-4">
                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <User className="w-4 h-4 text-coffee-700" /> Nama Lengkap *
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Budi Santoso"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-coffee-200 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <Phone className="w-4 h-4 text-coffee-700" /> Nomor WhatsApp / HP *
                    </label>
                    <input
                      type="tel"
                      placeholder="Contoh: 081234567890"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-2.5 rounded-xl border border-coffee-200 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                    />
                    <p className="text-[11px] text-charcoal/50 mt-1">
                      4 digit terakhir ({customerPhone.slice(-4) || 'xxxx'}) akan digunakan sebagai kode verifikasi saat kedatangan.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <PartyPopper className="w-4 h-4 text-coffee-700" /> Keperluan / Acara
                    </label>
                    <select
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-coffee-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                    >
                      {OCCASIONS.map((occ) => (
                        <option key={occ} value={occ}>
                          {occ}
                        </option>
                      ))}
                    </select>
                    {occasion === 'Lainnya' && (
                      <input
                        type="text"
                        placeholder="Sebutkan acara Anda..."
                        value={customOccasion}
                        onChange={(e) => setCustomOccasion(e.target.value)}
                        className="w-full mt-2 px-4 py-2 rounded-xl border border-coffee-200 text-xs focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <FileText className="w-4 h-4 text-coffee-700" /> Catatan Tambahan (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Contoh: Meja dekat jendela / sediakan baby chair"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-coffee-200 text-xs focus:outline-none focus:ring-2 focus:ring-coffee-400/40"
                    />
                  </div>
                </div>

                {/* Booking Summary Card */}
                <div className="bg-coffee-50/70 p-4 rounded-2xl border border-coffee-100 text-xs space-y-2">
                  <p className="font-bold text-coffee-900 text-xs uppercase tracking-wide">Ringkasan Reservasi:</p>
                  <div className="flex justify-between">
                    <span className="text-charcoal/60">Waktu:</span>
                    <span className="font-semibold text-coffee-900">{selectedDate} pukul {selectedTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal/60">Meja:</span>
                    <span className="font-semibold text-coffee-900">{selectedTable?.code} ({selectedTable?.label})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal/60">Jumlah Tamu / Durasi:</span>
                    <span className="font-semibold text-coffee-900">{partySize} Orang ({durationMinutes} Menit)</span>
                  </div>
                  <div className="flex justify-between border-t border-coffee-200/50 pt-2 font-bold">
                    <span>Total Pre-Order:</span>
                    <span className="text-coffee-900">{formatPrice(preorderTotal)}</span>
                  </div>
                </div>

                {holdError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                    {holdError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="w-1/3 py-3 rounded-xl border border-coffee-200 text-xs font-bold text-charcoal/70 hover:bg-coffee-50"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={submittingHold || !customerName.trim() || !customerPhone.trim()}
                    onClick={handleCreateHold}
                    className="w-2/3 py-3 rounded-xl bg-coffee-800 text-cream font-bold text-sm shadow-md hover:bg-coffee-900 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submittingHold ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mengunci Meja...
                      </>
                    ) : (
                      <>
                        Lanjut ke Pembayaran
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 5: Pembayaran & Konfirmasi ────────────────────────────── */}
            {currentStep === 5 && reservation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Status Header */}
                <div className="text-center space-y-2">
                  {liveStatus === 'confirmed' ? (
                    <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Reservasi Dikonfirmasi
                    </div>
                  ) : liveStatus === 'expired' ? (
                    <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-100 text-red-800 text-xs font-extrabold">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      Waktu Pembayaran Berakhir
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold animate-pulse">
                      <Clock className="w-4 h-4 text-amber-600" />
                      Menunggu Konfirmasi Pembayaran
                    </div>
                  )}

                  <h1 className="text-2xl font-black text-coffee-900">
                    {liveStatus === 'confirmed'
                      ? 'Reservasi Berhasil!'
                      : liveStatus === 'expired'
                      ? 'Waktu Hold Telah Habis'
                      : 'Selesaikan Pembayaran'}
                  </h1>

                  {liveStatus !== 'confirmed' && liveStatus !== 'expired' && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-charcoal/70">
                      <span>Sisa waktu hold:</span>
                      <span className="font-mono font-black text-red-600 text-sm">
                        {formatCountdown(holdSecondsLeft)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expiry Message & Re-Order Button */}
                {liveStatus === 'expired' && (
                  <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-center space-y-4">
                    <p className="text-xs text-red-800 font-medium">
                      Slot meja telah otomatis dilepas karena batas waktu pembayaran terlewati.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentStep(1);
                        setReservation(null);
                        setProofUploadedPath(null);
                      }}
                      className="px-6 py-2.5 rounded-xl bg-coffee-800 text-cream font-bold text-xs"
                    >
                      Pesan Ulang
                    </button>
                  </div>
                )}

                {/* Booking Code Card */}
                <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft text-center space-y-2">
                  <p className="text-xs font-bold text-charcoal/50 uppercase tracking-wider">Kode Reservasi Anda</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-3xl font-black tracking-widest text-coffee-900">
                      {reservation.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(reservation.code);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                        toast.success('Kode reservasi disalin!');
                      }}
                      className="p-1.5 rounded-lg text-charcoal/40 hover:text-coffee-800 hover:bg-coffee-50"
                    >
                      {copiedCode ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-charcoal/50">
                    Simpan kode ini atau bookmark halaman ini untuk melihat status reservasi.
                  </p>
                </div>

                {/* QRIS & Payment Section (if still pending/awaiting) */}
                {liveStatus !== 'expired' && liveStatus !== 'confirmed' && (
                  <div className="bg-white p-5 rounded-2xl border border-coffee-100 shadow-soft space-y-5">
                    <div className="text-center space-y-1">
                      <p className="font-bold text-coffee-900 text-sm">Scan QRIS untuk Membayar</p>
                      <p className="text-xs text-charcoal/60">Total: {formatPrice(preorderTotal)}</p>
                    </div>

                    {/* QRIS Image */}
                    <div className="flex justify-center">
                      {selectedBranch?.qris_image_url ? (
                        <div className="p-3 bg-white border border-coffee-200 rounded-2xl shadow-sm max-w-[220px]">
                          <img
                            src={selectedBranch.qris_image_url}
                            alt="QRIS Pembayaran"
                            className="w-full object-contain rounded-xl"
                          />
                        </div>
                      ) : (
                        <div className="w-48 h-48 bg-coffee-50 border border-coffee-200 rounded-2xl flex flex-col items-center justify-center text-center p-4">
                          <QrCode className="w-12 h-12 text-coffee-400 mb-2" />
                          <p className="text-xs font-bold text-coffee-900">QRIS Kasir</p>
                          <p className="text-[11px] text-charcoal/50">Tersedia di kasir cabang {selectedBranch?.name}</p>
                        </div>
                      )}
                    </div>

                    {/* Mandatory Proof Upload */}
                    <div className="border-t border-coffee-100 pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-charcoal/70 uppercase tracking-wide flex items-center gap-1.5">
                          <Upload className="w-4 h-4 text-coffee-700" /> Unggah Bukti Transfer
                        </label>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          Wajib Diunggah
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className={`flex-1 px-4 py-2.5 rounded-xl border border-dashed cursor-pointer text-center text-xs font-semibold transition-all ${
                          proofUploadedPath
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
                            : 'border-coffee-300 hover:border-coffee-500 text-coffee-800 bg-coffee-50/50'
                        }`}>
                          {uploadingProof
                            ? 'Mengunggah...'
                            : proofUploadedPath
                            ? 'Bukti Pembayaran Terunggah ✓'
                            : 'Pilih Foto / Screenshot Transfer'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={uploadingProof}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleProofFileUpload(f);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <p className="text-[11px] text-charcoal/50">
                        Unggah foto atau tangkapan layar bukti transfer / QRIS (JPG, PNG, atau WebP, maks 5MB). Berkas disimpan secara privat.
                      </p>
                    </div>

                    {/* "Saya Sudah Bayar" Button */}
                    <button
                      type="button"
                      disabled={claimingPayment || uploadingProof || !proofUploadedPath || liveStatus === 'awaiting_confirmation'}
                      onClick={handleClaimPayment}
                      className="w-full py-3.5 rounded-xl bg-emerald-700 text-white font-bold text-sm shadow-md hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      {claimingPayment ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Memproses...
                        </>
                      ) : liveStatus === 'awaiting_confirmation' ? (
                        'Menunggu Konfirmasi Staf...'
                      ) : !proofUploadedPath ? (
                        'Unggah Bukti untuk Konfirmasi'
                      ) : (
                        'Saya Sudah Bayar'
                      )}
                    </button>
                    {!proofUploadedPath && (
                      <p className="text-center text-[11px] text-amber-700 font-medium">
                        * Wajib mengunggah bukti pembayaran di atas sebelum mengonfirmasi.
                      </p>
                    )}
                  </div>
                )}

                {/* Confirmed State CTA */}
                {liveStatus === 'confirmed' && (
                  <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center space-y-4">
                    <p className="text-xs text-emerald-800 font-medium">
                      Sampai jumpa di kafe! Saat tiba di meja <strong>{selectedTable?.code}</strong>, cukup scan QR meja dan konfirmasi check-in.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push(`/reservasi/${reservation.code}`)}
                      className="w-full py-3 rounded-xl bg-coffee-800 text-cream font-bold text-sm"
                    >
                      Lihat Rincian Reservasi
                    </button>
                  </div>
                )}

                {/* Direct Link to View Details */}
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/reservasi/${reservation.code}`)}
                    className="text-xs text-coffee-800 font-bold hover:underline"
                  >
                    Buka Halaman Status & Rincian Reservasi →
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
