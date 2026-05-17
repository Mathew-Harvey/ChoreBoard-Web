import { useMemo } from 'react';
import type { Cadence } from '../../lib/types';
import { DayTab } from './DayTab';
import { WeekTab } from './WeekTab';
import { MonthTab } from './MonthTab';
import { NextRunsPreview } from './NextRunsPreview';

/**
 * Calendar-style cadence picker for the admin chore catalog. Three tabs map
 * to the three mental models parents actually have ("how many times a day",
 * "which days each week", "which date each month") and each one constrains
 * its inputs to produce a valid `Cadence` for the existing API contract.
 *
 * Below the tabs, a live "Next 5 runs" preview rendered in the family
 * timezone shows when the chore will actually fire — so a parent never has
 * to guess what their settings translate to.
 */
export function CadencePicker({
  value,
  onChange,
  timezone,
}: {
  value: Cadence;
  onChange: (next: Cadence) => void;
  /** Family IANA timezone — drives both the engine math and the preview formatter. */
  timezone: string;
}) {
  const tab = tabFor(value.kind);
  const switchTab = (next: TabId) => {
    if (next === tab) return;
    onChange(defaultForTab(next));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-cream-50 p-3 ring-2 ring-ink-900 sm:p-4">
      <div className="flex items-baseline justify-between">
        <span className="page-tag">CADENCE</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-500">
          {timezone}
        </span>
      </div>

      <TabStrip current={tab} onPick={switchTab} />

      <div className="rounded-xl bg-paper p-3 ring-1 ring-ink-900/15 sm:p-4">
        {tab === 'day' && <DayTab value={value} onChange={onChange} />}
        {tab === 'week' && <WeekTab value={value} onChange={onChange} />}
        {tab === 'month' && <MonthTab value={value} onChange={onChange} />}
      </div>

      <NextRunsPreview cadence={value} timezone={timezone} count={5} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

type TabId = 'day' | 'week' | 'month';

const TABS: Array<{ id: TabId; label: string; glyph: string; hint: string }> = [
  { id: 'day', label: 'Day', glyph: '🕐', hint: 'Times each day' },
  { id: 'week', label: 'Week', glyph: '📅', hint: 'Days each week' },
  { id: 'month', label: 'Month', glyph: '🗓️', hint: 'Dates each month' },
];

function TabStrip({
  current,
  onPick,
}: {
  current: TabId;
  onPick: (next: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Cadence cadence"
      className="grid grid-cols-3 gap-1.5 rounded-xl bg-cream-200 p-1 ring-2 ring-ink-900"
    >
      {TABS.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPick(t.id)}
            className={`flex flex-col items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition active:translate-y-px ${
              active
                ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
                : 'text-ink-700 hover:bg-cream-100'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-sm leading-none">
                {t.glyph}
              </span>
              <span className="text-sm font-bold">{t.label}</span>
            </span>
            <span
              className={`text-[10px] font-normal ${active ? 'text-cream-50/80' : 'text-ink-500'}`}
            >
              {t.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab <-> Cadence kind mapping
// ---------------------------------------------------------------------------

function tabFor(kind: Cadence['kind']): TabId {
  switch (kind) {
    case 'daily':
    case 'every_n_days':
      return 'day';
    case 'weekly':
    case 'every_n_weeks':
      return 'week';
    case 'monthly_dom':
    case 'monthly_nth':
      return 'month';
  }
}

function defaultForTab(tab: TabId): Cadence {
  switch (tab) {
    case 'day':
      return { kind: 'daily', times: ['09:00'] };
    case 'week':
      return { kind: 'weekly', days: [1, 3, 5], time: '09:00' };
    case 'month':
      return { kind: 'monthly_dom', day: 1, time: '10:00' };
  }
}

/** Re-exported so call sites can validate before save without rebuilding the rules. */
export { cadenceLooksComplete as isCadenceValid } from '../../lib/cadence';

/**
 * Hook used by the surrounding form to know which sensible "starter" cadence
 * to seed when a brand-new chore is created. Memoized for stability across
 * re-renders.
 */
export function useDefaultCadence(): Cadence {
  return useMemo<Cadence>(() => ({ kind: 'daily', times: ['09:00'] }), []);
}
