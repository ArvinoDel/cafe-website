'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Share2,
  Copy,
  Check,
  Printer,
  ChevronLeft,
  Clock,
  AlertCircle,
  Receipt,
  UtensilsCrossed,
} from 'lucide-react';
import { useBrand } from '@/components/providers/BrandProvider';
import { useBranchInfo } from '@/lib/branch-info';

type OrderItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  note?: string | null;
};

type Order = {
  id: string;
  order_code: string;
  customer_name: string;
  table_number: string;
  branch_id?: string | null;
  items: OrderItem[];
  subtotal: number;
  total: number;
  payment_method: 'cash' | 'qris';
  payment_status?: string | null;
  notes: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
};

function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const codeParam = typeof params.code === 'string' ? params.code : '';
  const { brandName } = useBrand();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Branch info for name and address
  const { info: branchInfo } = useBranchInfo(order?.branch_id ?? null);

  useEffect(() => {
    let isMounted = true;
    if (!codeParam) {
      setLoading(false);
      setError('Kode pesanan tidak ditemukan.');
      return;
    }

    async function loadOrder() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/orders/lookup?code=${encodeURIComponent(codeParam)}`);
        if (!res.ok) {
          if (res.status === 404) {
            if (isMounted) setError('Pesanan tidak ditemukan.');
            return;
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Gagal memuat pesanan.');
        }

        const data = await res.json();
        if (isMounted) {
          if (data.order) {
            setOrder(data.order);
          } else {
            setError('Pesanan tidak ditemukan.');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Gagal memuat bukti pesanan.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOrder();
    return () => {
      isMounted = false;
    };
  }, [codeParam]);

  const handleShare = async () => {
    if (!order) return;
    const shareTitle = `Bukti Pesanan #${order.order_code} - ${brandName}`;
    const shareText = `Bukti pesanan #${order.order_code} di ${branchInfo?.name || brandName}, Meja ${order.table_number}. Total: ${formatPrice(order.total)}`;
    const shareUrl = window.location.href;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or share failed, fallback to WhatsApp
      }
    }

    // Fallback: WhatsApp share
    const waText = encodeURIComponent(`${shareText}\n\nLihat struk pesanan: ${shareUrl}`);
    window.open(`https://wa.me/?text=${waText}`, '_blank');
  };

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-white border border-coffee-100 flex items-center justify-center shadow-soft mb-3 animate-pulse">
          <Receipt className="w-6 h-6 text-coffee-600 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-coffee-900">Menyiapkan bukti pesanan...</p>
      </div>
    );
  }

  // Not found or error
  if (error || !order) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100/90 shadow-soft-lg p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4 border border-red-100">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-lg font-extrabold text-coffee-900">Pesanan Tidak Ditemukan</h1>
          <p className="mt-2 text-xs sm:text-sm text-charcoal/60 leading-relaxed">
            {error || 'Periksa kembali kode pesanan atau scan ulang stiker QR di mejamu.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => router.push('/orders')}
              className="w-full py-3 rounded-xl bg-coffee-700 text-cream font-bold text-xs sm:text-sm hover:bg-coffee-800 transition-colors active:scale-95"
            >
              Lihat Riwayat Pesanan
            </button>
            <button
              onClick={() => router.push('/menu')}
              className="w-full py-2.5 rounded-xl bg-coffee-50 text-coffee-800 font-semibold text-xs sm:text-sm hover:bg-coffee-100 transition-colors"
            >
              Buka Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Guard: Only ready or completed orders can view receipt
  if (order.status !== 'ready' && order.status !== 'completed') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-coffee-100/90 shadow-soft-lg p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4 border border-amber-200/80">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-lg font-extrabold text-coffee-900">Pesanan Masih Diproses</h1>
          <p className="mt-2 text-xs sm:text-sm text-charcoal/60 leading-relaxed">
            Bukti pesanan dapat diakses setelah pesananmu siap atau selesai. Pantau terus progresnya di halaman status pesanan.
          </p>
          <div className="mt-6">
            <button
              onClick={() => router.push(`/status/${order.order_code}`)}
              className="w-full py-3 rounded-xl bg-coffee-700 text-cream font-bold text-xs sm:text-sm hover:bg-coffee-800 transition-colors active:scale-95 shadow-soft"
            >
              Kembali ke Status Pesanan
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isLunas = (order as { payment_status?: string }).payment_status === 'paid';
  const paymentLabel = order.payment_method === 'cash' ? 'Tunai di Kasir' : 'QRIS';

  return (
    <div className="min-h-screen bg-cream py-6 sm:py-10 px-4">
      {/* Print stylesheet override */}
      <style>{`
        @media print {
          body {
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .receipt-paper {
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 1.5rem !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      {/* Top back navigation (hidden on print) */}
      <div className="max-w-md mx-auto mb-4 no-print flex items-center justify-between">
        <Link
          href={`/status/${order.order_code}`}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-coffee-700 hover:text-coffee-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Status Pesanan</span>
        </Link>
        <span className="text-xs text-charcoal/40 font-mono">#{order.order_code}</span>
      </div>

      {/* Receipt Paper Card */}
      <div className="receipt-paper w-full max-w-md mx-auto bg-white rounded-3xl border border-coffee-100 shadow-soft-lg p-6 sm:p-8 text-charcoal">
        {/* Cafe / Branch Header */}
        <div className="text-center pb-4">
          <div className="w-10 h-10 rounded-xl bg-coffee-50 border border-coffee-100 flex items-center justify-center mx-auto mb-2.5">
            <UtensilsCrossed className="w-5 h-5 text-coffee-700" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-coffee-900">
            {branchInfo?.name || brandName}
          </h1>
          {branchInfo?.address && (
            <p className="text-xs text-charcoal/50 mt-1 max-w-xs mx-auto leading-relaxed">
              {branchInfo.address}
            </p>
          )}

          <div className="mt-3.5 inline-block px-3 py-1 rounded-full bg-coffee-50 border border-coffee-200/60 text-[11px] font-extrabold tracking-wider uppercase text-coffee-800">
            Bukti Pesanan
          </div>
          <p className="text-[10px] text-charcoal/40 mt-1">Bukan faktur pajak</p>
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-coffee-200 my-4" />

        {/* Order Metadata */}
        <div className="grid grid-cols-2 gap-y-2 text-xs">
          <div>
            <span className="text-charcoal/40 block">Waktu Pesan</span>
            <span className="font-semibold text-coffee-900">{formatDate(order.created_at)}</span>
          </div>
          <div className="text-right">
            <span className="text-charcoal/40 block">No. Pesanan</span>
            <span className="font-mono font-bold text-coffee-900">#{order.order_code}</span>
          </div>

          <div>
            <span className="text-charcoal/40 block">Pemesan</span>
            <span className="font-semibold text-coffee-900 truncate block">{order.customer_name}</span>
          </div>
          <div className="text-right">
            <span className="text-charcoal/40 block">Nomor Meja</span>
            <span className="font-bold text-coffee-900">Meja {order.table_number}</span>
          </div>

          <div>
            <span className="text-charcoal/40 block">Status</span>
            <span className="font-bold text-coffee-800">
              {order.status === 'ready' ? 'Siap Diambil' : 'Selesai'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-charcoal/40 block">Pembayaran</span>
            <span className="font-semibold text-coffee-900">{paymentLabel}</span>
          </div>
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-coffee-200 my-4" />

        {/* Item Lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-charcoal/40">
            <span>Menu</span>
            <span>Subtotal</span>
          </div>

          {order.items.map((item, idx) => (
            <div key={item.id ? `${item.id}-${idx}` : idx} className="flex items-start justify-between text-xs sm:text-sm gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-coffee-900">
                  <span>{item.quantity}x</span> {item.name}
                </p>
                {item.note && (
                  <p className="text-[11px] text-amber-900 bg-amber-50/70 border border-amber-200/50 rounded px-1.5 py-0.5 mt-0.5 inline-block font-medium">
                    Catatan: {item.note}
                  </p>
                )}
              </div>
              <span className="font-mono font-bold text-coffee-900 flex-shrink-0 text-right">
                {formatPrice(item.price * item.quantity)}
              </span>
            </div>
          ))}

          {order.notes && (
            <div className="pt-2 text-xs text-charcoal/50 italic border-t border-coffee-100/60">
              Catatan umum: &ldquo;{order.notes}&rdquo;
            </div>
          )}
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-coffee-200 my-4" />

        {/* Financial Summary */}
        <div className="space-y-1.5 text-xs sm:text-sm">
          <div className="flex items-center justify-between text-charcoal/60">
            <span>Subtotal</span>
            <span className="font-mono">{formatPrice(order.subtotal || order.total)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-extrabold text-coffee-900 pt-1">
            <span>Total Akhir</span>
            <span className="font-mono text-coffee-800">{formatPrice(order.total)}</span>
          </div>
        </div>

        {/* Optional LUNAS stamp (only if payment_status === 'paid') */}
        {isLunas && (
          <div className="mt-5 flex justify-center">
            <div className="inline-block px-4 py-1.5 rounded-lg border-2 border-emerald-600 text-emerald-700 font-black text-sm tracking-widest uppercase rotate-[-6deg] shadow-2xs">
              ✓ LUNAS
            </div>
          </div>
        )}

        {/* Receipt Footer Message */}
        <div className="text-center pt-6 mt-4 border-t border-coffee-100/60">
          <p className="text-xs font-bold text-coffee-900">Terima kasih atas pesananmu! 😊</p>
          <p className="text-[11px] text-charcoal/50 mt-0.5">
            Simpan bukti pesanan ini jika diperlukan saat konfirmasi pengambilan.
          </p>
        </div>
      </div>

      {/* Action Buttons (no-print) */}
      <div className="w-full max-w-md mx-auto mt-5 space-y-2.5 no-print">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white border border-coffee-200/90 text-coffee-900 font-bold text-xs sm:text-sm hover:bg-coffee-50 active:scale-95 transition-all shadow-2xs"
          >
            <Share2 className="w-4 h-4 text-coffee-600" />
            <span>Bagikan</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white border border-coffee-200/90 text-coffee-900 font-bold text-xs sm:text-sm hover:bg-coffee-50 active:scale-95 transition-all shadow-2xs"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-coffee-600" />
                <span>Salin Link</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-coffee-700 text-cream font-bold text-xs sm:text-sm hover:bg-coffee-800 active:scale-95 transition-all shadow-soft"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak / Simpan PDF</span>
        </button>
      </div>
    </div>
  );
}
