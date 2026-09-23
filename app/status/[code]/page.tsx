'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Coffee,
  XCircle,
  RefreshCw,
  Receipt,
  QrCode,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import QrScannerModal from '@/components/ui/QrScannerModal';

type OrderItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
};

type Order = {
  id: string;
  order_code: string;
  customer_name: string;
  table_number: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'qris';
  notes: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
};

const STEPS: { key: Order['status']; label: string; desc: string }[] = [
  { key: 'pending', label: 'Diterima', desc: 'Pesanan kamu sudah kami terima' },
  { key: 'preparing', label: 'Disiapkan', desc: 'Barista sedang membuat pesananmu' },
  { key: 'ready', label: 'Siap Diantar', desc: 'Pesanan siap dan akan segera diantar' },
  { key: 'completed', label: 'Selesai', desc: 'Selamat menikmati!' },
];

const POLL_INTERVAL = 6000;

function formatPrice(price: number): string {
  return 'Rp ' + price.toLocaleString('id-ID') + ',-';
}

export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || '').toUpperCase();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const isFirstLoad = useRef(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isUpdatingTable, setIsUpdatingTable] = useState(false);
  const [tableUpdateNotice, setTableUpdateNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleTableScan = useCallback(
    async (scannedTable: string) => {
      if (!order) return;
      if (scannedTable === order.table_number) {
        setTableUpdateNotice({
          type: 'success',
          message: `Kamu sudah berada di Meja ${scannedTable}.`,
        });
        return;
      }

      setIsUpdatingTable(true);
      try {
        const res = await fetch('/api/orders/update-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_code: order.order_code,
            new_table: scannedTable,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          setTableUpdateNotice({
            type: 'error',
            message: data.error || 'Gagal memindahkan meja. Silakan coba lagi atau beritahu barista.',
          });
          return;
        }

        // Update state
        setOrder((prev) => (prev ? { ...prev, table_number: scannedTable } : null));

        // Update localStorage
        try {
          localStorage.setItem('kopi-nako-table', scannedTable);
          const stored = localStorage.getItem('kopi-nako-order-' + order.order_code);
          if (stored) {
            const parsed = JSON.parse(stored);
            parsed.table_number = scannedTable;
            localStorage.setItem('kopi-nako-order-' + order.order_code, JSON.stringify(parsed));
          }
          const lastOrder = localStorage.getItem('kopi-nako-last-order');
          if (lastOrder) {
            const parsed = JSON.parse(lastOrder);
            if (parsed?.order_code === order.order_code) {
              parsed.table_number = scannedTable;
              localStorage.setItem('kopi-nako-last-order', JSON.stringify(parsed));
            }
          }
        } catch {}

        setTableUpdateNotice({
          type: 'success',
          message: `Nomor meja pesanan berhasil dipindahkan ke Meja ${scannedTable}! Barista akan mengantar ke meja barumu.`,
        });
      } catch {
        setTableUpdateNotice({
          type: 'error',
          message: 'Koneksi bermasalah saat memindahkan meja. Silakan coba lagi.',
        });
      } finally {
        setIsUpdatingTable(false);
      }
    },
    [order],
  );

  const getLocalOrder = useCallback((): Order | null => {
    try {
      const stored =
        localStorage.getItem('kopi-nako-order-' + code) ||
        localStorage.getItem('kopi-nako-last-order');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.order_code === code || !code)) {
          return parsed as Order;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
    return null;
  }, [code]);

  const fetchOrder = useCallback(async () => {
    if (!code) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      // 1. Direct query against Supabase orders table
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_code', code)
        .maybeSingle();

      if (data && !error) {
        setOrder(data as Order);
        setNotFound(false);
        setLastChecked(new Date());
        setLoading(false);
        isFirstLoad.current = false;
        return;
      }

      // 2. Fallback to server lookup API
      const res = await fetch(`/api/orders/lookup?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const json = await res.json();
        if (json?.order) {
          setOrder(json.order as Order);
          setNotFound(false);
          setLastChecked(new Date());
          setLoading(false);
          isFirstLoad.current = false;
          return;
        }
      }

      // 3. Fallback to localStorage snapshot
      const local = getLocalOrder();
      if (local) {
        setOrder(local);
        setNotFound(false);
      } else if (isFirstLoad.current) {
        setNotFound(true);
      }
    } catch {
      const local = getLocalOrder();
      if (local) {
        setOrder(local);
        setNotFound(false);
      } else if (isFirstLoad.current) {
        setNotFound(true);
      }
    }

    setLastChecked(new Date());
    setLoading(false);
    isFirstLoad.current = false;
  }, [code, getLocalOrder]);

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  const stepIndex = order ? STEPS.findIndex((s) => s.key === order.status) : -1;

  if (loading) {
    return <div className="min-h-screen bg-cream" />;
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-coffee-300" />
          </div>
          <p className="text-charcoal/60 font-medium">Pesanan tidak ditemukan</p>
          <p className="text-charcoal/40 text-sm mt-1">
            Periksa kembali kode pesanan: <span className="font-semibold">{code}</span>
          </p>
          <button
            onClick={() => router.push('/menu')}
            className="mt-5 px-5 py-3 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Kembali ke Menu
          </button>
        </div>
      </div>
    );
  }

  if (order.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100 shadow-soft-lg p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-9 h-9 text-red-500" />
          </div>
          <h1 className="text-xl font-extrabold text-coffee-900">Pesanan Dibatalkan</h1>
          <p className="mt-2 text-charcoal/60 text-sm">
            Pesanan {order.order_code} telah dibatalkan. Hubungi kasir untuk informasi lebih lanjut.
          </p>
          <button
            onClick={() => router.push('/menu')}
            className="mt-6 w-full py-3.5 rounded-xl bg-coffee-700 text-cream font-bold hover:bg-coffee-800 transition-colors active:scale-95"
          >
            Kembali ke Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-12">
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
            <h1 className="font-bold text-coffee-900">Status Pesanan</h1>
            <button
              onClick={() => router.push('/orders')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-coffee-50 border border-coffee-200/70 text-coffee-800 text-xs font-semibold hover:bg-coffee-100/70 transition-colors"
              title="Semua Riwayat Pesanan"
            >
              <Receipt className="w-3.5 h-3.5 text-coffee-700" />
              <span className="hidden sm:inline">Riwayat</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Order header card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-coffee-100/80 p-5 text-center shadow-soft"
        >
          <div className="w-14 h-14 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-3">
            <Coffee className="w-7 h-7 text-coffee-700" />
          </div>
          <p className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide">
            Kode Pesanan
          </p>
          <p className="text-2xl font-extrabold text-coffee-900 mt-0.5">{order.order_code}</p>
          <p className="text-sm text-charcoal/60 mt-1 font-medium">
            Pemesan: <strong>{order.customer_name}</strong>
          </p>

          {/* Table display & re-scan action */}
          <div className="mt-3.5 flex items-center justify-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-coffee-50 text-coffee-900 text-xs font-bold border border-coffee-200/70">
              <QrCode className="w-3.5 h-3.5 text-coffee-600" />
              <span>Meja {order.table_number}</span>
            </div>

            {(order.status === 'pending' || order.status === 'preparing') && (
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                disabled={isUpdatingTable}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200/80 transition-colors active:scale-95 disabled:opacity-50 shadow-2xs"
                title="Pindah meja dan scan stiker QR di meja baru"
              >
                {isUpdatingTable ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                )}
                <span>Pindah Meja? Scan QR Baru</span>
              </button>
            )}
          </div>

          <AnimatePresence>
            {tableUpdateNotice && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className={`mt-3 p-3 rounded-xl text-xs flex items-center justify-between gap-2 text-left ${
                  tableUpdateNotice.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {tableUpdateNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  )}
                  <span>{tableUpdateNotice.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTableUpdateNotice(null)}
                  className="text-charcoal/40 hover:text-charcoal p-1 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Status stepper */}
        <div className="bg-white rounded-2xl border border-coffee-100/80 p-5">
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              const isLast = i === STEPS.length - 1;
              return (
                <div key={step.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                        done
                          ? 'bg-coffee-700 text-cream'
                          : active
                            ? 'bg-coffee-700 text-cream'
                            : 'bg-coffee-50 text-coffee-200'
                      }`}
                    >
                      {done ? (
                        <Check className="w-5 h-5" />
                      ) : active ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cream opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cream" />
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-coffee-200" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 flex-1 min-h-[2.5rem] transition-colors ${
                          done ? 'bg-coffee-700' : 'bg-coffee-100'
                        }`}
                      />
                    )}
                  </div>
                  <div className={isLast ? 'pb-0' : 'pb-6'}>
                    <p
                      className={`font-bold text-sm ${
                        done || active ? 'text-coffee-900' : 'text-charcoal/30'
                      }`}
                    >
                      {step.label}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        done || active ? 'text-charcoal/50' : 'text-charcoal/25'
                      }`}
                    >
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-2 text-charcoal/30 text-xs">
            <RefreshCw className="w-3 h-3" />
            <span>
              Diperbarui otomatis
              {lastChecked && ` · ${lastChecked.toLocaleTimeString('id-ID').slice(0, 5)}`}
            </span>
          </div>
        </div>

        {/* Order items */}
        <div>
          <h2 className="text-sm font-bold text-coffee-900 uppercase tracking-wide mb-3">
            Detail Pesanan
          </h2>
          <div className="bg-white rounded-2xl border border-coffee-100/80 divide-y divide-coffee-100/60 overflow-hidden">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-coffee-50 flex-shrink-0">
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
                  <p className="text-charcoal/40 text-xs">Qty {item.quantity}</p>
                </div>
                <span className="text-coffee-700 font-bold text-sm">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
            {order.notes && (
              <div className="p-4 bg-coffee-50/50">
                <p className="text-xs font-semibold text-charcoal/40 mb-1">Catatan</p>
                <p className="text-sm text-charcoal/60">{order.notes}</p>
              </div>
            )}
            <div className="p-4 flex items-center justify-between">
              <span className="text-charcoal/50 text-sm">
                Total &middot; {order.payment_method === 'cash' ? 'Tunai di Kasir' : 'QRIS'}
              </span>
              <span className="text-lg font-extrabold text-coffee-800">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* In-website live camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={(scanned) => handleTableScan(scanned)}
        currentTable={order.table_number}
        title="Pindah Meja Pesanan"
        subtitle={`Pesanan saat ini di Meja ${order.table_number}. Arahkan kamera ke stiker QR meja baru.`}
      />
    </div>
  );
}
