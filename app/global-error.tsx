'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Global error boundary — last resort fallback when the root layout itself crashes.
 *
 * Next.js requires this component to render its own <html> and <body>.
 * Therefore it CANNOT import any components that depend on providers, fonts, or
 * external CSS that may not be available. Styles are written as inline/Tailwind
 * classNames only (Tailwind base CSS is still loaded via globals.css in normal flow,
 * but we use safe CSS-variable colours that also exist as inline fallbacks).
 *
 * Rules:
 * - Never expose error.message, error.stack, or error.digest to the customer.
 * - All customer-facing text is in Indonesian.
 * - No brand names.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[GlobalErrorBoundary]', error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#faf6f2',
          color: '#2a1f17',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1.5rem',
            textAlign: 'center',
          }}
        >
          {/* Icon */}
          <div
            aria-hidden="true"
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              backgroundColor: '#f1e8de',
              border: '1px solid #e3d0bf',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            {/* Simple SVG exclamation mark — no external icon library required */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#b5845e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Heading */}
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              lineHeight: 1.3,
              marginBottom: 8,
              color: '#3a2415',
            }}
          >
            Ups, ada yang tidak beres
          </h1>

          {/* Body */}
          <p
            style={{
              fontSize: '0.95rem',
              lineHeight: 1.6,
              color: '#6b5a4e',
              maxWidth: 320,
              marginBottom: 32,
            }}
          >
            Halaman gagal dimuat. Coba lagi ya.
          </p>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              width: '100%',
              maxWidth: 320,
            }}
          >
            <button
              onClick={reset}
              style={{
                height: 48,
                borderRadius: 12,
                backgroundColor: '#6b4122',
                color: '#faf6f2',
                fontSize: '0.95rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Coba lagi
            </button>

            {/* Plain <a> — no Next.js Link, no router */}
            <a
              href="/menu"
              style={{
                height: 48,
                borderRadius: 12,
                backgroundColor: '#ffffff',
                color: '#52341c',
                fontSize: '0.95rem',
                fontWeight: 600,
                border: '1px solid #e3d0bf',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                width: '100%',
              }}
            >
              Kembali ke menu
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
