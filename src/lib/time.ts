/**
 * The single source of truth for "what time is it for this family, right now".
 *
 * Everywhere else in the product code, instead of reaching for `new Date()` or
 * `toLocaleTimeString(undefined, …)`, call `useFamilyClock()` and the
 * `format*` / `isToday` / `localDayKey` helpers from this module. They thread
 * `family.timezone` (from the cached board / family query) and `board.now`
 * (the server's clock anchor) through every computation, so a parent in Perth
 * viewing a Sydney family's board sees the same "Today" / "Tomorrow" pills
 * and the same payout times as the rest of the family.
 *
 * The low-level `partsInZone` / `zonedDateToUtc` helpers are ported verbatim
 * from `ChoreBoard-Api/src/domain/cadence.ts` — pure `Intl`-based JS, no
 * runtime deps, so they run identically on server and client.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { BoardResponse, Family, Kid, Parent } from './types';

// ----------------------------------------------------------------------------
// Low-level timezone helpers (ported from API domain/cadence.ts)
// ----------------------------------------------------------------------------

/** Parts of a wall-clock moment in a given IANA timezone. */
export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun … 6=Sat
};

export function partsInZone(d: Date, timezone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '00' : map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday!] ?? 0,
  };
}

/**
 * Build a UTC Date that, when viewed in `timezone`, reads as
 * (year, month, day, hour, minute). Two-pass search handles DST.
 */
export function zonedDateToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(guess, timezone);
    const desiredTotal =
      year * 12 * 31 * 24 * 60 +
      (month - 1) * 31 * 24 * 60 +
      (day - 1) * 24 * 60 +
      hour * 60 +
      minute;
    const actualTotal =
      p.year * 12 * 31 * 24 * 60 +
      (p.month - 1) * 31 * 24 * 60 +
      (p.day - 1) * 24 * 60 +
      p.hour * 60 +
      p.minute;
    const deltaMin = desiredTotal - actualTotal;
    if (deltaMin === 0) return guess;
    guess = new Date(guess.getTime() + deltaMin * 60_000);
  }
  return guess;
}

// ----------------------------------------------------------------------------
// Family clock — read board.now + family.timezone from the query cache
// ----------------------------------------------------------------------------

export type FamilyClock = {
  /** Server-anchored "now" instant, or a browser fallback if no data is loaded yet. */
  now: Date;
  /** IANA timezone for this family, or the browser default if unknown. */
  tz: string;
  /**
   * `true` when both `now` and `tz` come from the server (board cache).
   * `false` when we're falling back to browser values (use sparingly).
   */
  ready: boolean;
};

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Subscribe to the family clock. Reads from the cached board query first
 * (which includes both `now` from the server and `family.timezone`), then
 * falls back to the cached family query, then to the browser clock + tz.
 *
 * The query keys (`['board']`, `['family']`) are the same ones already used
 * across the app, so this hook deduplicates with existing subscriptions and
 * doesn't trigger duplicate fetches.
 *
 * Pass `disabled: true` on screens that should never trigger a board fetch
 * (e.g. unauthenticated marketing / legal pages); the hook will fall back
 * to the browser values without making a network request.
 */
export function useFamilyClock(opts: { disabled?: boolean } = {}): FamilyClock {
  const disabled = !!opts.disabled;
  // Read existing caches — both queries default `enabled` to true so any
  // already-mounted Desktops / Admin tree shares the data, while a screen
  // that mounts in isolation will fetch once.
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardResponse>('/api/board'),
    enabled: !disabled,
    refetchOnMount: false,
    staleTime: 60_000,
  });
  const fam = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ family: Family; parents: Parent[]; kids: Kid[] }>('/api/family'),
    enabled: !disabled && !board.data,
    refetchOnMount: false,
    staleTime: 60_000,
  });

  if (board.data) {
    return {
      now: new Date(board.data.now),
      tz: board.data.family.timezone || browserTz(),
      ready: true,
    };
  }
  if (fam.data) {
    return {
      now: new Date(),
      tz: fam.data.family.timezone || browserTz(),
      ready: true,
    };
  }
  return { now: new Date(), tz: browserTz(), ready: false };
}

