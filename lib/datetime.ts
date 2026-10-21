/**
 * lib/datetime.ts
 *
 * Shared timezone and date-formatting utilities.
 * All user-visible timestamps must go through these helpers so that the
 * display timezone is changed in exactly one place and respects branch timezone.
 *
 * Default Timezone: Asia/Jakarta (WIB, UTC+7).
 */

/** Canonical fallback display timezone for user-facing date/time output. */
export const APP_TIMEZONE = 'Asia/Jakarta' as const;

/**
 * Returns the ISO offset string for a given timezone (e.g. "+07:00", "+08:00", "+09:00").
 */
export function getTzOffsetString(date: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+07:00';
    const match = tzPart.match(/GMT([+-]\d{2}):?(\d{2})?/);
    if (match) {
      return `${match[1]}:${match[2] || '00'}`;
    }
  } catch {
    // Fallback if timezone string is unknown
  }
  return '+07:00';
}

/**
 * Formats a Date or ISO string to HH.MM (24-hour) in the specified branch timezone.
 * Example: formatHHMM(new Date('2026-10-21T08:40:00Z')) → '15.40'
 */
export function formatHHMM(date: Date | string, timeZone: string = APP_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('id-ID', {
    timeZone,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).replace(':', '.');
}

/**
 * Formats a Date or ISO string to a full date-time string in id-ID in the specified branch timezone.
 * Example: 'Rabu, 21 Oktober 2026 pukul 15.40'
 */
export function formatDateTime(date: Date | string, timeZone: string = APP_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const datePart = d.toLocaleDateString('id-ID', {
    timeZone,
    weekday:  'long',
    year:     'numeric',
    month:    'long',
    day:      'numeric',
  });
  const timePart = formatHHMM(d, timeZone);
  return `${datePart} pukul ${timePart}`;
}

/**
 * Formats a Date or ISO string to a short date string in id-ID in the specified branch timezone.
 * Example: '21 Okt 2026'
 */
export function formatShortDate(date: Date | string, timeZone: string = APP_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('id-ID', {
    timeZone,
    day:      'numeric',
    month:    'short',
    year:     'numeric',
  });
}

/**
 * Formats a Date to YYYY-MM-DD input string in the specified branch timezone.
 */
export function formatDateYYYYMMDD(date: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  return date.toLocaleDateString('sv-SE', { timeZone });
}

/**
 * Combines date string (YYYY-MM-DD) and time string (HH:mm) into an exact ISO-8601 string
 * using the branch timezone offset.
 * Example: buildIsoWithTimezone('2026-10-22', '10:00', 'Asia/Jakarta') → '2026-10-22T10:00:00+07:00'
 */
export function buildIsoWithTimezone(dateStr: string, timeStr: string, timeZone: string = APP_TIMEZONE): string {
  const dummy = new Date(`${dateStr}T${timeStr}:00Z`);
  const offset = getTzOffsetString(dummy, timeZone);
  return `${dateStr}T${timeStr}:00${offset}`;
}

/**
 * Builds array of HH:mm time slots between openTime and closeTime.
 */
export function buildTimeSlots(openTime: string = '08:00', closeTime: string = '21:00', stepMin: number = 30): string[] {
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const slots: string[] = [];
  let cur = oh * 60 + (om || 0);
  const end = ch * 60 + (cm || 0);
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    cur += stepMin;
  }
  return slots;
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
