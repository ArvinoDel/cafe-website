import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type ErrorAction = {
  label: string;
  /** If href is provided, renders a Link. If onClick is provided, renders a button. */
  href?: string;
  onClick?: () => void;
};

export type ErrorStateProps = {
  /** Lucide-react icon element */
  icon?: React.ReactNode;
  title: string;
  message: string;
  primaryAction: ErrorAction;
  secondaryAction?: ErrorAction;
  className?: string;
};

/**
 * Shared error / empty-state UI component for customer-facing error boundaries
 * and the global 404 page.
 *
 * Rules:
 * - All text must remain in Indonesian — do NOT add English copy here.
 * - No brand-specific strings (no "kopi-nako").
 * - role="alert" so screen readers announce the message automatically.
 * - Minimum button height 44 px for touch targets.
 */
export default function ErrorState({
  icon,
  title,
  message,
  primaryAction,
  secondaryAction,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'flex min-h-[60vh] flex-col items-center justify-center',
        'px-6 py-16 text-center',
        className,
      ].join(' ')}
    >
      {/* Icon container */}
      {icon && (
        <div
          aria-hidden="true"
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-coffee-50 border border-coffee-100 shadow-soft"
        >
          {icon}
        </div>
      )}

      {/* Heading */}
      <h1 className="mb-2 text-xl font-extrabold leading-tight text-coffee-900 sm:text-2xl">
        {title}
      </h1>

      {/* Body */}
      <p className="mb-8 max-w-xs text-sm leading-relaxed text-charcoal/60 sm:max-w-sm sm:text-base">
        {message}
      </p>

      {/* Actions */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {primaryAction.onClick ? (
          <Button
            onClick={primaryAction.onClick}
            size="lg"
            className="h-12 w-full bg-coffee-700 text-cream hover:bg-coffee-800 focus-visible:ring-coffee-700"
          >
            {primaryAction.label}
          </Button>
        ) : (
          <Button
            asChild
            size="lg"
            className="h-12 w-full bg-coffee-700 text-cream hover:bg-coffee-800 focus-visible:ring-coffee-700"
          >
            <Link href={primaryAction.href ?? '/'}>{primaryAction.label}</Link>
          </Button>
        )}

        {secondaryAction &&
          (secondaryAction.onClick ? (
            <Button
              onClick={secondaryAction.onClick}
              variant="outline"
              size="lg"
              className="h-12 w-full border-coffee-200 bg-white text-coffee-800 hover:bg-coffee-50"
            >
              {secondaryAction.label}
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 w-full border-coffee-200 bg-white text-coffee-800 hover:bg-coffee-50"
            >
              <Link href={secondaryAction.href ?? '/menu'}>
                {secondaryAction.label}
              </Link>
            </Button>
          ))}
      </div>
    </div>
  );
}
