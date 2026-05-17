/**
 * Client-side cadence engine — a port of the API's
 * `domain/cadence.ts::occurrencesBetween` / `nextOccurrenceAfter`. Used by the
 * cadence picker to render a live "Next 5 runs" preview as the user edits a
 * recurrence rule.
 *
 * The server is still the source of truth — these helpers just give us a
 * fast, offline preview that matches the server's renewal math (same TZ
 * helpers from `src/lib/time.ts`, same algorithm).
 */

import type { Cadence } from './types';
import { partsInZone, zonedDateToUtc, type ZonedParts } from './time';

function parseTime(hhmm: string): { h: number; m: number } {
  const [hStr, mStr] = hhmm.split(':');
  return { h: Number(hStr), m: Number(mStr) };
}

function addDaysZoned(parts: ZonedParts, days: number, timezone: string): ZonedParts {
  const utc = zonedDateToUtc(parts.year, parts.month, parts.day, 12, 0, timezone);
  const shifted = new Date(utc.getTime() + days * 24 * 60 * 60 * 1000);
  const p = partsInZone(shifted, timezone);
  return { ...p, hour: parts.hour, minute: parts.minute };
}

function candidatesForDay(cadence: Cadence, day: ZonedParts, timezone: string): Date[] {
  switch (cadence.kind) {
    case 'daily': {
      return cadence.times.map((t) => {
        const { h, m } = parseTime(t);
        return zonedDateToUtc(day.year, day.month, day.day, h, m, timezone);
      });
    }
    case 'weekly': {
      if (!cadence.days.includes(day.weekday)) return [];
      const { h, m } = parseTime(cadence.time);
      return [zonedDateToUtc(day.year, day.month, day.day, h, m, timezone)];
    }
    case 'every_n_days': {
      const epochDay = Math.floor(
        zonedDateToUtc(day.year, day.month, day.day, 12, 0, timezone).getTime() /
          (24 * 60 * 60 * 1000),
      );
      if (epochDay % cadence.n !== 0) return [];
      const { h, m } = parseTime(cadence.time);
      return [zonedDateToUtc(day.year, day.month, day.day, h, m, timezone)];
    }
    case 'every_n_weeks': {
      if (!cadence.days.includes(day.weekday)) return [];
      const epochDay = Math.floor(
        zonedDateToUtc(day.year, day.month, day.day, 12, 0, timezone).getTime() /
          (24 * 60 * 60 * 1000),
      );
      const epochWeek = Math.floor(epochDay / 7);
      if (epochWeek % cadence.n !== 0) return [];
      const { h, m } = parseTime(cadence.time);
      return [zonedDateToUtc(day.year, day.month, day.day, h, m, timezone)];
    }
    case 'monthly_dom': {
      if (day.day !== cadence.day) return [];
      const { h, m } = parseTime(cadence.time);
      return [zonedDateToUtc(day.year, day.month, day.day, h, m, timezone)];
    }
    case 'monthly_nth': {
      if (day.weekday !== cadence.weekday) return [];
      const ord = Math.floor((day.day - 1) / 7) + 1;
      if (ord !== cadence.nth) return [];
      const { h, m } = parseTime(cadence.time);
      return [zonedDateToUtc(day.year, day.month, day.day, h, m, timezone)];
    }
  }
}

/**
 * Return all renewal datetimes (UTC) in (after, after + horizonDays] for this
 * cadence in the given timezone.
 */
export function occurrencesBetween(
  cadence: Cadence,
  after: Date,
  horizonDays: number,
  timezone: string,
): Date[] {
  const out: Date[] = [];
  const horizonEnd = new Date(after.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const startParts = partsInZone(after, timezone);
  let cursor: ZonedParts = { ...startParts, hour: 0, minute: 0 };

  for (let i = 0; i <= horizonDays + 1; i++) {
    const candidates = candidatesForDay(cadence, cursor, timezone);
    for (const c of candidates) {
      if (c.getTime() > after.getTime() && c.getTime() <= horizonEnd.getTime()) {
        out.push(c);
      }
    }
    cursor = addDaysZoned(cursor, 1, timezone);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** First renewal strictly after `after`, or `null` if none within `lookAheadDays`. */
export function nextOccurrenceAfter(
  cadence: Cadence,
  after: Date,
  timezone: string,
  lookAheadDays = 35,
): Date | null {
  const occs = occurrencesBetween(cadence, after, lookAheadDays, timezone);
  return occs[0] ?? null;
}

/**
 * Convenience for the cadence-picker preview. Returns the next `count`
 * occurrences after `after`, with a horizon generous enough to find monthly
 * cadences ("Last Sunday of month at 6 PM" with `count=5` needs ~150 days).
 *
 * Returns an empty array if the cadence is incomplete (e.g. no days picked,
 * no times). Always inspect the result length before rendering.
 */
export function getUpcomingOccurrences(
  cadence: Cadence,
  timezone: string,
  count = 5,
  after: Date = new Date(),
): Date[] {
  if (!cadenceLooksComplete(cadence)) return [];
  const horizon = Math.max(7, count * 35);
  const all = occurrencesBetween(cadence, after, horizon, timezone);
  return all.slice(0, count);
}

/**
 * Cheap structural check before running the engine. Catches the common
 * incomplete-during-editing states (no days picked yet, no times added,
 * malformed `HH:MM`).
 */
export function cadenceLooksComplete(cadence: Cadence): boolean {
  const isTime = (t: string) => /^\d{2}:\d{2}$/.test(t);
  switch (cadence.kind) {
    case 'daily':
      return cadence.times.length > 0 && cadence.times.every(isTime);
    case 'weekly':
      return cadence.days.length > 0 && isTime(cadence.time);
    case 'every_n_days':
      return cadence.n >= 1 && isTime(cadence.time);
    case 'every_n_weeks':
      return cadence.n >= 1 && cadence.days.length > 0 && isTime(cadence.time);
    case 'monthly_dom':
      return cadence.day >= 1 && cadence.day <= 31 && isTime(cadence.time);
    case 'monthly_nth':
      return (
        cadence.nth >= 1 &&
        cadence.nth <= 5 &&
        cadence.weekday >= 0 &&
        cadence.weekday <= 6 &&
        isTime(cadence.time)
      );
  }
}
