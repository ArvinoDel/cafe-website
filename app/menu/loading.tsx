import { MenuPageSkeleton } from '@/components/ui/MenuCardSkeleton';

/**
 * Route-level loading UI for /menu.
 * Next.js shows this file while the page component streams in.
 * Uses the shared MenuPageSkeleton so layout is pixel-identical to the real page.
 */
export default function MenuLoading() {
  return <MenuPageSkeleton />;
}
