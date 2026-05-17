import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money, relativePast } from '../lib/format';
import {
  dayKeyToZonedDate,
  dayKeyToZonedEndOfDay,
  formatShortDate,
  formatWeekRange,
  localDayKey,
} from '../lib/time';
import type {
  BoardResponse,
  HistoryBiggestSingle,
  HistoryDayBucket,
  HistoryDayOfWeekRow,
  HistoryMostRepeated,
  HistoryPreset,
  HistoryResponse,
  HistoryWeekRow,
  MemberType,
} from '../lib/types';
import {
  DesktopTitle,
  MemberAvatar,
  ProgressBar,
} from '../ui/primitives';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonDesktop } from '../ui/Skeleton';

/**
 * History desktop: a single rich page that lets any family member look
 * back at how their household has been performing — weeks gone by, the
 * full lifetime, or any custom date window. All data is scoped to the
 * authenticated family by the API; this component only ever passes
 * filters through.
 *
 * Filters live entirely in local state (preset / custom from-to /
 * optional member focus) and re-trigger the `useQuery` via its key,
 * so React Query handles caching and de-dupes redundant requests.
 */

type Filter =
  | { kind: 'preset'; preset: HistoryPreset }
  | { kind: 'custom'; from: string; to: string };

type MemberFilter =
  | { kind: 'all' }
  | { kind: 'member'; type: MemberType; id: string };

const PRESETS: Array<{ id: HistoryPreset; label: string; glyph: string }> = [
  { id: 'this_week', label: 'This week', glyph: '📅' },
  { id: 'last_week', label: 'Last week', glyph: '🗓' },
  { id: 'last_4_weeks', label: 'Last 4 weeks', glyph: '🗓' },
  { id: 'this_month', label: 'This month', glyph: '📆' },
  { id: 'last_3_months', label: 'Last 3 months', glyph: '📆' },
  { id: 'this_year', label: 'This year', glyph: '🎯' },
  { id: 'all_time', label: 'All time', glyph: '∞' },
];

