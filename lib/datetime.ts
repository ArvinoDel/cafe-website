/**
 * lib/datetime.ts
 *
 * Shared timezone and date-formatting utilities.
 * All user-visible timestamps must go through these helpers so that the
 * display timezone is changed in exactly one place.
 *
 * Timezone: Asia/Jakarta (WIB, UTC+7).
 */

/** Canonical display timezone for all user-facing date/time output. */
export const APP_TIMEZONE = 'Asia/Jakarta' as const;

/**
 * Formats a Date or ISO string to HH.MM (24-hour) in Asia/Jakarta.
 * Example: formatHHMM(new Date('2026-10-21T08:40:00Z')) → '15.40'
 */
export function formatHHMM(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('id-ID', {
    timeZone: APP_TIMEZONE,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).replace(':', '.');
}

/**
 * Formats a Date or ISO string to a full date-time string in id-ID / Jakarta.
 * Example: 'Rabu, 21 Oktober 2026 pukul 15.40'
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const datePart = d.toLocaleDateString('id-ID', {
    timeZone: APP_TIMEZONE,
    weekday:  'long',
    year:     'numeric',
    month:    'long',
    day:      'numeric',
  });
  const timePart = formatHHMM(d);
  return `${datePart} pukul ${timePart}`;
}

/**
 * Formats a Date or ISO string to a short date string in id-ID / Jakarta.
 * Example: '21 Okt 2026'
 */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('id-ID', {
    timeZone: APP_TIMEZONE,
    day:      'numeric',
    month:    'short',
    year:     'numeric',
  });
}

/**
 * Returns how many whole seconds remain until a future Date / ISO string.
 * Returns 0 if the timestamp is in the past.
 */
export function secondsUntil(future: Date | string): number {
  const ms = new Date(future).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

/**
 * Formats a seconds-remaining value into a MM:SS or HH:MM:SS countdown string.
 * Example: 5400 → '1:30:00'
 */
export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
