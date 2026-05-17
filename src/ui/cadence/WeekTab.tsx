import type { Cadence } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Happens on specific weekdays" — 7-column day strip you tap to toggle each
 * weekday, plus a single time picker. Optional "repeat every N weeks"
 * stepper for chores that don't happen every week.
 */
export function WeekTab({
  value,
  onChange,
}: {
  value: Cadence;
  onChange: (next: Cadence) => void;
}) {
  const days = currentDays(value);
  const time = currentTime(value);
  const stride = value.kind === 'every_n_weeks' ? value.n : 1;

  const setDays = (next: number[]) => {
    const sorted = [...new Set(next)].sort();
    emit(sorted, time, stride);
  };

  const setTime = (t: string) => emit(days, t, stride);

  const setStride = (n: number) => {
    const clamped = Math.max(1, Math.min(8, Math.floor(n) || 1));
    emit(days, time, clamped);
  };

  const emit = (d: number[], t: string, n: number) => {
    if (n > 1) {
      onChange({ kind: 'every_n_weeks', n, days: d, time: t });
    } else {
      onChange({ kind: 'weekly', days: d, time: t });
    }
  };

  const togglePreset = (preset: number[]) => setDays(preset);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Which days
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d, i) => {
            const selected = days.includes(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setDays(selected ? days.filter((x) => x !== i) : [...days, i])
                }
                aria-pressed={selected}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-bold ring-2 ring-ink-900 transition active:translate-y-px ${
                  selected
                    ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
                    : 'bg-paper text-ink-700 hover:bg-cream-50'
                }`}
              >
                <span>{d}</span>
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    selected ? 'bg-cream-50' : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <DayPreset label="Weekdays" days={[1, 2, 3, 4, 5]} current={days} onPick={togglePreset} />
          <DayPreset label="Weekends" days={[0, 6]} current={days} onPick={togglePreset} />
          <DayPreset label="Every day" days={[0, 1, 2, 3, 4, 5, 6]} current={days} onPick={togglePreset} />
        </div>
      </div>

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

      <details className="rounded-lg bg-cream-100 p-3 ring-1 ring-ink-900/10">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-700">
          More options
        </summary>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-700">Repeat every</span>
            <input
              type="number"
              min={1}
              max={8}
              className="input w-16 !py-1.5 text-center"
              value={stride}
              onChange={(e) => setStride(Number(e.target.value))}
            />
            <span className="text-ink-700">week{stride === 1 ? '' : 's'}</span>
          </label>
        </div>
        {stride > 1 && (
          <p className="mt-2 text-xs text-ink-500">
            "Every {stride} weeks" is anchored to the calendar (ISO epoch
            weeks), not to today. For a "starting on X" anchor, ping the team —
            it needs a backend change.
          </p>
        )}
      </details>
    </div>
  );
}

function DayPreset({
  label,
  days,
  current,
  onPick,
}: {
  label: string;
  days: number[];
  current: number[];
  onPick: (days: number[]) => void;
}) {
  const active =
    days.length === current.length && days.every((d) => current.includes(d));
  return (
    <button
      type="button"
      onClick={() => onPick(days)}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-2 ring-ink-900 transition active:translate-y-px ${
        active
          ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
          : 'bg-paper text-ink-900 hover:bg-cream-50'
      }`}
    >
      {label}
    </button>
  );
}

function currentDays(c: Cadence): number[] {
  if (c.kind === 'weekly' || c.kind === 'every_n_weeks') return c.days;
  return [1, 3, 5];
}

function currentTime(c: Cadence): string {
  if (c.kind === 'weekly' || c.kind === 'every_n_weeks') return c.time;
  if (c.kind === 'every_n_days') return c.time;
  if (c.kind === 'monthly_dom' || c.kind === 'monthly_nth') return c.time;
  if (c.kind === 'daily') return c.times[0] ?? '09:00';
  return '09:00';
}
