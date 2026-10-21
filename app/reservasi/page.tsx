'use client';

/**
 * /reservasi — Halaman Reservasi Meja
 *
 * Pelanggan dapat memilih cabang, tanggal, jam, meja, dan mengisi data diri
 * untuk membuat reservasi. Tidak memerlukan login.
 *
 * Alur:
 *   1. Pilih cabang (jika multi-branch)
 *   2. Pilih tanggal & jam mulai (hanya slot yang tersedia ditampilkan)
 *   3. Pilih meja dari daftar meja aktif
 *   4. Isi nama, nomor telepon, email (opsional), jumlah tamu, catatan
 *   5. Submit → tampil kode reservasi + instruksi
 */

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  Clock,
  Users,
  Phone,
  Mail,
  User,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Coffee,
  Building2,
  TableIcon,
  StickyNote,
} from 'lucide-react';
import { APP_TIMEZONE, formatDateTime, formatHHMM } from '@/lib/datetime';

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = {
  id: string;
  name: string;
  reservations_enabled: boolean;
  reservation_open_time: string;
  reservation_close_time: string;
  reservation_min_lead_minutes: number;
  reservation_max_days_ahead: number;
  reservation_min_preorder: number;
  reservation_hold_minutes: number;
};

type TableOption = {
  id: string;
  code: string;
  label: string | null;
  seats: number;
};

type ReservationResult = {
  code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  hold_expires_at: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toJakartaDateInput(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE }); // YYYY-MM-DD
}

