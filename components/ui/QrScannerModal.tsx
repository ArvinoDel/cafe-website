'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Html5Qrcode,
  Html5QrcodeCameraScanConfig,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScannerState,
} from 'html5-qrcode';
import {
  X,
  Camera,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Zap,
  ZapOff,
  SwitchCamera,
  Users,
  Clock,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { claimTable, type ClaimTableResult } from '@/lib/table-session';
import { formatHHMM } from '@/lib/datetime';

// ─── Regex & URL Helpers ───────────────────────────────────────────────────────

const PLAIN_CODE_REGEX = /^[A-Z]{1,3}-?\d{1,3}$/i;

function isLocalOrPrivateHost(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.startsWith('172.') ||
    h.includes('.ngrok') ||
    h.includes('.trycloudflare.com') ||
    h.includes('.loca.lt')
  );
}

function isValidOrigin(url: URL): boolean {
  try {
    const currentOrigin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : null;
    const currentHostname =
      typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : null;
    const siteUrlOrigin = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : null;

    // 1. Exact match with current origin
    if (currentOrigin && url.origin.toLowerCase() === currentOrigin.toLowerCase()) {
      return true;
    }

    // 2. Exact match with configured site URL
    if (siteUrlOrigin && url.origin.toLowerCase() === siteUrlOrigin.toLowerCase()) {
      return true;
    }

    // 3. In local development / LAN testing:
    if (
      process.env.NODE_ENV !== 'production' ||
      (currentHostname && isLocalOrPrivateHost(currentHostname))
    ) {
      if (isLocalOrPrivateHost(url.hostname)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extracts table code from QR content.
 * Accepts:
 * (a) URL carrying table/meja/t param or /menu/:code path
 * (b) Plain codes matching /^[A-Z]{1,3}-?\d{1,3}$/i or plain numeric table codes
 */
export function extractTableCode(raw: string): string | null {
  const result = extractTableAndBranch(raw);
  return result ? result.table : null;
}

/**
 * Extracts both the table code and the branch ID from a scanned QR URL.
 * Returns { table, branchId } — branchId may be null for plain QR codes.
 */
export function extractTableAndBranch(
  raw: string,
): { table: string; branchId: string | null } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // (b) Plain code check (e.g. "A-1", "12", "VIP-1")
  if (PLAIN_CODE_REGEX.test(trimmed) || /^\d{1,4}$/.test(trimmed)) {
    return { table: trimmed.toUpperCase(), branchId: null };
  }

  // (a) URL check
  try {
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:3000';
    const url = new URL(trimmed, base);

    // Apply origin validation: must be same origin, NEXT_PUBLIC_SITE_URL, or local dev
    if (!isValidOrigin(url)) {
      return null;
    }

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
        table:    tableParam.trim().toUpperCase(),
        branchId: branchParam?.trim() || null,
      };
    }

    const pathMatch = url.pathname.match(/\/(?:menu|menus|tables?)\/([a-zA-Z0-9_-]+)$/i);
    if (pathMatch && pathMatch[1]) {
      return {
        table:    pathMatch[1].trim().toUpperCase(),
        branchId: branchParam?.trim() || null,
      };
    }

    // Fallback: If URL has table in hash
    if (url.hash) {
      const hashMatch = url.hash.match(/[#&?](?:table|meja|t)=([a-zA-Z0-9_-]+)/i);
      if (hashMatch && hashMatch[1]) {
        return {
          table:    hashMatch[1].trim().toUpperCase(),
          branchId: branchParam?.trim() || null,
        };
      }
    }
  } catch {
    // invalid URL format
  }

  return null;
}

// ─── Modal Types ──────────────────────────────────────────────────────────────

export type ScannerModalState =
  | 'scanning'
  | 'checking'
  | 'success'
  | 'TABLE_TAKEN'
  | 'TABLE_RESERVED'
  | 'TOO_MANY_HOLDS'
  | 'TABLE_NOT_FOUND'
  | 'TABLE_COOLDOWN'
  | 'NETWORK_ERROR';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (
    tableCode: string,
    branchId: string | null,
    claimResult?: ClaimTableResult,
  ) => void;
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
  const shouldReduceMotion = useReducedMotion();

  // Latest-ref pattern for callbacks and currentTable to prevent prop changes from re-triggering scanner
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const currentTableRef = useRef(currentTable);
  currentTableRef.current = currentTable;
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State machine
  const [modalState, setModalState] = useState<ScannerModalState>('scanning');
  const [checkingTable, setCheckingTable] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Result info inside modal
  const [successInfo, setSuccessInfo] = useState<{
    table: string;
    branchId: string | null;
    expiresAt?: string;
    moved: boolean;
    claimResult?: ClaimTableResult;
  } | null>(null);

  const [reservedInfo, setReservedInfo] = useState<{
    table: string;
    branchId: string | null;
    startsAt?: string;
  } | null>(null);

  // In-modal sub-actions
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupCodeInput, setGroupCodeInput] = useState('');
  const [showReservedCheckin, setShowReservedCheckin] = useState(false);
  const [reservationCodeInput, setReservationCodeInput] = useState('');
  const [reservationPhoneLast4, setReservationPhoneLast4] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  // Cooldown state
  const [cooldownMinutes, setCooldownMinutes] = useState(10);

  // Manual code input
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Non-blocking toast for non-table QR
  const [invalidQrToast, setInvalidQrToast] = useState<string | null>(null);
  const invalidToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Scanner controls: torch & multiple cameras
  const [torchSupported, setTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  // Internal refs for lifecycle serialization & cancel token
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const isOperatingRef = useRef<Promise<void>>(Promise.resolve());
  const processingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Expose test hooks only in non-production or when NEXT_PUBLIC_E2E === '1'
  if (
    typeof window !== 'undefined' &&
    (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E === '1')
  ) {
    (window as any).__qrScannerModalState = modalState;
  }

  // ─── Lifecycle Helpers ───────────────────────────────────────────────────────

  const stopScannerInternal = useCallback(async (token?: { cancelled: boolean }) => {
    if (token) token.cancelled = true;

    if (scannerRef.current) {
      const inst = scannerRef.current;
      try {
        if (inst.isScanning) {
          await inst.stop();
        }
      } catch (err) {
        console.warn('[stopScanner] error stopping:', err);
      }
      try {
        inst.clear();
      } catch (err) {
        console.warn('[stopScanner] error clearing:', err);
      }
      scannerRef.current = null;
    }

    // Always stop all active tracks from video elements
    try {
      const container = document.getElementById('qr-reader');
      const videos = container?.querySelectorAll('video');
      videos?.forEach((video) => {
        const stream = video.srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      });
    } catch {}

    setCameraActive(false);
    setIsTorchOn(false);
  }, []);

  const stopScanner = useCallback(() => {
    cancelTokenRef.current.cancelled = true;
    const currentOp = isOperatingRef.current;
    const nextOp = currentOp.then(() => stopScannerInternal(cancelTokenRef.current));
    isOperatingRef.current = nextOp;
    return nextOp;
  }, [stopScannerInternal]);

  const handleTriggerSuccess = useCallback(
    (table: string, branchId: string | null, claimResult?: ClaimTableResult) => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      onCloseRef.current();
      onScanSuccessRef.current(table, branchId, claimResult);
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    void stopScanner();
    onCloseRef.current();
  }, [stopScanner]);

  // ─── Verification & Claim Processor ─────────────────────────────────────────

  const processTableClaim = useCallback(
    async (table: string, branchId: string | null) => {
      setCheckingTable(table);
      setModalState('checking');

      let claimResult: ClaimTableResult;
      try {
        claimResult = await claimTable({
          branchId: branchId ?? undefined,
          code:     table,
        });
      } catch (err) {
        console.error('[claimTable] network error:', err);
        setModalState('NETWORK_ERROR');
        return;
      }

      if (claimResult.ok) {
        const expiresAt = claimResult.session?.expiresAt;
        const moved = Boolean(
          currentTableRef.current &&
            currentTableRef.current.trim().toUpperCase() !== table.trim().toUpperCase(),
        );

        setSuccessInfo({
          table,
          branchId,
          expiresAt,
          moved,
          claimResult,
        });
        setModalState('success');

        // Stop scanner tracks immediately on successful claim
        void stopScanner();

        // Close automatically and trigger onScanSuccess after ~400ms
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          handleTriggerSuccess(table, branchId, claimResult);
        }, 400);
      } else {
        void stopScanner();
        const code = claimResult.code;
        if (code === 'TABLE_TAKEN') {
          setModalState('TABLE_TAKEN');
        } else if (code === 'TABLE_COOLDOWN') {
          setModalState('TABLE_COOLDOWN');
          setCooldownMinutes((claimResult as any).remaining_minutes ?? 10);
        } else if (code === 'TABLE_RESERVED' || code === 'TABLE_RESERVED_SOON') {
          handleTriggerSuccess(table, branchId, claimResult);
        } else if (code === 'TOO_MANY_HOLDS') {
          setModalState('TOO_MANY_HOLDS');
        } else if (code === 'TABLE_NOT_FOUND') {
          setModalState('TABLE_NOT_FOUND');
        } else {
          setModalState('NETWORK_ERROR');
        }
      }
    },
    [stopScanner],
  );

  // ─── Single Scan Decode Handler ──────────────────────────────────────────────

  const handleDecodedText = useCallback(
    (decodedText: string) => {
      // Single scan protection: set processing synchronously on the first decode
      if (processingRef.current) return;
      processingRef.current = true;

      const parsed = extractTableAndBranch(decodedText);
      if (!parsed) {
        // Non-table QR: non-blocking toast for 2s, scanner continues running!
        setInvalidQrToast('Bukan QR meja');
        if (invalidToastTimerRef.current) clearTimeout(invalidToastTimerRef.current);
        invalidToastTimerRef.current = setTimeout(() => {
          setInvalidQrToast(null);
        }, 2000);
        processingRef.current = false;
        return;
      }

      // Valid QR decoded!
      // Synchronously pause/stop scanner BEFORE any await
      try {
        if (scannerRef.current?.isScanning) {
          scannerRef.current.pause(true);
        }
      } catch {}

      // Haptic feedback
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(100); } catch {}
      }

      // Proceed with claim state machine
      void processTableClaim(parsed.table, parsed.branchId);
    },
    [processTableClaim],
  );

  const handleDecodedTextRef = useRef<(text: string) => void>(() => {});
  handleDecodedTextRef.current = handleDecodedText;

  // Expose dispatch hook for testing only when NODE_ENV !== 'production' or NEXT_PUBLIC_E2E === '1'
  useEffect(() => {
    const isE2E = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E === '1';
    if (!isE2E) return;

    if (typeof window !== 'undefined') {
      (window as any).__dispatchQrDecode = (text: string) => {
        handleDecodedTextRef.current(text);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__dispatchQrDecode;
      }
    };
  }, []);

  // ─── Start Camera Scanner ────────────────────────────────────────────────────

  const startScanner = useCallback(() => {
    const token = { cancelled: false };
    cancelTokenRef.current = token;

    const currentOp = isOperatingRef.current;
    const nextOp = currentOp.then(async () => {
      if (token.cancelled) return;

      setErrorMsg(null);
      setCameraActive(false);
      setModalState('scanning');
      processingRef.current = false;

      // Container check: never fail silently
      const container = document.getElementById('qr-reader');
      if (!container) {
        console.error('QR Scanner container #qr-reader not found in DOM.');
        setErrorMsg('Gagal memuat area kamera.');
        return;
      }

      // Insecure context check
      if (
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setErrorMsg('Akses kamera membutuhkan koneksi aman (HTTPS).');
        return;
      }

      // In-app browser detection
      if (
        typeof navigator !== 'undefined' &&
        /(Instagram|FBAN|FBAV|Line\/|WhatsApp)/i.test(navigator.userAgent)
      ) {
        setErrorMsg('Buka lewat Chrome atau Safari untuk menggunakan kamera ponsel.');
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode('qr-reader', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        // Query available cameras
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (token.cancelled) {
            try { await html5QrCode.clear(); } catch {}
            return;
          }
          if (cameras && cameras.length > 0) {
            setAvailableCameras(cameras);
          }
        } catch {}

        const cameraConfig = selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode: 'environment' };

        const config: Html5QrcodeCameraScanConfig = {
          fps: 15,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        };

        if (
          typeof window !== 'undefined' &&
          (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E === '1')
        ) {
          (window as any).__scannerStartCount = ((window as any).__scannerStartCount || 0) + 1;
        }

        await html5QrCode.start(
          cameraConfig,
          config,
          (decoded) => handleDecodedTextRef.current(decoded),
          () => {},
        );

        // Cancel token check: if closed during start(), stop immediately!
        if (token.cancelled) {
          if (html5QrCode.isScanning) {
            await html5QrCode.stop();
          }
          try { html5QrCode.clear(); } catch {}
          scannerRef.current = null;
          return;
        }

        setCameraActive(true);

        // Torch support detection
        try {
          const cameraCapabilities = html5QrCode.getRunningTrackCameraCapabilities?.() as any;
          if (cameraCapabilities?.torchFeature?.()?.isSupported?.()) {
            setTorchSupported(true);
          } else {
            const capabilities = html5QrCode.getRunningTrackCapabilities?.() as any;
            setTorchSupported(Boolean(capabilities?.torch));
          }
        } catch {
          setTorchSupported(false);
        }
      } catch (err: any) {
        if (token.cancelled) return;
        console.error('Camera start error:', err);
        let msg = 'Tidak dapat mengakses kamera ponsel.';
        const name = err?.name || '';
        const str = String(err);
        if (name === 'NotAllowedError' || str.includes('NotAllowedError')) {
          msg = 'Izin kamera ditolak. Berikan izin akses kamera di pengaturan browser kamu.';
        } else if (name === 'NotFoundError' || str.includes('NotFoundError')) {
          msg = 'Kamera tidak ditemukan di perangkat ini.';
        } else if (name === 'NotReadableError' || str.includes('NotReadableError')) {
          msg = 'Kamera sedang digunakan oleh aplikasi lain.';
        } else if (name === 'OverconstrainedError' || str.includes('OverconstrainedError')) {
          msg = 'Kamera tidak mendukung konfigurasi ini.';
        } else if (name === 'SecurityError' || str.includes('SecurityError')) {
          msg = 'Akses kamera membutuhkan koneksi aman (HTTPS).';
        }
        setErrorMsg(msg);
        setCameraActive(false);
      }
    });

    isOperatingRef.current = nextOp;
    return nextOp;
  }, [selectedCameraId]);

  // ─── Lifecycle Effect (Depends on [isOpen, selectedCameraId] ONLY) ────────────

  useEffect(() => {
    if (isOpen) {
      // Focus management & scroll lock
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      setModalState('scanning');
      setSuccessInfo(null);
      setReservedInfo(null);
      setShowGroupInput(false);
      setShowReservedCheckin(false);
      setManualCode('');
      setManualError(null);
      setInvalidQrToast(null);

      // Start scanner
      const timer = setTimeout(() => {
        startScanner();
      }, 50);

      return () => {
        clearTimeout(timer);
        if (successTimerRef.current) {
          clearTimeout(successTimerRef.current);
          successTimerRef.current = null;
        }
        document.body.style.overflow = originalOverflow;
        void stopScanner();
      };
    } else {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      void stopScanner();
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus?.();
      }
    }
  }, [isOpen, selectedCameraId, startScanner, stopScanner]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  // ─── Page Visibility Change (Pause/Resume) ───────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      if (!scannerRef.current) return;
      if (document.visibilityState === 'hidden') {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.pause(true);
          }
        } catch {}
      } else if (document.visibilityState === 'visible') {
        try {
          if (
            modalState === 'scanning' &&
            scannerRef.current.getState() === Html5QrcodeScannerState.PAUSED
          ) {
            scannerRef.current.resume();
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isOpen, modalState]);

  // ─── Keyboard & Focus Trap (Accessibility) ───────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalState !== 'checking') {
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;

        const focusables = modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, modalState]);

  // ─── Torch & Camera Switch Actions ──────────────────────────────────────────

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const next = !isTorchOn;
      const cameraCapabilities = scannerRef.current.getRunningTrackCameraCapabilities?.() as any;
      if (cameraCapabilities?.torchFeature?.()?.isSupported?.()) {
        await cameraCapabilities.torchFeature().apply(next);
        setIsTorchOn(next);
        return;
      }

      const video = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (track && 'applyConstraints' in track) {
        await (track as any).applyConstraints({
          advanced: [{ torch: next }],
        });
        setIsTorchOn(next);
      }
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  const switchCamera = async () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    setSelectedCameraId(availableCameras[nextIndex].id);
    await stopScanner();
    startScanner();
  };

  // ─── File Upload (Image QR) ──────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await stopScanner();
      const html5QrCode = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      // scanFile(file, false) renders no duplicate images into DOM
      const decoded = await html5QrCode.scanFile(file, false);
      handleDecodedText(decoded);
    } catch (err) {
      console.warn('File scan error:', err);
      setInvalidQrToast('Tidak dapat mendeteksi QR code dari gambar tersebut.');
      if (invalidToastTimerRef.current) clearTimeout(invalidToastTimerRef.current);
      invalidToastTimerRef.current = setTimeout(() => {
        setInvalidQrToast(null);
      }, 2000);
      startScanner();
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ─── Manual Code Input ───────────────────────────────────────────────────────

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim().toUpperCase();
    if (!PLAIN_CODE_REGEX.test(clean)) {
      setManualError('Format kode meja tidak valid (contoh: A-1)');
      return;
    }
    setManualError(null);
    void stopScanner();
    void processTableClaim(clean, null);
  };

  // ─── Reservation Check-in Inside Modal ──────────────────────────────────────

  const handleReservationCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservedInfo) return;
    const code = reservationCodeInput.trim().toUpperCase();
    const verifier = reservationPhoneLast4.trim();

    if (!code || verifier.length < 4) {
      setCheckinError('Masukkan kode reservasi dan 4 digit terakhir nomor HP.');
      return;
    }

    setCheckinLoading(true);
    setCheckinError(null);

    try {
      const res = await fetch(`/api/reservations/${encodeURIComponent(code)}/check-in`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ verifier }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setCheckinError(data.error || 'Verifikasi gagal. Pastikan kode dan 4 digit HP sesuai.');
        return;
      }

      // Check-in success!
      setSuccessInfo({
        table:       reservedInfo.table,
        branchId:    reservedInfo.branchId,
        expiresAt:   data.ends_at,
        moved:       false,
        claimResult: {
          ok:      true,
          session: {
            tableCode:        reservedInfo.table,
            tableLabel:       `Meja ${reservedInfo.table}`,
            tableSeats:       4,
            branchId:         reservedInfo.branchId || '',
            expiresAt:        data.ends_at,
            startedAt:        new Date().toISOString(),
            remainingSeconds: 3600,
            upgraded:         false,
          },
          isExisting: false,
        },
      });
      setModalState('success');

      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        handleTriggerSuccess(reservedInfo.table, reservedInfo.branchId, {
          ok:      true,
          session: {
            tableCode:        reservedInfo.table,
            tableLabel:       `Meja ${reservedInfo.table}`,
            tableSeats:       4,
            branchId:         reservedInfo.branchId || '',
            expiresAt:        data.ends_at,
            startedAt:        new Date().toISOString(),
            remainingSeconds: 3600,
            upgraded:         false,
          },
          isExisting: false,
        });
      }, 400);
    } catch {
      setCheckinError('Gagal terhubung ke server. Periksa koneksi internetmu.');
    } finally {
      setCheckinLoading(false);
    }
  };

  // ─── Backdrop Click ─────────────────────────────────────────────────────────

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && modalState !== 'checking') {
      handleClose();
    }
  };

  const formattedTime = successInfo?.expiresAt
    ? formatHHMM(successInfo.expiresAt).replace('.', ':')
    : '20 menit ke depan';

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94, y: shouldReduceMotion ? 0 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94, y: shouldReduceMotion ? 0 : 12 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-coffee-100 flex flex-col max-h-[92vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-coffee-100 bg-cream/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-coffee-800 text-cream flex items-center justify-center shadow-sm">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="qr-modal-title" className="font-bold text-sm text-coffee-950">
                    {title || (currentTable ? 'Scan QR Meja Baru' : 'Scan QR Meja')}
                  </h3>
                  <p className="text-[11px] text-charcoal/60">
                    {subtitle ||
                      (currentTable
                        ? `Saat ini Meja ${currentTable} · Arahkan ke meja baru`
                        : 'Arahkan kamera ke kode QR di atas mejamu')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={modalState === 'checking'}
                className="w-8 h-8 rounded-full bg-coffee-100/70 hover:bg-coffee-200/80 text-coffee-900 flex items-center justify-center transition-colors disabled:opacity-40"
                aria-label="Tutup pemindai QR"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Viewport & State Machine Content */}
            <div className="relative bg-black flex items-center justify-center overflow-hidden min-h-[310px] sm:min-h-[350px]">
              {/* Target reader container (No brand strings: id="qr-reader") */}
              <div
                id="qr-reader"
                className="w-full h-full overflow-hidden [&>video]:object-cover [&>video]:w-full [&>video]:h-full [&_#qr-shaded-region]:!hidden"
              />

              {/* Viewfinder Overlay: Exactly ONE viewfinder matching 240x240 qrbox */}
              {modalState === 'scanning' && cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative w-[240px] h-[240px] rounded-2xl border-2 border-sand-300/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.52)] flex items-center justify-center">
                    {/* 4 Corner Accents */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />

                    {/* Animated Scanning Laser Line */}
                    <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_8px_#fde68a] animate-pulse" />
                  </div>
                </div>
              )}

              {/* Top Viewfinder Controls (Torch & Camera Switch) */}
              {modalState === 'scanning' && cameraActive && (
                <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-auto z-10">
                  {torchSupported ? (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-colors ${
                        isTorchOn
                          ? 'bg-amber-400 text-charcoal shadow-md'
                          : 'bg-black/40 text-cream hover:bg-black/60'
                      }`}
                      aria-label="Nyalakan senter"
                    >
                      {isTorchOn ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
                      <span>{isTorchOn ? 'Senter Aktif' : 'Senter'}</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {availableCameras.length > 1 && (
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-black/40 text-cream hover:bg-black/60 backdrop-blur-md transition-colors shadow-sm"
                      aria-label="Ganti kamera"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      <span>Ganti Kamera</span>
                    </button>
                  )}
                </div>
              )}

              {/* Non-blocking Toast: "Bukan QR meja" */}
              <AnimatePresence>
                {invalidQrToast && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-12 px-4 py-2 rounded-full bg-amber-500/95 text-coffee-950 font-bold text-xs shadow-lg backdrop-blur-sm z-30 flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-4 h-4 text-coffee-950" />
                    <span>{invalidQrToast}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* State: CHECKING ("Memeriksa meja...") */}
              {modalState === 'checking' && (
                <div className="absolute inset-0 bg-coffee-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-14 h-14 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center mb-4">
                    <RefreshCw className="w-7 h-7 animate-spin" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Memeriksa meja...</h4>
                  {checkingTable && (
                    <p className="text-xs text-sand-300 mt-1 font-mono">Meja {checkingTable}</p>
                  )}
                </div>
              )}

              {/* State: SUCCESS (Closes automatically ~400ms or on tap) */}
              {modalState === 'success' && successInfo && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => handleTriggerSuccess(successInfo.table, successInfo.branchId, successInfo.claimResult)}
                  className="absolute inset-0 bg-coffee-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20 cursor-pointer select-none"
                >
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center mb-3 animate-bounce">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sand-300 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{successInfo.moved ? 'Pindah Meja Berhasil!' : 'Meja Terverifikasi!'}</span>
                  </div>

                  {successInfo.moved ? (
                    <div className="flex items-center justify-center gap-2 text-xl font-black text-cream mt-1">
                      <span className="text-sand-300/80 line-through text-base">Meja {currentTable}</span>
                      <span>➔</span>
                      <span className="text-emerald-300">Meja {successInfo.table}</span>
                    </div>
                  ) : (
                    <h4 className="text-2xl font-black tracking-tight text-cream">
                      Meja {successInfo.table}
                    </h4>
                  )}

                  <p className="text-xs text-cream/80 max-w-xs mt-3 leading-relaxed">
                    Meja ditahan sampai {formattedTime}, selesaikan pesanan agar meja terkunci.
                  </p>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTriggerSuccess(successInfo.table, successInfo.branchId, successInfo.claimResult);
                    }}
                    className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md active:scale-95"
                  >
                    <span>Lanjut ke Menu</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* State: TABLE_TAKEN */}
              {modalState === 'TABLE_TAKEN' && (
                <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                    <Users className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Meja Sedang Dipakai</h4>
                  <p className="text-xs text-cream/70 mt-1 max-w-xs">
                    Meja ini sedang dipakai pelanggan lain. Kamu bisa bergabung lewat Pesan Bareng atau scan meja lain.
                  </p>

                  {!showGroupInput ? (
                    <div className="flex flex-col gap-2 w-full max-w-xs mt-5">
                      <button
                        type="button"
                        onClick={() => setShowGroupInput(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-coffee-950 text-xs font-bold transition-colors shadow-sm"
                      >
                        Masukkan Kode Pesan Bareng
                      </button>
                      <button
                        type="button"
                        onClick={startScanner}
                        className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-semibold transition-colors"
                      >
                        Scan Meja Lain
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const code = groupCodeInput.trim().toUpperCase();
                        if (code) {
                          window.location.href = `/menu?group=${encodeURIComponent(code)}`;
                        }
                      }}
                      className="w-full max-w-xs mt-4 flex flex-col gap-2"
                    >
                      <input
                        type="text"
                        value={groupCodeInput}
                        onChange={(e) => setGroupCodeInput(e.target.value.toUpperCase())}
                        placeholder="Kode Pesan Bareng (contoh: NAKO12)"
                        maxLength={12}
                        className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-cream text-xs text-center uppercase tracking-widest placeholder:text-cream/40 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="submit"
                        className="w-full py-2 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-coffee-950 text-xs font-bold transition-colors"
                      >
                        Gabung Pesanan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGroupInput(false)}
                        className="text-[11px] text-cream/60 hover:text-cream py-1"
                      >
                        Batal
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* State: TABLE_RESERVED */}
              {modalState === 'TABLE_RESERVED' && reservedInfo && (
                <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20 overflow-y-auto">
                  <div className="w-14 h-14 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center mb-3">
                    <Clock className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Meja Direservasi</h4>
                  <p className="text-xs text-cream/70 mt-1 max-w-xs">
                    Meja {reservedInfo.table} sudah dipesan untuk reservasi
                    {reservedInfo.startsAt
                      ? ` pukul ${formatHHMM(reservedInfo.startsAt).replace('.', ':')}`
                      : ''}.
                  </p>

                  {!showReservedCheckin ? (
                    <div className="flex flex-col gap-2 w-full max-w-xs mt-5">
                      <button
                        type="button"
                        onClick={() => setShowReservedCheckin(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-coffee-950 text-xs font-bold transition-colors shadow-sm"
                      >
                        Saya yang Reservasi
                      </button>
                      <button
                        type="button"
                        onClick={startScanner}
                        className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-semibold transition-colors"
                      >
                        Scan Meja Lain
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleReservationCheckin} className="w-full max-w-xs mt-4 flex flex-col gap-2">
                      <input
                        type="text"
                        value={reservationCodeInput}
                        onChange={(e) => setReservationCodeInput(e.target.value.toUpperCase())}
                        placeholder="Kode Reservasi (contoh: NAKO-ABCD)"
                        className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-cream text-xs text-center uppercase tracking-wider placeholder:text-cream/40 focus:outline-none focus:border-sky-400"
                      />
                      <input
                        type="text"
                        value={reservationPhoneLast4}
                        onChange={(e) => setReservationPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="4 digit nomor HP terakhir"
                        maxLength={4}
                        className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-cream text-xs text-center tracking-widest placeholder:text-cream/40 focus:outline-none focus:border-sky-400"
                      />
                      {checkinError && (
                        <p className="text-[11px] text-red-400 font-semibold">{checkinError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={checkinLoading}
                        className="w-full py-2 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-coffee-950 text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {checkinLoading ? 'Memverifikasi...' : 'Verifikasi & Duduk'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReservedCheckin(false)}
                        className="text-[11px] text-cream/60 hover:text-cream py-1"
                      >
                        Batal
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* State: TOO_MANY_HOLDS */}
              {modalState === 'TOO_MANY_HOLDS' && (
                <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Batas Meja Tercapai</h4>
                  <p className="text-xs text-cream/80 mt-1 max-w-xs leading-relaxed">
                    Kamu memiliki terlalu banyak meja yang ditahan. Selesaikan atau batalkan pesanan sebelumnya.
                  </p>
                  <div className="flex gap-2 w-full max-w-xs mt-5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-semibold"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      onClick={startScanner}
                      className="flex-1 py-2.5 rounded-xl bg-coffee-700 hover:bg-coffee-600 text-cream text-xs font-bold"
                    >
                      Scan Ulang
                    </button>
                  </div>
                </div>
              )}

              {/* State: TABLE_COOLDOWN */}
              {modalState === 'TABLE_COOLDOWN' && (
                <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                    <Clock className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Meja Sedang Cooldown</h4>
                  <p className="text-xs text-cream/80 mt-1 max-w-xs leading-relaxed">
                    Meja ini baru saja dilepas. Tunggu {cooldownMinutes} menit sebelum dapat diklaim kembali, atau silakan pilih meja lain.
                  </p>
                  <div className="flex gap-2 w-full max-w-xs mt-5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-semibold"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      onClick={startScanner}
                      className="flex-1 py-2.5 rounded-xl bg-coffee-700 hover:bg-coffee-600 text-cream text-xs font-bold"
                    >
                      Scan Meja Lain
                    </button>
                  </div>
                </div>
              )}

              {/* State: TABLE_NOT_FOUND */}
              {modalState === 'TABLE_NOT_FOUND' && (
                <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                    <HelpCircle className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Meja Tidak Ditemukan</h4>
                  <p className="text-xs text-cream/80 mt-1 max-w-xs leading-relaxed">
                    Kode meja tidak terdaftar atau sedang tidak aktif di sistem.
                  </p>
                  <div className="flex gap-2 w-full max-w-xs mt-5">
                    <button
                      type="button"
                      onClick={startScanner}
                      className="w-full py-2.5 rounded-xl bg-coffee-700 hover:bg-coffee-600 text-cream text-xs font-bold"
                    >
                      Scan Meja Lain
                    </button>
                  </div>
                </div>
              )}

              {/* State: NETWORK_ERROR */}
              {modalState === 'NETWORK_ERROR' && (
                <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-cream">Koneksi Bermasalah</h4>
                  <p className="text-xs text-cream/80 mt-1 max-w-xs leading-relaxed">
                    Gagal terhubung ke server. Periksa koneksi internetmu lalu coba lagi.
                  </p>
                  <div className="flex gap-2 w-full max-w-xs mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        if (checkingTable) {
                          void processTableClaim(checkingTable, null);
                        } else {
                          startScanner();
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-coffee-950 text-xs font-bold"
                    >
                      Coba Lagi
                    </button>
                    <button
                      type="button"
                      onClick={startScanner}
                      className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-semibold"
                    >
                      Scan Meja Lain
                    </button>
                  </div>
                </div>
              )}

              {/* Error State: Camera Permissions / Insecure Context / In-App Browser */}
              {errorMsg && modalState === 'scanning' && (
                <div className="absolute inset-0 bg-charcoal/95 flex flex-col items-center justify-center p-6 text-center text-cream z-20">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <p className="text-xs sm:text-sm text-cream/90 max-w-xs leading-relaxed">
                    {errorMsg}
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      type="button"
                      onClick={startScanner}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-600 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Coba Lagi
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-cream text-xs font-bold transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Gambar QR
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Code Input & Footer Controls */}
            <div className="p-4 bg-cream/40 border-t border-coffee-100 flex flex-col gap-3">
              {/* Always offer manual table input field: "Ketik kode meja (contoh A-1)" */}
              <form onSubmit={handleManualSubmit} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => {
                      setManualCode(e.target.value.toUpperCase());
                      setManualError(null);
                    }}
                    placeholder="Ketik kode meja (contoh A-1)"
                    maxLength={10}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-coffee-200 text-xs text-coffee-950 uppercase tracking-wider placeholder:normal-case placeholder:text-charcoal/40 focus:outline-none focus:border-coffee-700 shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="px-4 py-2 rounded-xl bg-coffee-800 text-cream text-xs font-bold hover:bg-coffee-900 transition-colors disabled:opacity-40 shadow-sm flex items-center gap-1"
                  >
                    <span>Gunakan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {manualError && (
                  <p className="text-[11px] text-red-500 font-semibold px-1">{manualError}</p>
                )}
              </form>

              {/* Action buttons: Upload File & Restart */}
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-coffee-100/60">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-coffee-200 text-coffee-800 text-xs font-semibold hover:bg-coffee-50 transition-colors shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5 text-coffee-600" />
                  <span>Upload Foto QR</span>
                </button>

                <button
                  type="button"
                  onClick={startScanner}
                  disabled={modalState === 'checking'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-coffee-700 text-cream text-xs font-bold hover:bg-coffee-800 transition-colors disabled:opacity-40 shadow-sm ml-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Restart Kamera</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
