import { useMemo } from 'react';
import type { Cadence } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINALS = [
  { nth: 1, label: '1st' },
  { nth: 2, label: '2nd' },
  { nth: 3, label: '3rd' },
  { nth: 4, label: '4th' },
  { nth: 5, label: 'Last' },
] as const;

/**
 * "Happens on a specific date each month" — two modes:
 *   - "By date": a 1-31 mini calendar grid (tap a day).
 *   - "By weekday position": pick "1st / 2nd / 3rd / 4th / Last" + a weekday.
 *     A preview row shows the next match in the current month so the user
 *     can sanity-check ("3rd Wednesday → Mar 18").
 */
export function MonthTab({
  value,
  onChange,
}: {
  value: Cadence;
  onChange: (next: Cadence) => void;
}) {
  const mode: 'dom' | 'nth' =
    value.kind === 'monthly_nth' ? 'nth' : 'dom';
  const time = currentTime(value);

  const setMode = (next: 'dom' | 'nth') => {
    if (next === mode) return;
    if (next === 'dom') {
      onChange({ kind: 'monthly_dom', day: 1, time });
    } else {
      onChange({ kind: 'monthly_nth', nth: 1, weekday: 1, time });
    }
  };

  const setDom = (day: number) => {
    onChange({ kind: 'monthly_dom', day, time });
  };
  const setNth = (nth: number) => {
    const weekday = value.kind === 'monthly_nth' ? value.weekday : 1;
    onChange({ kind: 'monthly_nth', nth, weekday, time });
  };
  const setWeekday = (weekday: number) => {
    const nth = value.kind === 'monthly_nth' ? value.nth : 1;
    onChange({ kind: 'monthly_nth', nth, weekday, time });
  };
  const setTime = (t: string) => {
    if (value.kind === 'monthly_dom') {
      onChange({ kind: 'monthly_dom', day: value.day, time: t });
    } else if (value.kind === 'monthly_nth') {
      onChange({
        kind: 'monthly_nth',
        nth: value.nth,
        weekday: value.weekday,
        time: t,
      });
    } else {
      onChange({ kind: 'monthly_dom', day: 1, time: t });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid grid-cols-2 gap-1.5 rounded-xl bg-cream-200 p-1 ring-2 ring-ink-900">
        <ModeTab label="By date" active={mode === 'dom'} onClick={() => setMode('dom')} />
        <ModeTab label="By weekday position" active={mode === 'nth'} onClick={() => setMode('nth')} />
      </div>

      {mode === 'dom' ? (
        <ByDateGrid
          selectedDay={value.kind === 'monthly_dom' ? value.day : 1}
          onPick={setDom}
        />
      ) : (
        <ByWeekdayPosition
          nth={value.kind === 'monthly_nth' ? value.nth : 1}
          weekday={value.kind === 'monthly_nth' ? value.weekday : 1}
          onPickNth={setNth}
          onPickWeekday={setWeekday}
        />
      )}

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Time of day
        </div>
        <input
          type="time"
          className="input"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode tab pill
// ---------------------------------------------------------------------------

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-bold transition active:translate-y-px ${
        active
          ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
          : 'text-ink-700 hover:bg-cream-100'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// "By date" — 1..31 grid
// ---------------------------------------------------------------------------

function ByDateGrid({
  selectedDay,
  onPick,
}: {
  selectedDay: number;
  onPick: (day: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        Day of month
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
          const active = d === selectedDay;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={active}
              className={`aspect-square rounded-lg text-sm font-bold ring-2 ring-ink-900 transition active:translate-y-px ${
                active
                  ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
                  : 'bg-paper text-ink-700 hover:bg-cream-50'
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      {selectedDay >= 29 && (
        <p className="mt-2 text-xs text-ink-500">
          Months without a {selectedDay}{ordSuffix(selectedDay)} won't fire that
          month (Feb, and 30/31-day quirks). Pick "Last weekday" if you want
          it every month.
        </p>
      )}
    </div>
  );
}

function ordSuffix(n: number): string {
  if (n === 1 || n === 21 || n === 31) return 'st';
  if (n === 2 || n === 22) return 'nd';
  if (n === 3 || n === 23) return 'rd';
  return 'th';
}

// ---------------------------------------------------------------------------
// "By weekday position" — 1st/2nd/3rd/4th/Last + weekday chips
// ---------------------------------------------------------------------------

function ByWeekdayPosition({
  nth,
  weekday,
  onPickNth,
  onPickWeekday,
}: {
  nth: number;
  weekday: number;
  onPickNth: (n: number) => void;
  onPickWeekday: (w: number) => void;
}) {
  const previewDate = useMemo(
    () => computePreviewDate(nth, weekday, new Date()),
    [nth, weekday],
  );
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Which one
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {ORDINALS.map((o) => {
            const active = o.nth === nth;
            return (
              <button
                key={o.nth}
                type="button"
                onClick={() => onPickNth(o.nth)}
                aria-pressed={active}
                className={`rounded-lg py-2 text-sm font-bold ring-2 ring-ink-900 transition active:translate-y-px ${
                  active
                    ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
                    : 'bg-paper text-ink-700 hover:bg-cream-50'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Of which weekday
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d, i) => {
            const active = i === weekday;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPickWeekday(i)}
                aria-pressed={active}
                className={`rounded-lg py-2 text-xs font-bold ring-2 ring-ink-900 transition active:translate-y-px ${
                  active
                    ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
                    : 'bg-paper text-ink-700 hover:bg-cream-50'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      {previewDate && (
        <p className="rounded-lg bg-cream-100 px-3 py-2 text-xs text-ink-700 ring-1 ring-ink-900/10">
          This {nth === 5 ? 'last' : ORDINALS.find((o) => o.nth === nth)?.label.toLowerCase()}{' '}
          {DAYS[weekday]} lands on{' '}
          <strong className="font-semibold">
            {previewDate.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </strong>{' '}
          this month.
        </p>
      )}
    </div>
  );
}

/**
 * Find the date in the current month that matches a given (nth, weekday)
 * combination. `nth === 5` is interpreted as "last occurrence of this
 * weekday in the month". Returns `null` if no match exists (e.g. asking
 * for the 5th Friday of a 28-day February).
 */
function computePreviewDate(nth: number, weekday: number, anchor: Date): Date | null {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matches: Date[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === weekday) matches.push(date);
  }
  if (matches.length === 0) return null;
  if (nth === 5) return matches[matches.length - 1] ?? null;
  return matches[nth - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentTime(c: Cadence): string {
  if (c.kind === 'monthly_dom' || c.kind === 'monthly_nth') return c.time;
  if (c.kind === 'weekly' || c.kind === 'every_n_weeks' || c.kind === 'every_n_days') {
    return c.time;
  }
  if (c.kind === 'daily') return c.times[0] ?? '10:00';
  return '10:00';
}
