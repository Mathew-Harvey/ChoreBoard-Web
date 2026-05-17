import { useMemo } from 'react';
import type { Cadence } from '../../lib/types';

/**
 * "Happens N times every day" — the most common case (morning, evening, plus
 * the occasional "three times a day"). Replaces the comma-separated text box
 * with a chip list each user can edit/remove individually, plus one-tap
 * presets for the common patterns.
 *
 * Power knob: an "Every N days" stepper tucked at the bottom flips the
 * output from `daily` to `every_n_days` for chores that don't fire every
 * day (it's grayed out when more than one time is set, since the data
 * model only supports a single time per N-day stride).
 */
export function DayTab({
  value,
  onChange,
}: {
  value: Cadence;
  onChange: (next: Cadence) => void;
}) {
  const times = currentTimes(value);
  const stride = value.kind === 'every_n_days' ? value.n : 1;

  const setTimes = (next: string[]) => {
    // Keep times sorted so the chips render in order regardless of edit history.
    const sorted = [...next].sort();
    if (stride > 1 && sorted.length === 1) {
      onChange({ kind: 'every_n_days', n: stride, time: sorted[0]! });
    } else {
      onChange({ kind: 'daily', times: sorted });
    }
  };

  const setStride = (n: number) => {
    const clamped = Math.max(1, Math.min(60, Math.floor(n) || 1));
    if (clamped <= 1) {
      onChange({ kind: 'daily', times: times.length ? times : ['09:00'] });
      return;
    }
    // every_n_days only supports a single time. Keep the first.
    onChange({ kind: 'every_n_days', n: clamped, time: times[0] ?? '09:00' });
  };

  const addTime = () => {
    const next = pickNextSuggestedTime(times);
    setTimes([...times, next]);
  };

  const replaceAt = (i: number, t: string) => {
    const copy = [...times];
    copy[i] = t;
    setTimes(copy);
  };

  const removeAt = (i: number) => {
    if (times.length <= 1) return;
    const copy = times.slice(0, i).concat(times.slice(i + 1));
    setTimes(copy);
  };

  const onPreset = (preset: string[]) => {
    onChange({ kind: 'daily', times: [...preset].sort() });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 24-hour ribbon with each fire time marked as a tick. Pure visual
          orientation — the chips below are the editable surface. */}
      <DayRibbon times={times} />

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Time{times.length === 1 ? '' : 's'} of day
          </span>
          <button
            type="button"
            className="text-xs font-semibold text-ink-900 underline decoration-ink-900/30 decoration-2 underline-offset-2 hover:decoration-ink-900"
            onClick={addTime}
            disabled={stride > 1 || times.length >= 6}
            title={
              stride > 1
                ? 'Every-N-days chores only support a single time'
                : times.length >= 6
                  ? 'Six times a day is the max'
                  : 'Add another time'
            }
          >
            + Add time
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {times.map((t, i) => (
            <TimeChip
              key={`${i}:${t}`}
              value={t}
              onChange={(next) => replaceAt(i, next)}
              onRemove={times.length > 1 ? () => removeAt(i) : undefined}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Quick presets
        </div>
        <div className="flex flex-wrap gap-2">
          <PresetButton
            label="Morning"
            sublabel="7:00 AM"
            active={timesEqual(times, ['07:00'])}
            onClick={() => onPreset(['07:00'])}
          />
          <PresetButton
            label="Evening"
            sublabel="5:00 PM"
            active={timesEqual(times, ['17:00'])}
            onClick={() => onPreset(['17:00'])}
          />
          <PresetButton
            label="Morning & evening"
            sublabel="7 AM, 5 PM"
            active={timesEqual(times, ['07:00', '17:00'])}
            onClick={() => onPreset(['07:00', '17:00'])}
          />
          <PresetButton
            label="Three times"
            sublabel="8 AM, 12 PM, 6 PM"
            active={timesEqual(times, ['08:00', '12:00', '18:00'])}
            onClick={() => onPreset(['08:00', '12:00', '18:00'])}
          />
        </div>
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
              max={60}
              className="input w-16 !py-1.5 text-center"
              value={stride}
              onChange={(e) => setStride(Number(e.target.value))}
            />
            <span className="text-ink-700">day{stride === 1 ? '' : 's'}</span>
          </label>
        </div>
        {stride > 1 && times.length > 1 && (
          <p className="mt-2 text-xs text-accent-red">
            "Every {stride} days" can only have a single time. Remove the extras to
            keep the schedule, or set "every 1 day" to keep multiple times.
          </p>
        )}
        {stride > 1 && times.length === 1 && (
          <p className="mt-2 text-xs text-ink-500">
            Anchored to the calendar — every {stride}{stride > 1 ? '' : ''} days from
            Jan 1, not from today. (Switch to Week or Month if you need a specific
            anchor.)
          </p>
        )}
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DayRibbon({ times }: { times: string[] }) {
  const ticks = useMemo(() => {
    return times
      .map((t) => parseTime(t))
      .filter((p): p is { h: number; m: number } => !!p)
      .map((p) => (p.h * 60 + p.m) / (24 * 60));
  }, [times]);
  return (
    <div className="relative h-10 select-none">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-cream-200 ring-2 ring-ink-900" />
      {[0, 6, 12, 18, 24].map((h) => (
        <div
          key={h}
          className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-between text-[9px] font-bold text-ink-500"
          style={{ left: `${(h / 24) * 100}%` }}
        >
          <span aria-hidden>{labelForHour(h)}</span>
          <span aria-hidden className="h-2 w-px bg-ink-500" />
        </div>
      ))}
      {ticks.map((frac, i) => (
        <div
          key={i}
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-orange ring-2 ring-ink-900 shadow-paper-sm"
          style={{ left: `${frac * 100}%` }}
          aria-hidden
        />
      ))}
    </div>
  );
}

function labelForHour(h: number): string {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

function TimeChip({
  value,
  onChange,
  onRemove,
}: {
  value: string;
  onChange: (next: string) => void;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2 py-1 ring-2 ring-ink-900 shadow-paper-sm">
      <input
        type="time"
        className="input !min-w-0 !rounded-full !border-0 !bg-transparent !px-2 !py-0.5 !text-sm !shadow-none !ring-0 focus:!ring-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-5 w-5 place-items-center rounded-full text-ink-500 hover:bg-cream-200 hover:text-ink-900"
          aria-label="Remove this time"
          title="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}

function PresetButton({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start rounded-lg px-3 py-2 text-left ring-2 ring-ink-900 transition active:translate-y-px ${
        active
          ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
          : 'bg-paper text-ink-900 hover:bg-cream-50'
      }`}
    >
      <span className="text-sm font-bold">{label}</span>
      <span className={`text-[11px] ${active ? 'text-cream-50/80' : 'text-ink-500'}`}>
        {sublabel}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentTimes(c: Cadence): string[] {
  if (c.kind === 'daily') return c.times;
  if (c.kind === 'every_n_days') return [c.time];
  return ['09:00'];
}

function parseTime(hhmm: string): { h: number; m: number } | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function timesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/**
 * Pick a reasonable default for a newly added time chip — slot in between
 * the existing entries, or fall back to common defaults if the list is
 * empty / clustered.
 */
function pickNextSuggestedTime(times: string[]): string {
  const candidates = ['07:00', '12:00', '17:00', '20:00', '09:00', '15:00'];
  for (const c of candidates) {
    if (!times.includes(c)) return c;
  }
  return '09:00';
}
