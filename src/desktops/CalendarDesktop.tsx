import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  addMonths,
  buildCalendarGrid,
  dayOfMonth,
  isSameMonth,
  monthLabel,
  todayKey,
  type DateKey,
} from '../lib/calendar';
import type { Family, InstanceStatus } from '../lib/types';
import { ChoreIcon, DesktopTitle } from '../ui/primitives';
import { money } from '../lib/format';

/**
 * Schedule desktop (PR 10).
 *
 * Replaces the former Calendar+Whiteboards+Lists hybrid with a chore-only
 * month grid sourced from `GET /api/board/schedule`. Materialised
 * `chore_instances` are mixed with projected occurrences from the cadence
 * engine so a parent looking three weeks ahead sees the same rhythm a
 * day-of materialised instance would have.
 *
 * Visual contract from the Round-2 brief:
 *   • 6×7 month grid, today's cell ringed with `ring-2 ring-ink-900` and a
 *     small `bg-money` chip on the date number.
 *   • Each cell stacks up to 4 mini-pills (chore icon + truncated name
 *     + status dot). Overflow becomes "+N more".
 *   • Hide-approved toggle defaults OFF; approved chores render at 50%
 *     opacity by default so the visual payoff of "look at this week's wall
 *     of green" is preserved (Round-2 reviewer Nit 2).
 *   • Past-day cells with any unfinished `available` instance get a 2px
 *     red top border ("overdue surfacing").
 *   • Tapping a day opens a side sheet with the day's full instance list.
 */
type ScheduleInstance = {
  id: string;
  choreId: string;
  availableAt: string;
  dueAt: string | null;
  status: InstanceStatus;
  claimedByType: 'user' | 'kid' | null;
  claimedById: string | null;
  choreName: string;
  amountCents: number;
  projected: boolean;
};

type ScheduleResponse = {
  from: string;
  to: string;
  timezone: string;
  days: Record<string, ScheduleInstance[]>;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarDesktop({ family }: { family?: Family }) {
  if (!family) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto max-w-[1600px] animate-pulse space-y-4">
          <div className="h-6 w-40 rounded bg-cream-200" />
          <div className="h-[480px] rounded-2xl bg-cream-200/60" />
        </div>
      </div>
    );
  }
  return <ScheduleInner family={family} />;
}

