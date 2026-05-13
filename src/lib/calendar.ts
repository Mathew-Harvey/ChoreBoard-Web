/**
 * Tiny date helpers for the CalendarDesktop. Everything works in YYYY-MM-DD
 * strings keyed off the family timezone — we never compare Date objects to
 * each other directly because once you cross a TZ boundary that gets weird
 * (kid in WA pulling up a board the parent in QLD pinned to "today").
 */

export type DateKey = string; // 'YYYY-MM-DD'

export function todayKey(timezone?: string): DateKey {
  return formatDateKey(new Date(), timezone);
}

export function formatDateKey(d: Date, timezone?: string): DateKey {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA always returns YYYY-MM-DD which is exactly what we store.
  return fmt.format(d);
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateKey(d, 'UTC');
}

export function addMonths(key: DateKey, months: number): DateKey {
  const d = parseDateKey(key);
  d.setUTCMonth(d.getUTCMonth() + months);
  return formatDateKey(d, 'UTC');
}

export function startOfMonth(key: DateKey): DateKey {
  const d = parseDateKey(key);
  d.setUTCDate(1);
  return formatDateKey(d, 'UTC');
}

/**
 * Build the 6×7 grid of day keys for a calendar view rooted at the month
 * containing `anchor`. Always returns 42 entries so the grid layout is
 * stable regardless of where the 1st falls.
 *
 * `weekStartsOn` defaults to Monday (1) which matches the rest of ChoreBoard
 * (Sunday-first calendars feel American to a Sydney family).
 */
export function buildCalendarGrid(
  anchor: DateKey,
  weekStartsOn: 0 | 1 = 1,
): DateKey[] {
  const monthStart = parseDateKey(startOfMonth(anchor));
  const dow = monthStart.getUTCDay(); // 0 = Sun … 6 = Sat
  const offset = (dow - weekStartsOn + 7) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return formatDateKey(d, 'UTC');
  });
}

export function monthLabel(key: DateKey): string {
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function dayOfMonth(key: DateKey): number {
  return parseDateKey(key).getUTCDate();
}

export function isSameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function readableDate(key: DateKey | null): string {
  if (!key) return 'Unscheduled';
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function shortDate(key: DateKey | null): string {
  if (!key) return 'Unscheduled';
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
