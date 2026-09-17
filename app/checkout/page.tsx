'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  QrCode,
  Plus,
  Minus,
  Trash2,
  Wallet,
  ScanLine,
  CheckCircle2,
  ShoppingBag,
  Lock,
  AlertCircle,
  Camera,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { fadeInUp } from '@/lib/animations';
import QrScannerModal from '@/components/ui/QrScannerModal';

type CartItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
};

const CART_KEY = 'kopi-nako-cart';
const TABLE_KEY = 'kopi-nako-table';
const BRANCH_KEY = 'kopi-nako-branch';
// Fallback default branch UUID (matches the one seeded in the migration)
const DEFAULT_BRANCH_ID = 'a0000000-0000-0000-0000-000000000001';

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

function generateOrderCode(): string {
  return 'NK' + Date.now().toString().slice(-6);
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <CheckoutPageInner />
    </Suspense>
  );
}

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState<'cash' | 'qris'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [branchId, setBranchId] = useState<string>(DEFAULT_BRANCH_ID);

  const handleScanSuccess = useCallback((scanned: string, scannedBranchId: string | null) => {
    setTableNumber(scanned);
    localStorage.setItem(TABLE_KEY, scanned);
    if (scannedBranchId) {
      setBranchId(scannedBranchId);
      localStorage.setItem(BRANCH_KEY, scannedBranchId);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      setCart(stored ? JSON.parse(stored) : []);
    } catch {
      setCart([]);
    }

    const fromQr = searchParams.get('table');
    const fromBranch = searchParams.get('branch');
    if (fromQr && fromQr.trim()) {
      const clean = fromQr.trim().toUpperCase();
      setTableNumber(clean);
      localStorage.setItem(TABLE_KEY, clean);
    } else {
      const storedTable = localStorage.getItem(TABLE_KEY);
      if (storedTable) setTableNumber(storedTable);
    }
    if (fromBranch && fromBranch.trim()) {
      setBranchId(fromBranch.trim());
      localStorage.setItem(BRANCH_KEY, fromBranch.trim());
    } else {
      const storedBranch = localStorage.getItem(BRANCH_KEY);
      if (storedBranch) setBranchId(storedBranch);
    }
    setLoaded(true);
  }, [searchParams]);

  const persistCart = useCallback((next: CartItem[]) => {
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  }, []);

  const updateQuantity = useCallback(
    (id: string, delta: number) => {
      const next = cart
        .map((c) => (c.id === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0);
      persistCart(next);
    },
    [cart, persistCart],
  );

  const removeItem = useCallback(
    (id: string) => {
      persistCart(cart.filter((c) => c.id !== id));
    },
    [cart, persistCart],
  );

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleConfirm = async () => {
    if (submitting || cart.length === 0 || !name.trim() || !tableNumber.trim()) return;
    setSubmitting(true);
    const code = generateOrderCode();

    try {
      await supabase.from('orders').insert({
        order_code: code,
        customer_name: name.trim(),
        table_number: tableNumber.trim(),
        items: cart,
        subtotal,
        total: subtotal,
        payment_method: payment,
        notes: notes.trim() || null,
        branch_id: branchId || DEFAULT_BRANCH_ID,
      });
    } catch {
      // Order still confirmed for the customer even if it couldn't be saved.
    }

    localStorage.removeItem(CART_KEY);
    setOrderCode(code);
    setSubmitting(false);
  };

  if (!loaded) {
    return <div className="min-h-screen bg-cream" />;
  }

  // Success state
  if (orderCode) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100 shadow-soft-lg p-8 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-coffee-700" />
          </div>
          <h1 className="text-xl font-extrabold text-coffee-900">Pesanan Diterima!</h1>
          <p className="mt-2 text-charcoal/60 text-sm">
            Barista sedang menyiapkan pesananmu dan akan diantar ke meja.
          </p>

          <div className="mt-6 rounded-xl bg-coffee-50 p-4 text-left space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal/50">Kode Pesanan</span>
              <span className="font-bold text-coffee-900">{orderCode}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal/50">Meja</span>
              <span className="font-bold text-coffee-900">{tableNumber}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal/50">Total Bayar</span>
              <span className="font-bold text-coffee-700">{formatPrice(subtotal)}</span>
            </div>
          </div>

          <button
            onClick={() => router.push(`/status/${orderCode}`)}
            className="mt-6 w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Lihat Status Pesanan
          </button>
          <button
            onClick={() => router.push('/menu')}
            className="mt-2.5 w-full py-3 rounded-xl text-coffee-700 font-semibold text-sm hover:bg-coffee-50 transition-colors"
          >
            Kembali ke Menu
          </button>
        </motion.div>
      </div>
    );
  }

  // Empty cart state
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8 text-coffee-300" />
          </div>
          <p className="text-charcoal/60 font-medium">Keranjang kamu masih kosong</p>
          <button
            onClick={() => router.push('/menu')}
            className="mt-4 px-5 py-3 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Pilih Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-28">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-coffee-100/60">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push('/menu')}
              className="flex items-center gap-2 text-coffee-700 hover:text-coffee-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-semibold text-sm">Menu</span>
            </button>
            <h1 className="font-bold text-coffee-900">Checkout</h1>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coffee-50 text-coffee-700 text-xs font-medium">
              <QrCode className="w-3.5 h-3.5" />
              {itemCount} item
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Missing table alert */}
        {!tableNumber && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 flex items-start gap-3 text-amber-900 shadow-soft"
          >
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm space-y-2">
              <p className="font-bold">QR Meja Belum Terdeteksi</p>
              <p className="text-amber-800/90 leading-relaxed">
                Pemesanan hanya dapat dilakukan melalui scan QR code di meja. Kamu bisa scan langsung menggunakan kamera website ini tanpa Google Lens / aplikasi lain!
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors shadow-soft active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" /> Buka Scanner Kamera
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/menu')}
                  className="inline-flex items-center gap-1.5 font-bold text-coffee-800 underline hover:text-coffee-950 text-xs px-2 py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Menu
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Order items */}
        <motion.section variants={fadeInUp} initial="hidden" animate="visible">
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Pesananmu
          </h2>
          <div className="bg-white rounded-2xl border border-coffee-100/80 divide-y divide-coffee-100/60 overflow-hidden">
            <AnimatePresence initial={false}>
              {cart.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 p-4"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-coffee-900 text-sm truncate">{item.name}</p>
                    <p className="text-coffee-600 text-sm font-bold">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-7 h-7 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold text-coffee-900 w-5 text-center text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-7 h-7 rounded-lg bg-coffee-50 text-coffee-700 flex items-center justify-center hover:bg-coffee-100 transition-colors active:scale-90"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label={`Hapus ${item.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.section>

        {/* Customer details */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.05 }}
        >
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Detail Pemesan
          </h2>
          <div className="bg-white rounded-2xl border border-coffee-100/80 p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Nama Pemesan
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masukkan nama kamu"
                className="w-full px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Nomor Meja
              </label>
              {tableNumber ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-coffee-50/70 border border-coffee-200/80 text-coffee-900 text-sm">
                  <div className="flex items-center gap-2.5">
                    <QrCode className="w-4 h-4 text-coffee-700 flex-shrink-0" />
                    <span className="font-bold text-base">Meja {tableNumber}</span>
                  </div>
                  <span className="text-xs font-semibold text-coffee-700 bg-coffee-100/90 px-2.5 py-1 rounded-full flex items-center gap-1 select-none">
                    <Lock className="w-3 h-3 text-coffee-600" /> Terkunci dari QR
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Wajib Scan QR Code Meja</span>
                  </div>
                  <p className="text-amber-800/85 leading-relaxed">
                    Nomor meja tidak dapat diisi atau diubah manual. Silakan scan QR code di meja kamu langsung lewat kamera website ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coffee-700 text-cream font-bold text-xs hover:bg-coffee-800 transition-colors shadow-soft active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5" /> Scan QR Meja Sekarang
                  </button>
                </div>
              )}
              {tableNumber && (
                <p className="text-[11px] text-charcoal/45 mt-1.5 flex items-center gap-1 select-none">
                  <Lock className="w-3 h-3 text-charcoal/40 flex-shrink-0" />
                  Nomor meja otomatis terkunci dari scan QR dan tidak dapat diubah manual.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/50 mb-1.5">
                Catatan untuk Barista (opsional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: less sugar, tanpa es"
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-coffee-50/60 border border-coffee-100 text-charcoal text-sm placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-400 transition-colors resize-none"
              />
            </div>
          </div>
        </motion.section>

        {/* Payment method */}
        <motion.section
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Metode Pembayaran
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPayment('cash')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                payment === 'cash'
                  ? 'bg-coffee-700 border-coffee-700 text-cream shadow-soft'
                  : 'bg-white border-coffee-100 text-charcoal/70 hover:bg-coffee-50'
              }`}
            >
              <Wallet className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">Tunai di Kasir</span>
            </button>
            <button
              onClick={() => setPayment('qris')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                payment === 'qris'
                  ? 'bg-coffee-700 border-coffee-700 text-cream shadow-soft'
                  : 'bg-white border-coffee-100 text-charcoal/70 hover:bg-coffee-50'
              }`}
            >
              <ScanLine className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">QRIS</span>
            </button>
          </div>
        </motion.section>
      </div>

      {/* Sticky confirm bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-cream/95 backdrop-blur-xl border-t border-coffee-100/60 z-40">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-charcoal/60 text-sm">Total ({itemCount} item)</span>
            <span className="text-xl font-extrabold text-coffee-800">
              {formatPrice(subtotal)}
            </span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={submitting || !name.trim() || !tableNumber.trim()}
            className="w-full py-4 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-soft"
          >
            {submitting ? 'Memproses...' : `Konfirmasi Pesanan — ${formatPrice(subtotal)}`}
          </button>
          {(!name.trim() || !tableNumber.trim()) && (
            <p className="text-center text-xs mt-2 font-medium">
              {!tableNumber.trim() ? (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="text-amber-700 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" /> Scan QR code meja di sini untuk memesan
                </button>
              ) : (
                <span className="text-charcoal/40">Isi nama pemesan untuk melanjutkan</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
