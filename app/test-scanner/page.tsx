'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { notFound } from 'next/navigation';
import QrScannerModal from '@/components/ui/QrScannerModal';
import { ClaimTableResult } from '@/lib/table-session';

export default function TestScannerPage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_E2E !== '1') {
    notFound();
  }
  const [isOpen, setIsOpen] = useState(false);
  const [renderCounter, setRenderCounter] = useState(0);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [claimCalls, setClaimCalls] = useState(0);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    (window as any).__setScannerOpen = (open: boolean) => setIsOpen(open);
  }, []);

  // Monkey-patch fetch to track /api/tables/claim calls accurately in test
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      if (url.includes('/api/tables/claim')) {
        setClaimCalls((c) => c + 1);
        (window as any).__claimCallsCount = ((window as any).__claimCallsCount || 0) + 1;
      }
      return originalFetch.apply(window, args);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const triggerTwentyReRenders = () => {
    for (let i = 0; i < 20; i++) {
      setRenderCounter((prev) => prev + 1);
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto font-sans">
      <h1 className="text-xl font-bold mb-4">Test Harness for QrScannerModal</h1>

      <div className="flex flex-col gap-3 mb-6">
        <button
          id="btn-open-modal"
          data-hydrated={hydrated ? 'true' : 'false'}
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium"
        >
          Buka Scanner
        </button>

        <button
          id="btn-close-modal"
          onClick={() => setIsOpen(false)}
          className="px-4 py-2 bg-gray-600 text-white rounded font-medium"
        >
          Tutup Scanner
        </button>

        <button
          id="btn-rerender-twenty"
          onClick={triggerTwentyReRenders}
          className="px-4 py-2 bg-purple-600 text-white rounded font-medium"
        >
          Rerender 20x (Counter: {renderCounter})
        </button>

        <button
          id="btn-open-and-close-fast"
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => {
              setIsOpen(false);
            }, 10);
          }}
          className="px-4 py-2 bg-amber-600 text-white rounded font-medium"
        >
          Open & Close Fast (During start)
        </button>
      </div>

      <div className="p-4 bg-gray-100 rounded text-sm space-y-1">
        <p id="label-scanned">Last Scanned: {lastScanned || '-'}</p>
        <p id="label-claim-calls">Claim Calls: {claimCalls}</p>
        <p id="label-render-count">Render Count: {renderCounter}</p>
      </div>

      {/* Mount QrScannerModal with inline callbacks so each parent re-render creates new function instances */}
      <QrScannerModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        onScanSuccess={(tableCode, branchId, claimResult) => {
          setLastScanned(tableCode);
        }}
        currentTable="A-1"
      />
    </div>
  );
}