function ScheduleInner({ family }: { family: Family }) {
  const tz = family.timezone;
  const [anchor, setAnchor] = useState<DateKey>(todayKey(tz));
  const [hideApproved, setHideApproved] = useState(false);
  const [selected, setSelected] = useState<DateKey | null>(null);

  const grid = useMemo(() => buildCalendarGrid(anchor), [anchor]);
  const from = grid[0]!;
  const to = grid[grid.length - 1]!;

  const sched = useQuery({
    queryKey: ['schedule', from, to, tz],
    queryFn: () =>
      api.get<ScheduleResponse>(
        `/api/board/schedule?from=${from}&to=${to}`,
      ),
    refetchInterval: 5 * 60_000,
  });

  const today = todayKey(tz);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
        <DesktopTitle
          date={tz}
          title="Schedule"
          subtitle="When chores come due."
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnchor(addMonths(anchor, -1))}
                className="btn-ghost"
                aria-label="Previous month"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setAnchor(today)}
                className="btn-secondary"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setAnchor(addMonths(anchor, 1))}
                className="btn-ghost"
                aria-label="Next month"
              >
                →
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
            {monthLabel(anchor)}
          </h2>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink-900"
              checked={hideApproved}
              onChange={(e) => setHideApproved(e.target.checked)}
            />
            Hide approved
          </label>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-1">
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {grid.map((dk) => (
            <DayCell
              key={dk}
              dateKey={dk}
              anchor={anchor}
              today={today}
              instances={sched.data?.days[dk] ?? []}
              hideApproved={hideApproved}
              onSelect={() => setSelected(dk)}
              isPast={dk < today}
            />
          ))}
        </div>
      </div>

      {selected && (
        <DaySheet
          dateKey={selected}
          instances={sched.data?.days[selected] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function DayCell({
  dateKey,
  anchor,
  today,
  instances,
  hideApproved,
  onSelect,
  isPast,
}: {
  dateKey: DateKey;
  anchor: DateKey;
  today: DateKey;
  instances: ScheduleInstance[];
  hideApproved: boolean;
  onSelect: () => void;
  isPast: boolean;
}) {
  const inMonth = isSameMonth(dateKey, anchor);
  const isToday = dateKey === today;

  const visible = useMemo(
    () => (hideApproved ? instances.filter((i) => i.status !== 'approved') : instances),
    [hideApproved, instances],
  );
  const overdue = isPast && instances.some((i) => i.status === 'available' && !i.projected);
  const max = 4;
  const head = visible.slice(0, max);
  const overflow = visible.length - head.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card-soft min-h-[88px] p-1.5 text-left transition hover:bg-cream-50 ${
        inMonth ? '' : 'opacity-60'
      } ${isToday ? '!ring-2 !ring-ink-900' : ''}`}
      style={{
        // Overdue gets a 2px accent-red top border, layered on top of the
        // card-soft ring without disturbing the rest of the card chrome.
        boxShadow: overdue ? 'inset 0 2px 0 0 #DB4646' : undefined,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-1.5">
        <span
          className={`grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold ${
            isToday ? 'bg-money text-cream-50' : 'text-ink-700'
          }`}
        >
          {dayOfMonth(dateKey)}
        </span>
        {overdue && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-accent-red">
            Overdue
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {head.map((inst) => (
          <DayPill key={inst.id} instance={inst} />
        ))}
        {overflow > 0 && (
          <span className="px-1 text-[10px] font-bold text-ink-500">
            +{overflow} more
          </span>
        )}
      </div>
    </button>
  );
}

function DayPill({ instance }: { instance: ScheduleInstance }) {
  const dim = instance.status === 'approved' || instance.projected;
  const dot =
    instance.status === 'approved'
      ? 'bg-money'
      : instance.status === 'pending'
        ? 'bg-accent-orange'
        : instance.status === 'missed' || instance.status === 'rejected'
          ? 'bg-accent-red'
          : 'bg-ink-400';
  return (
    <span
      className={`flex items-center gap-1 truncate rounded-md bg-paper px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-ink-900/15 ${
        dim ? 'opacity-50' : ''
      }`}
      title={instance.choreName}
    >
      <span aria-hidden className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{instance.choreName}</span>
    </span>
  );
}

function DaySheet({
  dateKey,
  instances,
  onClose,
}: {
  dateKey: DateKey;
  instances: ScheduleInstance[];
  onClose: () => void;
}) {
  const sorted = [...instances].sort((a, b) =>
    a.availableAt.localeCompare(b.availableAt),
  );

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-end bg-ink-900/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-label={`Schedule for ${dateKey}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-chunky bg-paper p-6 ring-2 ring-ink-900 shadow-paper sm:rounded-chunky animate-floatIn"
      >
        <div className="page-tag mb-2">SCHEDULE</div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          {dateKey}
        </h2>
        {sorted.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No chores scheduled.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {sorted.map((inst) => (
              <li
                key={inst.id}
                className={`flex items-center justify-between gap-3 rounded-xl bg-cream-50 p-3 ring-1 ring-ink-900/10 ${
                  inst.status === 'approved' || inst.projected ? 'opacity-60' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ChoreIcon name={inst.choreName} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink-900">
                      {inst.choreName}
                    </div>
                    <div className="text-xs text-ink-500">
                      {new Date(inst.availableAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {inst.projected ? ' · upcoming' : ` · ${inst.status}`}
                    </div>
                  </div>
                </div>
                <span className="money-amt text-sm">
                  {money(inst.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn-primary mt-6 w-full" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
