'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import {
  X,
  Camera,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { useBrand } from '@/components/providers/BrandProvider';

export function extractTableCode(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // Check URL query params (?table=..., ?meja=..., ?t=...)
  try {
    const url = new URL(trimmed, 'https://kopi-nako.local');
    const tableParam =
      url.searchParams.get('table') ||
      url.searchParams.get('meja') ||
      url.searchParams.get('t');
    if (tableParam && tableParam.trim()) {
      return tableParam.trim().toUpperCase();
    }

    // Path pattern like /menus/A-1 or /menu/A-1
    const pathMatch = url.pathname.match(/\/(?:menu|menus)\/([a-z0-9-]+)$/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1].trim().toUpperCase();
    }
  } catch {
    // Continue with regex fallback
  }

  // Regex check for ?table=XYZ or &table=XYZ or table=XYZ or meja=XYZ
  const matchParam = trimmed.match(/(?:[?&]|^)(?:table|meja|t)=([^&#]+)/i);
  if (matchParam && matchParam[1]) {
    return decodeURIComponent(matchParam[1]).trim().toUpperCase();
  }

  // Regex check for "MEJA A-12" or "A-12"
  const matchTable = trimmed.match(/^(?:meja|table)?\s*([a-z0-9]+-[0-9]+)$/i);
  if (matchTable && matchTable[1]) {
    return matchTable[1].trim().toUpperCase();
  }

  // If simple code like A1, A-12, etc.
  if (/^[a-z0-9-]{1,10}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
}

/**
 * Extracts both the table code and the branch ID from a scanned QR URL.
 * Returns { table, branchId } — branchId may be null for legacy/plain QR codes.
 */
export function extractTableAndBranch(raw: string): { table: string; branchId: string | null } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  try {
    const url = new URL(trimmed, 'https://kopi-nako.local');
    const tableParam =
      url.searchParams.get('table') ||
      url.searchParams.get('meja') ||
      url.searchParams.get('t');
    const branchParam =
      url.searchParams.get('branch') ||
      url.searchParams.get('branchId') ||
      url.searchParams.get('cabang');

    if (tableParam && tableParam.trim()) {
      return {
        table: tableParam.trim().toUpperCase(),
        branchId: branchParam?.trim() || null,
      };
    }

    // Path pattern like /menus/A-1 or /menu/A-1
    const pathMatch = url.pathname.match(/\/(?:menu|menus)\/([a-z0-9-]+)$/i);
    if (pathMatch && pathMatch[1]) {
      return {
        table: pathMatch[1].trim().toUpperCase(),
        branchId: branchParam?.trim() || null,
      };
    }
  } catch {
    // Fall through to regex
  }

  // Regex fallback — no branch info available from plain codes
  const table = extractTableCode(raw);
  return table ? { table, branchId: null } : null;
}

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (tableNumber: string, branchId: string | null) => void;
  title?: string;
  subtitle?: string;
  currentTable?: string | null;
}

export default function QrScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  title,
  subtitle,
  currentTable,
}: QrScannerModalProps) {
  const { brandName } = useBrand();
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedTable, setScannedTable] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          await scannerInstanceRef.current.stop();
        }
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      try {
        scannerInstanceRef.current.clear();
      } catch (err) {
        console.warn('Error clearing scanner container:', err);
      }
      scannerInstanceRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const handleScanResult = useCallback(
    async (decodedText: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      const result = extractTableAndBranch(decodedText);
      if (result) {
        // Haptic feedback if supported
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(100);
          } catch {}
        }

        setScannedTable(result.table);
        await stopScanner();

        // Brief celebration delay so user sees confirmation
        setTimeout(() => {
          onScanSuccess(result.table, result.branchId);
          onClose();
          setIsProcessing(false);
          setScannedTable(null);
        }, 1200);
      } else {
        setErrorMsg(`QR code terdeteksi, namun bukan kode meja ${brandName} yang valid.`);
        setIsProcessing(false);
      }
    },
    [isProcessing, onScanSuccess, onClose, stopScanner, brandName],
  );

  const startScanner = useCallback(async () => {
    setErrorMsg(null);
    setScannedTable(null);
    setIsProcessing(false);

    try {
      await stopScanner();

      // Ensure DOM element is present
      const container = document.getElementById('nako-qr-reader');
      if (!container) return;

      const html5QrCode = new Html5Qrcode('nako-qr-reader');
      scannerInstanceRef.current = html5QrCode;

      const config: Html5QrcodeCameraScanConfig = {
        fps: 12,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {
          // Frame without QR - ignore
        },
      );

      setCameraActive(true);
    } catch (err: any) {
      console.error('Camera scan error:', err);
      let message = 'Tidak dapat mengakses kamera ponsel.';
      if (err?.name === 'NotAllowedError' || err?.toString()?.includes('NotAllowedError')) {
        message = 'Izin kamera ditolak. Berikan izin akses kamera di pengaturan browser kamu.';
      } else if (err?.name === 'NotFoundError' || err?.toString()?.includes('NotFoundError')) {
        message = 'Kamera tidak ditemukan di perangkat ini.';
      }
      setErrorMsg(message);
      setCameraActive(false);
    }
  }, [handleScanResult, stopScanner]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      await stopScanner();
      const html5QrCode = new Html5Qrcode('nako-qr-reader');
      scannerInstanceRef.current = html5QrCode;

      const result = await html5QrCode.scanFile(file, true);
      handleScanResult(result);
    } catch (err) {
      console.error('File scan error:', err);
      setErrorMsg('Tidak dapat mendeteksi QR code dari gambar tersebut. Coba gunakan kamera langsung.');
      setIsProcessing(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Small timeout to allow modal animation to finish before initializing video
      const timer = setTimeout(() => {
        startScanner();
      }, 250);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
      setErrorMsg(null);
      setScannedTable(null);
    }
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
          className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-soft-xl border border-coffee-100 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-coffee-100/70 bg-cream/60">
            <div className="flex items-center gap-2 text-coffee-900">
              <div className="w-8 h-8 rounded-xl bg-coffee-700 text-cream flex items-center justify-center shadow-soft">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-coffee-900">
                  {title || (currentTable ? 'Scan QR Meja Baru' : 'Scan QR Code Meja')}
                </h3>
                <p className="text-[11px] text-charcoal/50">
                  {subtitle ||
                    (currentTable
                      ? `Saat ini Meja ${currentTable} · Arahkan ke stiker QR meja baru`
                      : 'Arahkan kamera ke stiker QR di meja')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-coffee-50 hover:bg-coffee-100 text-charcoal/60 hover:text-charcoal flex items-center justify-center transition-colors"
              aria-label="Tutup scanner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scanner Viewport */}
          <div className="relative bg-black flex items-center justify-center overflow-hidden min-h-[300px] sm:min-h-[340px]">
            {/* Target reader container */}
            <div
              id="nako-qr-reader"
              className="w-full h-full overflow-hidden [&>video]:object-cover [&>video]:w-full [&>video]:h-full"
            />

            {/* Viewfinder overlay when camera active and not scanned */}
            {cameraActive && !scannedTable && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* Darkened vignette around box */}
                <div className="relative w-64 h-64 border-2 border-dashed border-sand-300/60 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex items-center justify-center">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-sand-400 rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-sand-400 rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-sand-400 rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-sand-400 rounded-br-xl" />

                  {/* Animated laser scan bar */}
                  <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-sand-300 to-transparent shadow-[0_0_8px_#f4ebd9] animate-pulse" />
                </div>
              </div>
            )}

            {/* Success state */}
            {scannedTable && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-coffee-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-cream z-20"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 mb-3 animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sand-300 mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {currentTable && currentTable !== scannedTable
                      ? 'Pindah Meja Berhasil!'
                      : 'QR Berhasil Terverifikasi'}
                  </span>
                </div>
                {currentTable && currentTable !== scannedTable ? (
                  <div className="flex items-center justify-center gap-2 text-xl sm:text-2xl font-black tracking-tight text-cream mt-1">
                    <span className="text-sand-300/80 line-through text-lg">Meja {currentTable}</span>
                    <span>➔</span>
                    <span className="text-emerald-300">Meja {scannedTable}</span>
                  </div>
                ) : (
                  <h4 className="text-2xl font-black tracking-tight text-cream">
                    Meja {scannedTable}
                  </h4>
                )}
                <p className="text-xs text-cream/70 mt-2">
                  {currentTable && currentTable !== scannedTable
                    ? 'Memperbarui meja untuk pesananmu...'
                    : 'Menghubungkan meja ke pesananmu...'}
                </p>
              </motion.div>
            )}

            {/* Error or permission denied state */}
            {errorMsg && !scannedTable && (
              <div className="absolute inset-0 bg-charcoal/90 flex flex-col items-center justify-center p-6 text-center text-cream z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <p className="text-xs sm:text-sm text-cream/90 max-w-xs leading-relaxed">
                  {errorMsg}
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={startScanner}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Coba Lagi
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-bold transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Foto QR
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-4 bg-cream/40 border-t border-coffee-100 flex items-center justify-between gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-coffee-200/70 text-coffee-800 text-xs font-semibold hover:bg-coffee-50 transition-colors shadow-soft"
            >
              <Upload className="w-3.5 h-3.5 text-coffee-600" />
              <span>Unggah Gambar QR</span>
            </button>

            <button
              type="button"
              onClick={startScanner}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-colors active:scale-95 shadow-soft ml-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restart Kamera</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
