'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Coffee, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

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
    try {
      const { data, error } = await supabase
        .rpc('get_order_by_code', { p_code: code })
        .maybeSingle();

      if (data && !error) {
        setOrder(data as Order);
        setNotFound(false);
      } else {
        // Fallback to local storage order snapshot if Supabase table is not yet created
        const local = getLocalOrder();
        if (local) {
          setOrder(local);
          setNotFound(false);
        } else if (isFirstLoad.current) {
          setNotFound(true);
        }
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
            <div className="w-16" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Order header card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-coffee-100/80 p-5 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-coffee-50 flex items-center justify-center mx-auto mb-3">
            <Coffee className="w-7 h-7 text-coffee-700" />
          </div>
          <p className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide">
            Kode Pesanan
          </p>
          <p className="text-2xl font-extrabold text-coffee-900 mt-0.5">{order.order_code}</p>
          <p className="text-sm text-charcoal/50 mt-1">
            Meja {order.table_number} &middot; {order.customer_name}
          </p>
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
    </div>
  );
}
