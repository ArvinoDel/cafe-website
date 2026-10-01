import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bergabung ke Pesanan Bareng',
  description: 'Gabung ke sesi pesan bareng di mejamu.',
  robots: { index: false, follow: false },
};

export default function GroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