export function HistoryDesktop({ board }: { board?: BoardResponse }) {
  // URL is the source of truth for filter state — that makes the
  // dashboard view shareable via copy/paste and survives page reloads.
  // We sync both directions: read on first render, write on every
  // user-driven change.
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilterState] = useState<Filter>(() =>
    parseFilterFromUrl(searchParams),
  );
  const [memberFilter, setMemberFilterState] = useState<MemberFilter>(() =>
    parseMemberFromUrl(searchParams),
  );
  const [csvBusy, setCsvBusy] = useState(false);

  const writeUrl = (f: Filter, m: MemberFilter) => {
    const next = new URLSearchParams(searchParams);
    // Strip the keys we own so toggling Custom → Preset doesn't leave
    // a stale from/to behind in the URL.
    for (const k of ['p', 'from', 'to', 'mt', 'mid']) next.delete(k);
    if (f.kind === 'preset') {
      next.set('p', f.preset);
    } else {
      if (f.from) next.set('from', f.from);
      if (f.to) next.set('to', f.to);
    }
    if (m.kind === 'member') {
      next.set('mt', m.type);
      next.set('mid', m.id);
    }
    setSearchParams(next, { replace: true });
  };

  const setFilter = (f: Filter) => {
    setFilterState(f);
    writeUrl(f, memberFilter);
  };
  const setMemberFilter = (m: MemberFilter) => {
    setMemberFilterState(m);
    writeUrl(filter, m);
  };

  const tz = board?.family.timezone ?? 'UTC';

  // Build the API query string once — re-used for the JSON fetch and
  // the CSV download anchor below.
  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filter.kind === 'preset') {
      params.set('preset', filter.preset);
    } else {
      if (filter.from) params.set('from', toIsoStart(filter.from, tz));
      if (filter.to) params.set('to', toIsoEnd(filter.to, tz));
    }
    if (memberFilter.kind === 'member') {
      params.set('memberType', memberFilter.type);
      params.set('memberId', memberFilter.id);
    }
    return params.toString();
  }, [filter, memberFilter, tz]);

  // Cache key reflects everything that changes the response shape. The
  // SSE bus invalidates `['history']` (prefix match), so any in-flight
  // filter combination gets refreshed when an event lands.
  const queryKey = useMemo(
    () => ['history', filter, memberFilter] as const,
    [filter, memberFilter],
  );

  const historyQ = useQuery({
    queryKey,
    queryFn: () => api.get<HistoryResponse>(`/api/stats/history?${apiQuery}`),
    // SSE handles "live" updates; this is a cheap belt-and-braces poll
    // in case the bus dropped a message.
    refetchInterval: 2 * 60_000,
    placeholderData: (prev) => prev,
  });

  const data = historyQ.data;

  const downloadCsv = async () => {
    setCsvBusy(true);
    try {
      const csv = await api.get<string>(`/api/stats/history.csv?${apiQuery}`);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data ? historyCsvFilename(data) : 'choreboard-history.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.alert('Could not download the history CSV. Please try again.');
    } finally {
      setCsvBusy(false);
    }
  };

  if (!board || (!data && historyQ.isLoading)) {
    return <SkeletonDesktop />;
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7 2xl:p-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 sm:gap-6 2xl:gap-8">
        <DesktopTitle
          date={
            board?.family.name
              ? `${board.family.name.toUpperCase()} · HISTORY`
              : 'HISTORY'
          }
          title="The story so far"
          subtitle="Weeks gone by, lifetime totals, and any window in between — all in one place."
          right={
            <button
              type="button"
              className="btn-secondary"
              onClick={downloadCsv}
              disabled={csvBusy}
              title="Download daily totals for the current filter as CSV"
            >
              <span aria-hidden>⬇</span> {csvBusy ? 'Exporting…' : 'CSV'}
            </button>
          }
        />

        <FilterStrip
          filter={filter}
          setFilter={setFilter}
          memberFilter={memberFilter}
          setMemberFilter={setMemberFilter}
          board={board}
        />

        {!data ? (
          <SkeletonDesktop />
        ) : data.totals.chores === 0 && data.weeks.length === 0 ? (
          <section className="card p-6 sm:p-10">
            <EmptyState
              illustration="activity"
              title={`Nothing here yet for ${data.range.label.toLowerCase()}`}
              body="Try a wider window or wait for the next approved chore to land in this period."
            />
          </section>
        ) : (
          <>
            <HeroTotals data={data} />
            <HighlightsRow data={data} tz={tz} />
            <TrendCard
              daily={data.daily}
              previousDaily={data.previousDaily}
              previousLabel={data.range.label.toLowerCase()}
              tz={tz}
            />
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] 2xl:gap-6">
              <MemberLeaderboard
                data={data}
                memberFilter={memberFilter}
                onPickMember={(m) => setMemberFilter(m)}
              />
              <ChoresLeaderboard data={data} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] 2xl:gap-6">
              <StatusBreakdown data={data} />
              <BestDayCard data={data} tz={tz} />
            </div>
            <DayOfWeekCard rows={data.byDayOfWeek} />
            <WeeksTable data={data} tz={tz} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter strip
// ---------------------------------------------------------------------------

function FilterStrip({
  filter,
  setFilter,
  memberFilter,
  setMemberFilter,
  board,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  memberFilter: MemberFilter;
  setMemberFilter: (m: MemberFilter) => void;
  board: BoardResponse;
}) {
  const tz = board.family.timezone;
  // Member-focus list: kids first (in roster order) then parents — matches
  // the family-dashboard reading order so the chips feel familiar.
  const members = useMemo(() => {
    const kids = board.kids.map((k) => ({
      type: 'kid' as const,
      id: k.id,
      name: k.name,
      color: k.color,
    }));
    const parents = board.parents.map((p) => ({
      type: 'user' as const,
      id: p.id,
      name: p.name,
      color: p.color as string | undefined,
    }));
    return [...kids, ...parents];
  }, [board.kids, board.parents]);

  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5 2xl:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="page-tag mr-1">When</span>
        {PRESETS.map((p) => {
          const active = filter.kind === 'preset' && filter.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilter({ kind: 'preset', preset: p.id })}
              aria-pressed={active}
              className={chipClass(active)}
            >
              <span aria-hidden className="mr-1 text-sm leading-none">
                {p.glyph}
              </span>
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            if (filter.kind !== 'custom') {
              const today = new Date();
              const monthAgo = new Date(today.getTime() - 30 * 86_400_000);
              setFilter({
                kind: 'custom',
                from: dateInputValue(monthAgo, tz),
                to: dateInputValue(today, tz),
              });
            }
          }}
          aria-pressed={filter.kind === 'custom'}
          className={chipClass(filter.kind === 'custom')}
        >
          <span aria-hidden className="mr-1 text-sm leading-none">
            🎚
          </span>
          Custom
        </button>
      </div>

      {filter.kind === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="page-tag">From</span>
            <input
              type="date"
              className="input !py-1.5"
              value={filter.from}
              max={filter.to || undefined}
              onChange={(e) =>
                setFilter({ ...filter, from: e.target.value })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="page-tag">To</span>
            <input
              type="date"
              className="input !py-1.5"
              value={filter.to}
              min={filter.from || undefined}
              max={dateInputValue(new Date(), tz)}
              onChange={(e) => setFilter({ ...filter, to: e.target.value })}
            />
          </label>
        </div>
      )}

      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="page-tag mr-1">Who</span>
          <button
            type="button"
            onClick={() => setMemberFilter({ kind: 'all' })}
            aria-pressed={memberFilter.kind === 'all'}
            className={chipClass(memberFilter.kind === 'all')}
          >
            <span aria-hidden className="mr-1 text-sm leading-none">
              👨‍👩‍👧
            </span>
            Whole family
          </button>
          {members.map((m) => {
            const active =
              memberFilter.kind === 'member' &&
              memberFilter.type === m.type &&
              memberFilter.id === m.id;
            return (
              <button
                key={`${m.type}:${m.id}`}
                type="button"
                onClick={() =>
                  setMemberFilter({ kind: 'member', type: m.type, id: m.id })
                }
                aria-pressed={active}
                className={`group inline-flex items-center gap-1.5 ${chipClass(active)}`}
                style={
                  active && m.color
                    ? { backgroundColor: m.color, borderColor: m.color }
                    : undefined
                }
              >
                <MemberAvatar
                  name={m.name}
                  color={m.color}
                  size="xs"
                  className="!h-5 !w-5 !text-[10px] !ring-1"
                />
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function chipClass(active: boolean): string {
  return active
    ? 'inline-flex items-center rounded-full bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cream-50 ring-2 ring-ink-900 shadow-paper-sm sm:text-[13px]'
    : 'inline-flex items-center rounded-full bg-cream-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-700 ring-2 ring-ink-900/20 hover:bg-cream-200 hover:text-ink-900 sm:text-[13px]';
}

// ---------------------------------------------------------------------------
// Hero totals + delta
// ---------------------------------------------------------------------------

function HeroTotals({ data }: { data: HistoryResponse }) {
  const { totals, range } = data;
  const deltaPct = totals.deltaPct;
  const deltaCents = totals.deltaCents;
  const hasDelta = deltaCents != null;
  const positive = (deltaCents ?? 0) > 0;
  const negative = (deltaCents ?? 0) < 0;

  return (
    <section className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-stretch sm:justify-between sm:gap-8 sm:p-8 2xl:p-12">
      <div className="min-w-0 flex-1">
        <div className="page-tag mb-2">{range.label.toUpperCase()}</div>
        <AnimatedNumber
          value={totals.cents}
          format={money}
          className="block font-display text-fluid-money font-extrabold tabular-nums tracking-tight text-money"
        />
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-500 sm:text-base">
          <span>
            <strong className="text-ink-900 tabular-nums">
              {totals.chores.toLocaleString()}
            </strong>{' '}
            chore{totals.chores === 1 ? '' : 's'} approved
          </span>
          <span>
            <strong className="text-ink-900 tabular-nums">
              {money(totals.avgPerChoreCents)}
            </strong>{' '}
            avg / chore
          </span>
          <span>
            <strong className="text-ink-900 tabular-nums">
              {money(totals.avgPerDayCents)}
            </strong>{' '}
            avg / day
          </span>
        </div>
        {hasDelta && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className={`pill whitespace-nowrap ${
                positive
                  ? 'bg-money/20 text-money'
                  : negative
                    ? 'bg-accent-red/15 text-accent-red'
                    : ''
              }`}
            >
              {positive ? '▲' : negative ? '▼' : '◆'}{' '}
              {money(Math.abs(deltaCents ?? 0))}
              {deltaPct != null && (
                <> ({(Math.abs(deltaPct) * 100).toFixed(0)}%)</>
              )}
            </span>
            <span className="text-xs text-ink-500 sm:text-sm">
              vs previous {range.label.toLowerCase()}
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:items-end sm:justify-between sm:gap-3">
        <HeroStat
          tag="Active members"
          value={String(totals.activeMembers)}
          caption={totals.activeMembers === 1 ? 'earner' : 'earners'}
        />
        <HeroStat
          tag="Span"
          value={String(range.days)}
          caption={range.days === 1 ? 'day' : 'days'}
        />
      </div>
    </section>
  );
}

function HeroStat({
  tag,
  value,
  caption,
}: {
  tag: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-2xl bg-cream-50 p-3 ring-2 ring-ink-900/15 sm:px-4 sm:py-3">
      <div className="page-tag">{tag}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-extrabold tabular-nums sm:text-3xl">
          {value}
        </span>
        <span className="text-xs text-ink-500 sm:text-sm">{caption}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart (inline SVG — no chart dep)
// ---------------------------------------------------------------------------

function TrendCard({
  daily,
  previousDaily,
  previousLabel,
  tz,
}: {
  daily: HistoryDayBucket[];
  previousDaily: HistoryDayBucket[];
  previousLabel: string;
  tz: string;
}) {
  // We collapse very long ranges into weekly buckets so the bar chart
  // stays legible on phones. The threshold (>60 bars) is just an
  // aesthetic choice — at smaller counts each daily column is wide
  // enough to read at a glance.
  const groupedCurrent = useMemo<HistoryDayBucket[]>(
    () => groupForChart(daily),
    [daily],
  );
  const groupedPrevious = useMemo<HistoryDayBucket[]>(
    () => groupForChart(previousDaily),
    [previousDaily],
  );

  const grouping = daily.length <= 60 ? 'day' : 'week';
  // Shared scale so current and previous bars are visually comparable.
  const peakCurrent = Math.max(0, ...groupedCurrent.map((d) => d.cents));
  const peakPrevious = Math.max(0, ...groupedPrevious.map((d) => d.cents));
  const max = Math.max(1, peakCurrent, peakPrevious);
  // SVG viewbox numbers. The viewbox always represents 100×40 logical
  // units; we let `preserveAspectRatio="none"` stretch it to the
  // container so we can keep bar math simple.
  const W = 100;
  const H = 40;
  const gap = groupedCurrent.length > 14 ? 1 : 2;
  const barWidth =
    groupedCurrent.length > 0
      ? (W - gap * (groupedCurrent.length - 1)) / groupedCurrent.length
      : 0;
  const hasPrevious = groupedPrevious.some((d) => d.cents > 0);

  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <div className="page-tag mb-1">Earnings trend</div>
          <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
            {grouping === 'day' ? 'Daily' : 'Weekly'} totals
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-500 sm:text-sm">
          {hasPrevious && (
            <span
              className="inline-flex items-center gap-1.5"
              title={`Previous ${previousLabel} overlay`}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: 'rgba(16,24,43,0.18)' }}
              />
              Prev {previousLabel}
            </span>
          )}
          <span>Peak {money(max)}</span>
        </div>
      </header>

      {groupedCurrent.length === 0 ? (
        <EmptyState
          illustration="activity"
          title="No data in this window"
          body="Pick a different range or wait for the next payday."
          compact
        />
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H + 6}`}
            className="block h-40 w-full sm:h-52 2xl:h-64"
            preserveAspectRatio="none"
            aria-hidden
          >
            <line
              x1={0}
              x2={W}
              y1={H}
              y2={H}
              stroke="#10182B"
              strokeWidth="0.4"
              opacity={0.25}
            />
            {/* Ghost bars first so the current period sits on top. */}
            {hasPrevious &&
              groupedCurrent.map((_, i) => {
                const prev = groupedPrevious[i];
                if (!prev || prev.cents === 0) return null;
                const ratio = prev.cents / max;
                const h = Math.max(0.6, ratio * H);
                const x = i * (barWidth + gap);
                const y = H - h;
                return (
                  <rect
                    key={`prev-${i}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    rx={Math.min(0.8, barWidth / 3)}
                    fill="rgba(16,24,43,0.18)"
                  >
                    <title>{`Prev ${humanLabel(prev.date, grouping === 'week', tz)}: ${money(prev.cents)}`}</title>
                  </rect>
                );
              })}
            {groupedCurrent.map((d, i) => {
              const ratio = d.cents / max;
              const h = Math.max(d.cents > 0 ? 0.6 : 0, ratio * H);
              const x = i * (barWidth + gap);
              const y = H - h;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={Math.min(0.8, barWidth / 3)}
                  fill="#E8B12A"
                  stroke="#10182B"
                  strokeWidth="0.3"
                >
                  <title>{`${humanLabel(d.date, grouping === 'week', tz)}: ${money(d.cents)} · ${d.chores} chore${d.chores === 1 ? '' : 's'}`}</title>
                </rect>
              );
            })}
          </svg>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-500 sm:text-xs">
            <span>
              {humanLabel(groupedCurrent[0]?.date ?? '', grouping === 'week', tz)}
            </span>
            <span>
              {humanLabel(
                groupedCurrent[groupedCurrent.length - 1]?.date ?? '',
                grouping === 'week',
                tz,
              )}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function groupForChart(daily: HistoryDayBucket[]): HistoryDayBucket[] {
  if (daily.length <= 60) return daily;
  const out: HistoryDayBucket[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const slice = daily.slice(i, i + 7);
    const cents = slice.reduce((a, b) => a + b.cents, 0);
    const chores = slice.reduce((a, b) => a + b.chores, 0);
    // Tag bucket by its first date — that's what the tooltip shows.
    out.push({ date: slice[0]?.date ?? '', cents, chores });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Member leaderboard for the range
// ---------------------------------------------------------------------------

function MemberLeaderboard({
  data,
  memberFilter,
  onPickMember,
}: {
  data: HistoryResponse;
  memberFilter: MemberFilter;
  onPickMember: (m: MemberFilter) => void;
}) {
  const entries = data.byMember;
  const max = Math.max(1, ...entries.map((e) => e.cents));
  const isFocused = memberFilter.kind === 'member';

  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
        <div>
          <div className="page-tag mb-1">
            {isFocused ? 'Spotlight' : 'Leaderboard'}
          </div>
          <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
            {isFocused ? 'Just this member' : 'Top earners'}
          </h2>
        </div>
        {isFocused && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onPickMember({ kind: 'all' })}
          >
            Show everyone
          </button>
        )}
      </header>
      {entries.length === 0 ? (
        <EmptyState
          illustration="leaderboard"
          title="No earners in this window"
          body="Pick a wider range and they’ll show up."
          compact
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((e, i) => (
            <li
              key={`${e.memberType}:${e.memberId}`}
              className="flex items-center gap-3"
            >
              <span className="w-4 text-right text-sm font-semibold text-ink-500">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() =>
                  onPickMember(
                    isFocused
                      ? { kind: 'all' }
                      : { kind: 'member', type: e.memberType, id: e.memberId },
                  )
                }
                className="flex flex-1 items-center gap-3 rounded-lg p-1 text-left transition hover:bg-cream-50"
                title={
                  isFocused
                    ? 'Show everyone'
                    : `Focus on ${e.name} only`
                }
              >
                <MemberAvatar name={e.name} color={e.color} size="sm" />
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 truncate text-sm font-semibold sm:text-base">
                        <span className="truncate">{e.name}</span>
                        {i === 0 && entries.length > 1 && (
                          <span aria-hidden>👑</span>
                        )}
                        <span className="text-xs text-ink-500">
                          · {e.chores} chore{e.chores === 1 ? '' : 's'}
                        </span>
                      </span>
                      <AnimatedNumber
                        value={e.cents}
                        format={money}
                        className="money-amt text-sm sm:text-base"
                      />
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        percent={(e.cents / max) * 100}
                        color={e.color ?? '#10182B'}
                        height="sm"
                      />
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chore leaderboard for the range
// ---------------------------------------------------------------------------

function ChoresLeaderboard({ data }: { data: HistoryResponse }) {
  const entries = data.byChore;
  const max = Math.max(1, ...entries.map((e) => e.cents));

  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-4">
        <div className="page-tag mb-1">Where the money went</div>
        <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
          Top chores
        </h2>
      </header>
      {entries.length === 0 ? (
        <EmptyState
          illustration="ledger"
          title="No paid chores in this window"
          compact
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((e, i) => (
            <li key={e.choreId} className="flex items-center gap-3">
              <span className="w-4 text-right text-sm font-semibold text-ink-500">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold sm:text-base">
                    {e.name}
                  </span>
                  <span className="money-amt text-sm sm:text-base">
                    {money(e.cents)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ProgressBar
                    percent={(e.cents / max) * 100}
                    color="#3253D7"
                    height="sm"
                  />
                  <span className="shrink-0 text-xs text-ink-500">
                    ×{e.count}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Status breakdown
// ---------------------------------------------------------------------------

function StatusBreakdown({ data }: { data: HistoryResponse }) {
  const { approved, missed, rejected } = data.statusBreakdown;
  const total = approved + missed + rejected;
  const reliability = total > 0 ? approved / total : null;

  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-4">
        <div className="page-tag mb-1">Reliability</div>
        <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
          {reliability == null
            ? 'No completions yet'
            : `${(reliability * 100).toFixed(0)}% on track`}
        </h2>
      </header>
      {total === 0 ? (
        <p className="text-sm text-ink-500">
          No approved, missed, or rejected chores in this window.
        </p>
      ) : (
        <>
          <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-cream-200 ring-2 ring-ink-900/15">
            <div
              className="h-full"
              style={{
                width: `${(approved / total) * 100}%`,
                backgroundColor: '#0F6E37',
              }}
              title={`${approved} approved`}
            />
            <div
              className="h-full"
              style={{
                width: `${(missed / total) * 100}%`,
                backgroundColor: '#E07E2E',
              }}
              title={`${missed} missed`}
            />
            <div
              className="h-full"
              style={{
                width: `${(rejected / total) * 100}%`,
                backgroundColor: '#C44545',
              }}
              title={`${rejected} rejected`}
            />
          </div>
          <ul className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
            <StatusLegend label="Approved" color="#0F6E37" value={approved} />
            <StatusLegend label="Missed" color="#E07E2E" value={missed} />
            <StatusLegend label="Rejected" color="#C44545" value={rejected} />
          </ul>
        </>
      )}
    </section>
  );
}

function StatusLegend({
  label,
  color,
  value,
}: {
  label: string;
  color: string;
  value: number;
}) {
  return (
    <li className="rounded-xl bg-cream-50 px-3 py-2 ring-2 ring-ink-900/15">
      <span
        aria-hidden
        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
        style={{ backgroundColor: color }}
      />
      <span className="font-semibold text-ink-700">{label}</span>
      <div className="mt-0.5 font-display text-lg font-extrabold tabular-nums">
        {value}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Best day card
// ---------------------------------------------------------------------------

function BestDayCard({ data, tz }: { data: HistoryResponse; tz: string }) {
  const best = data.totals.bestDay;
  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-3">
        <div className="page-tag mb-1">Personal best</div>
        <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
          Best day
        </h2>
      </header>
      {!best ? (
        <p className="text-sm text-ink-500">
          No earnings in this window yet — make one happen!
        </p>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-3xl font-extrabold tabular-nums text-money sm:text-4xl 2xl:text-5xl">
              {money(best.cents)}
            </div>
            <div className="mt-1 text-sm text-ink-500 sm:text-base">
              {humanLabel(best.date, false, tz)} ·{' '}
              {best.chores} chore{best.chores === 1 ? '' : 's'}
            </div>
          </div>
          <span className="pill bg-money/20 text-money">🎉 Top day</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Weeks gone by table
// ---------------------------------------------------------------------------

function WeeksTable({ data, tz }: { data: HistoryResponse; tz: string }) {
  if (data.weeks.length === 0) {
    return null;
  }
  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
        <div>
          <div className="page-tag mb-1">Weeks gone by</div>
          <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
            Closed weeks in this window
          </h2>
        </div>
        <span className="text-xs text-ink-500 sm:text-sm">
          {data.weeks.length} week{data.weeks.length === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="flex flex-col gap-2">
        {data.weeks.map((w) => (
          <li
            key={w.id}
            className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900/10 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center sm:p-4"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                {weekRangeLabel(w.startsAt, w.endsAt, tz)}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-display text-base font-extrabold sm:text-lg">
                  {w.championName ? (
                    <>
                      <span aria-hidden>👑 </span>
                      {w.championName}
                    </>
                  ) : (
                    <span className="text-ink-500">No champion</span>
                  )}
                </span>
                {w.championAmountCents != null && w.championName && (
                  <span className="text-xs text-ink-500 sm:text-sm">
                    · {money(w.championAmountCents)}
                  </span>
                )}
              </div>
            </div>
            <div className="hidden text-xs text-ink-500 sm:block">
              {w.choreCount} chore{w.choreCount === 1 ? '' : 's'}
              {w.closedAt ? '' : ' · still open'}
            </div>
            <div className="text-right">
              <div className="money-amt text-sm sm:text-base">
                {money(w.totalCents)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 sm:hidden">
                {w.choreCount} chore{w.choreCount === 1 ? '' : 's'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `<input type="date">` always wants `YYYY-MM-DD`. We anchor it to the
 * family timezone so the user is editing their family's calendar days,
 * not the viewer's browser ones — matches the API's `HistoryDayBucket`
 * contract (`YYYY-MM-DD in family TZ`).
 */
function dateInputValue(d: Date, tz: string): string {
  return localDayKey(d, tz);
}

function toIsoStart(yyyymmdd: string, tz: string): string {
  const date = dayKeyToZonedDate(yyyymmdd, tz);
  if (isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function toIsoEnd(yyyymmdd: string, tz: string): string {
  const date = dayKeyToZonedEndOfDay(yyyymmdd, tz);
  if (isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function humanLabel(yyyymmdd: string, isWeek: boolean, tz: string): string {
  if (!yyyymmdd) return '';
  const date = dayKeyToZonedDate(yyyymmdd, tz);
  if (isNaN(date.getTime())) return yyyymmdd;
  if (isWeek) {
    const monthDay = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
    }).format(date);
    return `Wk of ${monthDay}`;
  }
  return formatShortDate(date, tz);
}

function weekRangeLabel(startsAt: string, endsAt: string, tz: string): string {
  return formatWeekRange(startsAt, endsAt, tz);
}

function historyCsvFilename(data: HistoryResponse): string {
  const from = data.range.from.slice(0, 10);
  const to = data.range.to.slice(0, 10);
  const suffix = data.range.preset === 'custom' ? 'custom' : data.range.preset;
  return `choreboard-history-${suffix}-${from}-to-${to}.csv`;
}

// ---------------------------------------------------------------------------
// Highlights row
// ---------------------------------------------------------------------------

function HighlightsRow({ data, tz }: { data: HistoryResponse; tz: string }) {
  const { bestWeek, biggestSingle, mostRepeated } = data.highlights;
  if (!bestWeek && !biggestSingle && !mostRepeated) return null;
  return (
    <section className="grid gap-3 sm:grid-cols-3 2xl:gap-4">
      <BestWeekHighlight week={bestWeek} tz={tz} />
      <BiggestSingleHighlight entry={biggestSingle} />
      <MostRepeatedHighlight chore={mostRepeated} />
    </section>
  );
}

function HighlightShell({
  tag,
  accent,
  icon,
  children,
}: {
  tag: string;
  accent: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <article className="card flex items-start gap-3 p-4 sm:p-5">
      <div
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg text-xl ring-2 ring-ink-900 sm:h-12 sm:w-12 sm:text-2xl"
        style={{ backgroundColor: accent }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="page-tag truncate">{tag}</div>
        {children}
      </div>
    </article>
  );
}

function BestWeekHighlight({ week, tz }: { week: HistoryWeekRow | null; tz: string }) {
  if (!week) {
    return (
      <HighlightShell tag="Best week" accent="rgba(232,177,42,0.25)" icon="🏆">
        <p className="mt-1 text-sm text-ink-500">
          No closed week in this window yet.
        </p>
      </HighlightShell>
    );
  }
  return (
    <HighlightShell tag="Best week" accent="rgba(232,177,42,0.25)" icon="🏆">
      <div className="font-display text-xl font-extrabold tabular-nums text-money sm:text-2xl">
        {money(week.totalCents)}
      </div>
      <p className="mt-0.5 truncate text-xs text-ink-500 sm:text-sm">
        {weekRangeLabel(week.startsAt, week.endsAt, tz)} · {week.choreCount} chore
        {week.choreCount === 1 ? '' : 's'}
        {week.championName ? ` · 👑 ${week.championName}` : ''}
      </p>
    </HighlightShell>
  );
}

function BiggestSingleHighlight({
  entry,
}: {
  entry: HistoryBiggestSingle | null;
}) {
  if (!entry) {
    return (
      <HighlightShell tag="Biggest payout" accent="rgba(15,110,55,0.20)" icon="💰">
        <p className="mt-1 text-sm text-ink-500">
          No approved chores in this window.
        </p>
      </HighlightShell>
    );
  }
  return (
    <HighlightShell tag="Biggest payout" accent="rgba(15,110,55,0.20)" icon="💰">
      <div className="font-display text-xl font-extrabold tabular-nums text-money sm:text-2xl">
        {money(entry.cents)}
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-500 sm:text-sm">
        <MemberAvatar
          name={entry.memberName}
          color={entry.memberColor ?? undefined}
          size="xs"
          className="!h-4 !w-4 !text-[9px] !ring-1"
        />
        <span className="truncate">
          {entry.memberName} · {entry.choreName}
        </span>
        <span className="text-ink-400">· {relativePast(entry.earnedAt)}</span>
      </p>
    </HighlightShell>
  );
}

function MostRepeatedHighlight({
  chore,
}: {
  chore: HistoryMostRepeated | null;
}) {
  if (!chore) {
    return (
      <HighlightShell
        tag="Most repeated"
        accent="rgba(50,83,215,0.18)"
        icon="🔁"
      >
        <p className="mt-1 text-sm text-ink-500">
          Not enough data in this window.
        </p>
      </HighlightShell>
    );
  }
  return (
    <HighlightShell tag="Most repeated" accent="rgba(50,83,215,0.18)" icon="🔁">
      <div className="font-display text-xl font-extrabold tabular-nums sm:text-2xl">
        ×{chore.count}
      </div>
      <p className="mt-0.5 truncate text-xs text-ink-500 sm:text-sm">
        {chore.name} · {money(chore.cents)} total
      </p>
    </HighlightShell>
  );
}

// ---------------------------------------------------------------------------
// Day-of-week heat strip
// ---------------------------------------------------------------------------

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayOfWeekCard({ rows }: { rows: HistoryDayOfWeekRow[] }) {
  // Server already returns exactly 7 rows (one per dow); fall back
  // defensively in case of a stale client.
  const safe: HistoryDayOfWeekRow[] = useMemo(() => {
    const map = new Map(rows.map((r) => [r.dow, r]));
    return Array.from({ length: 7 }, (_, i) =>
      map.get(i) ?? { dow: i, cents: 0, chores: 0 },
    );
  }, [rows]);
  const max = Math.max(1, ...safe.map((r) => r.cents));
  const total = safe.reduce((a, b) => a + b.cents, 0);
  if (total === 0) return null;

  // Identify the best/worst dow so we can subtly badge them in the
  // tooltip. Ties resolve to the earlier day, which feels natural.
  const bestDow = safe.reduce((best, r) => (r.cents > best.cents ? r : best), safe[0]!);

  return (
    <section className="card p-5 sm:p-6 2xl:p-8">
      <header className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
        <div>
          <div className="page-tag mb-1">By day of week</div>
          <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
            When the work happens
          </h2>
        </div>
        <span className="text-xs text-ink-500 sm:text-sm">
          {DOW_LABELS[bestDow.dow]} is the strongest day
        </span>
      </header>
      <ul className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {safe.map((r) => {
          const ratio = r.cents / max;
          // Map intensity into the cream→money palette via alpha.
          const alpha = r.cents === 0 ? 0.06 : 0.18 + ratio * 0.62;
          const isBest = r.dow === bestDow.dow && r.cents > 0;
          return (
            <li key={r.dow} className="flex flex-col items-stretch text-center">
              <div
                className={`flex flex-1 flex-col justify-end rounded-xl px-1 py-2 ring-2 ${
                  isBest ? 'ring-ink-900' : 'ring-ink-900/15'
                }`}
                style={{ backgroundColor: `rgba(232,177,42,${alpha})` }}
                title={`${DOW_LABELS[r.dow]}: ${money(r.cents)} · ${r.chores} chore${r.chores === 1 ? '' : 's'}`}
              >
                <div className="font-display text-sm font-extrabold tabular-nums sm:text-base">
                  {money(r.cents)}
                </div>
                <div className="text-[10px] text-ink-500 sm:text-xs">
                  {r.chores} chore{r.chores === 1 ? '' : 's'}
                </div>
              </div>
              <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500 sm:text-xs">
                {DOW_LABELS[r.dow]}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// URL <-> filter helpers
// ---------------------------------------------------------------------------

const PRESET_IDS: HistoryPreset[] = [
  'this_week',
  'last_week',
  'last_4_weeks',
  'this_month',
  'last_3_months',
  'this_year',
  'all_time',
];

function parseFilterFromUrl(params: URLSearchParams): Filter {
  const p = params.get('p');
  if (p && (PRESET_IDS as string[]).includes(p)) {
    return { kind: 'preset', preset: p as HistoryPreset };
  }
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && isDateString(from) && isDateString(to)) {
    return { kind: 'custom', from, to };
  }
  return { kind: 'preset', preset: 'last_4_weeks' };
}

function parseMemberFromUrl(params: URLSearchParams): MemberFilter {
  const mt = params.get('mt');
  const mid = params.get('mid');
  if ((mt === 'user' || mt === 'kid') && mid) {
    return { kind: 'member', type: mt, id: mid };
  }
  return { kind: 'all' };
}

function isDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
