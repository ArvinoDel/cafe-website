import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Bukti Pesanan',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReceiptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