function buildTimeSlots(openTime: string, closeTime: string, stepMin = 30): string[] {
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const slots: string[] = [];
  let cur = oh * 60 + om;
  const end = ch * 60 + cm;
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    cur += stepMin;
  }
  return slots;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReservasiPage() {
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [selectedBranch, setSelectedBranch]   = useState<Branch | null>(null);

  // Form step: 'branch' | 'datetime' | 'table' | 'details' | 'success'
  const [step, setStep] = useState<'branch' | 'datetime' | 'table' | 'details' | 'success'>('branch');

  // Selections
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedTable, setSelectedTable] = useState<TableOption | null>(null);
  const [tables, setTables]               = useState<TableOption[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Details form
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<ReservationResult | null>(null);

  // ── Load branches ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/branches/public');
        if (res.ok) {
          const json = await res.json();
          const enabled: Branch[] = (json.branches ?? []);
          setBranches(enabled);
          if (enabled.length === 1) {
            setSelectedBranch(enabled[0]);
            setStep('datetime');
          }
        }
      } finally {
        setLoadingBranches(false);
      }
    }
    void load();
  }, []);

  // ── Load available tables when date+time selected ─────────────────────────

  const loadTables = useCallback(async (branch: Branch, date: string, time: string) => {
    if (!branch || !date || !time) return;
    setLoadingTables(true);
    setTables([]);
    setSelectedTable(null);
    try {
      // Combine date + time + Jakarta TZ offset (+07:00)
      const startsAt = `${date}T${time}:00+07:00`;
      const res = await fetch(
        `/api/reservations/available-tables?branch_id=${branch.id}&starts_at=${encodeURIComponent(startsAt)}`
      );
      if (res.ok) {
        const json = await res.json();
        setTables(json.tables ?? []);
      }
    } finally {
      setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'table' && selectedBranch && selectedDate && selectedTime) {
      void loadTables(selectedBranch, selectedDate, selectedTime);
    }
  }, [step, selectedBranch, selectedDate, selectedTime, loadTables]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedBranch || !selectedTable || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError(null);

    const startsAt = `${selectedDate}T${selectedTime}:00+07:00`;

    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id:      selectedBranch.id,
        table_id:       selectedTable.id,
        customer_name:  name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim() || null,
        party_size:     parseInt(partySize, 10),
        starts_at:      startsAt,
        notes:          notes.trim() || null,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Terjadi kesalahan. Coba lagi.');
      setSubmitting(false);
      return;
    }

    setResult(json.reservation);
    setStep('success');
    setSubmitting(false);
  }

  // ── Date constraints ───────────────────────────────────────────────────────

  const todayJakarta = toJakartaDateInput(new Date());
  const maxDate = selectedBranch
    ? toJakartaDateInput(new Date(Date.now() + (selectedBranch.reservation_max_days_ahead ?? 30) * 86400_000))
    : '';

  const timeSlots = selectedBranch
    ? buildTimeSlots(
        selectedBranch.reservation_open_time ?? '08:00',
        selectedBranch.reservation_close_time ?? '21:00',
      )
    : [];

  // Filter slots that are at least min_lead_minutes away
  const now = new Date();
  const minLeadMs = (selectedBranch?.reservation_min_lead_minutes ?? 120) * 60_000;
  const filteredSlots = selectedDate === todayJakarta
    ? timeSlots.filter((t) => {
        const slotMs = new Date(`${selectedDate}T${t}:00+07:00`).getTime();
        return slotMs - now.getTime() >= minLeadMs;
      })
    : timeSlots;

  // ── Step indicator ─────────────────────────────────────────────────────────

  const STEPS = ['Cabang', 'Waktu', 'Meja', 'Data Diri'];
  const stepIdx = step === 'branch' ? 0 : step === 'datetime' ? 1 : step === 'table' ? 2 : step === 'details' ? 3 : 4;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-coffee-50/30 to-cream">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-coffee-700 flex items-center justify-center flex-shrink-0">
            <Coffee className="w-4 h-4 text-cream" />
          </div>
          <div>
            <span className="text-sm font-extrabold text-coffee-900">Reservasi Meja</span>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Step progress bar */}
        {step !== 'success' && (
          <div className="mb-8">
            <div className="flex items-center gap-1">
              {STEPS.map((label, idx) => (
                <div key={label} className="flex items-center gap-1 flex-1 last:flex-none">
                  <div className={`flex flex-col items-center gap-1 ${idx <= stepIdx ? 'opacity-100' : 'opacity-30'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      idx < stepIdx
                        ? 'bg-emerald-500 text-white'
                        : idx === stepIdx
                          ? 'bg-coffee-700 text-cream'
                          : 'bg-coffee-100 text-charcoal/50'
                    }`}>
                      {idx < stepIdx ? '✓' : idx + 1}
                    </div>
                    <span className="text-[10px] font-semibold text-charcoal/60 hidden sm:block">{label}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full mx-1 ${idx < stepIdx ? 'bg-emerald-300' : 'bg-coffee-100'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* ── STEP: Branch ──────────────────────────────────────────────── */}
          {step === 'branch' && (
            <motion.div
              key="branch"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div>
                <h1 className="text-xl font-extrabold text-coffee-900">Pilih Cabang</h1>
                <p className="text-sm text-charcoal/60 mt-1">Mana cabang yang ingin Anda kunjungi?</p>
              </div>

              {loadingBranches ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-coffee-400" />
                </div>
              ) : branches.length === 0 ? (
                <div className="text-center py-12 text-charcoal/50 text-sm">
                  Fitur reservasi belum tersedia saat ini.
                </div>
              ) : (
                <div className="space-y-3">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { setSelectedBranch(b); setStep('datetime'); }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-coffee-100 hover:border-coffee-300 hover:shadow-soft-md active:scale-[0.99] transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-coffee-50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4.5 h-4.5 text-coffee-600" />
                        </div>
                        <span className="font-bold text-coffee-900">{b.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-charcoal/40 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── STEP: Date & Time ────────────────────────────────────────── */}
          {step === 'datetime' && selectedBranch && (
            <motion.div
              key="datetime"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2">
                {branches.length > 1 && (
                  <button onClick={() => setStep('branch')} className="text-charcoal/40 hover:text-coffee-700 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div>
                  <h1 className="text-xl font-extrabold text-coffee-900">Pilih Tanggal &amp; Jam</h1>
                  <p className="text-sm text-charcoal/60 mt-0.5">{selectedBranch.name}</p>
                </div>
              </div>

              {/* Date picker */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-2">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Tanggal Reservasi
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  min={todayJakarta}
                  max={maxDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                  className="w-full px-4 py-3 rounded-2xl bg-white border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                />
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    Jam Mulai ({selectedBranch.reservation_open_time}–{selectedBranch.reservation_close_time} WIB)
                  </label>
                  {filteredSlots.length === 0 ? (
                    <p className="text-sm text-charcoal/50 text-center py-4">
                      Tidak ada slot tersedia di tanggal ini. Pilih tanggal lain.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {filteredSlots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedTime(slot)}
                          className={`py-2.5 rounded-xl text-sm font-semibold border transition-all active:scale-95 ${
                            selectedTime === slot
                              ? 'bg-coffee-700 text-cream border-coffee-700 shadow-soft'
                              : 'bg-white text-charcoal/80 border-coffee-100 hover:border-coffee-300'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                disabled={!selectedDate || !selectedTime}
                onClick={() => setStep('table')}
                className="w-full py-3.5 rounded-2xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
              >
                Lihat Meja Tersedia
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* ── STEP: Table ───────────────────────────────────────────────── */}
          {step === 'table' && selectedBranch && (
            <motion.div
              key="table"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2">
                <button onClick={() => setStep('datetime')} className="text-charcoal/40 hover:text-coffee-700 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-extrabold text-coffee-900">Pilih Meja</h1>
                  <p className="text-sm text-charcoal/60 mt-0.5">
                    {selectedDate} · {selectedTime} WIB
                  </p>
                </div>
              </div>

              {loadingTables ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-coffee-400" />
                </div>
              ) : tables.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <TableIcon className="w-10 h-10 text-charcoal/30 mx-auto" />
                  <p className="text-sm text-charcoal/50">Semua meja sudah dipesan di waktu ini.</p>
                  <button
                    onClick={() => setStep('datetime')}
                    className="text-sm text-coffee-600 font-semibold underline underline-offset-2"
                  >
                    Pilih waktu lain
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {tables.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTable(t)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.99] text-left ${
                        selectedTable?.id === t.id
                          ? 'bg-coffee-50 border-coffee-400 shadow-soft'
                          : 'bg-white border-coffee-100 hover:border-coffee-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          selectedTable?.id === t.id ? 'bg-coffee-700' : 'bg-coffee-50'
                        }`}>
                          <TableIcon className={`w-4 h-4 ${selectedTable?.id === t.id ? 'text-cream' : 'text-coffee-600'}`} />
                        </div>
                        <div>
                          <p className="font-bold text-coffee-900 text-sm">Meja {t.code}</p>
                          {t.label && <p className="text-xs text-charcoal/50">{t.label}</p>}
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-charcoal/50 flex-shrink-0">
                        <Users className="w-3.5 h-3.5" />
                        {t.seats} kursi
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {tables.length > 0 && (
                <button
                  disabled={!selectedTable}
                  onClick={() => setStep('details')}
                  className="w-full py-3.5 rounded-2xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  Lanjut Isi Data
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          )}

          {/* ── STEP: Details ─────────────────────────────────────────────── */}
          {step === 'details' && selectedBranch && selectedTable && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2">
                <button onClick={() => setStep('table')} className="text-charcoal/40 hover:text-coffee-700 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-extrabold text-coffee-900">Data Diri</h1>
                  <p className="text-sm text-charcoal/60 mt-0.5">
                    Meja {selectedTable.code} · {selectedDate} · {selectedTime} WIB
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-1.5">
                    <User className="w-3.5 h-3.5" />
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    Nomor WhatsApp / Telepon <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    minLength={5}
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>

                {/* Email (optional) */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Email (opsional)
                  </label>
                  <input
                    type="email"
                    maxLength={120}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  />
                </div>

                {/* Party size */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Jumlah Tamu <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors"
                  >
                    {Array.from({ length: Math.min(selectedTable.seats, 20) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} orang</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-coffee-900 mb-1.5">
                    <StickyNote className="w-3.5 h-3.5" />
                    Catatan (opsional)
                  </label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: Ada yang alergi kacang, ulang tahun, dll."
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-coffee-100 text-charcoal text-sm focus:outline-none focus:border-coffee-400 transition-colors resize-none"
                  />
                </div>

                {/* Preorder notice */}
                {(selectedBranch.reservation_min_preorder ?? 0) > 0 && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
                    <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900">
                      <p className="font-semibold">Diperlukan Pembayaran di Muka</p>
                      <p className="text-xs mt-0.5 text-amber-800">
                        Reservasi ini memerlukan pre-order minimal Rp{' '}
                        {new Intl.NumberFormat('id-ID').format(selectedBranch.reservation_min_preorder)}.
                        Anda akan mendapatkan instruksi pembayaran setelah submit.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-coffee-700 text-cream font-bold text-sm hover:bg-coffee-800 transition-colors active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span>Mengirim...</span></>
                  ) : (
                    'Pesan Sekarang'
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* ── STEP: Success ─────────────────────────────────────────────── */}
          {step === 'success' && result && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="flex flex-col items-center gap-3 pt-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-coffee-900">Reservasi Terkirim!</h1>
                  <p className="text-sm text-charcoal/60 mt-1">
                    {result.status === 'pending_payment'
                      ? 'Selesaikan pembayaran untuk mengkonfirmasi reservasi Anda.'
                      : 'Reservasi Anda sedang menunggu konfirmasi dari staf kami.'}
                  </p>
                </div>
              </div>

              {/* Code card */}
              <div className="bg-white rounded-3xl border border-coffee-100 shadow-soft-lg p-6 space-y-4">
                <p className="text-xs font-bold text-charcoal/50 uppercase tracking-widest">Kode Reservasi Anda</p>
                <div className="font-mono text-4xl font-extrabold tracking-[0.2em] text-coffee-900 bg-coffee-50 rounded-2xl py-4">
                  {result.code}
                </div>
                <p className="text-xs text-charcoal/50">
                  Tunjukkan kode ini kepada staf saat tiba untuk mengklaim meja Anda.
                </p>

                <div className="pt-3 border-t border-coffee-100 space-y-2 text-left">
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal/50">Waktu Mulai</span>
                    <span className="font-semibold text-coffee-900">{formatDateTime(result.starts_at)}</span>
                  </div>
                  {result.hold_expires_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-charcoal/50">Batas Bayar</span>
                      <span className="font-semibold text-amber-700">{formatDateTime(result.hold_expires_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status instructions */}
              {result.status === 'pending_payment' && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left">
                  <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">Langkah Selanjutnya</p>
                    <p className="text-xs text-amber-800 mt-1">
                      Hubungi kami atau tunjukkan kode di atas ke staf untuk menyelesaikan pre-payment QRIS.
                      Slot Anda akan ditahan sampai{' '}
                      {result.hold_expires_at ? formatHHMM(result.hold_expires_at) : '—'} WIB.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setStep('branch');
                  setSelectedBranch(branches.length === 1 ? branches[0] : null);
                  if (branches.length === 1) setStep('datetime');
                  setSelectedDate('');
                  setSelectedTime('');
                  setSelectedTable(null);
                  setName(''); setPhone(''); setEmail('');
                  setPartySize('2'); setNotes('');
                  setResult(null);
                }}
                className="w-full py-3 rounded-2xl border border-coffee-200 text-coffee-700 font-semibold text-sm hover:bg-coffee-50 transition-colors"
              >
                Buat Reservasi Lain
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