// ----------------------------------------------------------------------------
// Day-level helpers
// ----------------------------------------------------------------------------

/** `YYYY-MM-DD` for the wall-date of `d` in `tz` (family-tz day key). */
export function localDayKey(d: Date, tz: string): string {
  const p = partsInZone(d, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Are `a` and `b` on the same wall-calendar day in `tz`? */
export function isSameLocalDay(a: Date, b: Date, tz: string): boolean {
  return localDayKey(a, tz) === localDayKey(b, tz);
}

/** Midnight (00:00) of `d`'s local day in `tz`, as a UTC `Date`. */
export function startOfLocalDay(d: Date, tz: string): Date {
  const p = partsInZone(d, tz);
  return zonedDateToUtc(p.year, p.month, p.day, 0, 0, tz);
}

/** Midnight of the day after `d`'s local day in `tz`, as a UTC `Date`. */
export function startOfNextLocalDay(d: Date, tz: string): Date {
  const start = startOfLocalDay(d, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Is `d` "today" in `tz`, relative to `now`? */
export function isToday(d: Date, tz: string, now: Date): boolean {
  return isSameLocalDay(d, now, tz);
}

/** Is `d` "tomorrow" in `tz`, relative to `now`? */
export function isTomorrow(d: Date, tz: string, now: Date): boolean {
  const tomorrow = new Date(startOfNextLocalDay(now, tz).getTime() + 1);
  return isSameLocalDay(d, tomorrow, tz);
}

// ----------------------------------------------------------------------------
// Display formatters (all accept an explicit tz; never use `undefined`)
// ----------------------------------------------------------------------------

/**
 * Short clock like "7am" or "7:30 AM". Drops the `:00` minute for whole hours.
 * Always rendered in `tz`.
 */
export function formatClock(d: Date | string, tz: string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p = partsInZone(date, tz);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: 'numeric',
    minute: p.minute ? '2-digit' : undefined,
  }).format(date);
}

/** Weekday + month + day in `tz` (e.g. "Wed, 18 Mar"). */
export function formatShortDate(d: Date | string, tz: string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** Full readable date in `tz` (e.g. "Wednesday, 18 March 2026"). */
export function formatLongDate(d: Date | string, tz: string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** Date + time on one line in `tz` (e.g. "Wed 18 Mar, 7 PM"). */
export function formatDateTime(d: Date | string, tz: string): string {
  return `${formatShortDate(d, tz)}, ${formatClock(d, tz)}`;
}

/**
 * Inclusive range like "12 Mar – 18 Mar" or "30 Dec 2025 – 5 Jan 2026"
 * (years included only when start and end fall in different years).
 */
export function formatDateRange(start: Date | string, end: Date | string, tz: string): string {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  const sp = partsInZone(s, tz);
  const ep = partsInZone(e, tz);
  const sameYear = sp.year === ep.year;
  const startStr = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(s);
  const endStr = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(e);
  return `${startStr} – ${endStr}`;
}

/** Same as `formatDateRange` — kept as a named alias for the week table use case. */
export const formatWeekRange = formatDateRange;

/**
 * Short payout label like "Sun 7 PM" — used in the kanban header and TV mode
 * so kids see the same string everywhere.
 */
export function formatPayoutShort(d: Date | string, tz: string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const weekday = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short' }).format(
    date,
  );
  return `${weekday} ${formatClock(date, tz)}`;
}

/** `YYYY-MM-DD` for "today" in `tz`. */
export function todayLocalDayKey(now: Date, tz: string): string {
  return localDayKey(now, tz);
}

/** Parse a `YYYY-MM-DD` string as midnight-in-tz and return the UTC `Date`. */
export function dayKeyToZonedDate(key: string, tz: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return zonedDateToUtc(y, m, d, 0, 0, tz);
}

/** Parse a `YYYY-MM-DD` string as 23:59 local end-of-day and return the UTC `Date`. */
export function dayKeyToZonedEndOfDay(key: string, tz: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return zonedDateToUtc(y, m, d, 23, 59, tz);
}
