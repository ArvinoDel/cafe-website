import { MenuPageSkeleton } from '@/components/ui/MenuCardSkeleton';

/**
 * Route-level loading UI for /menus (alias of /menu).
 * The page itself re-exports MenuPage, so we also re-use the same skeleton.
 */
export default function MenusLoading() {
  return <MenuPageSkeleton />;
}
