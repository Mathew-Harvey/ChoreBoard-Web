import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import {
  addMonths,
  buildCalendarGrid,
  dayOfMonth,
  isSameMonth,
  monthLabel,
  readableDate,
  todayKey,
  type DateKey,
} from '../lib/calendar';
import type {
  Family,
  ListSummary,
  Whiteboard,
  WhiteboardSummary,
} from '../lib/types';
import { DesktopTitle } from '../ui/primitives';
import { toastError, toastSuccess } from '../ui/Toast';
import { WhiteboardEditor } from './WhiteboardEditor';
import { ListEditor } from './ListEditor';
import { money } from '../lib/format';

/**
 * CalendarDesktop
 *
 * The primary surface for the "Family canvas" feature. A six-week month grid
 * shows where whiteboard sessions and lists are pinned; tapping a day opens
 * a side sheet with the day's artefacts; tapping any artefact opens the
 * full editor in-place. The whole desktop replaces its main pane with the
 * editor when something is open, so the calendar/topbar chrome stays put.
 */
export function CalendarDesktop({ family }: { family?: Family }) {
  // Without a loaded family record we'd be silently keying "today" off the
  // viewer's browser timezone, which is wrong for any parent travelling
  // outside the family TZ. Render a skeleton until family is in hand, then
  // mount the real desktop so every cell on the calendar reflects the
  // family's calendar day from first paint.
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
  return <CalendarDesktopInner family={family} />;
}

function CalendarDesktopInner({ family }: { family: Family }) {
  const qc = useQueryClient();
  const session = useSession();
  const tz = family.timezone;
  const [anchor, setAnchor] = useState<DateKey>(todayKey(tz));
  const [selected, setSelected] = useState<DateKey>(todayKey(tz));
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [open, setOpen] = useState<
    | { kind: 'whiteboard'; id: string }
    | { kind: 'list'; id: string }
    | null
  >(null);

  const grid = useMemo(() => buildCalendarGrid(anchor, 1), [anchor]);
  const rangeFrom = grid[0]!;
  const rangeTo = grid[grid.length - 1]!;

  const whiteboards = useQuery({
    queryKey: ['whiteboards', { from: rangeFrom, to: rangeTo }],
    queryFn: () =>
      api.get<{ whiteboards: WhiteboardSummary[] }>(
        `/api/whiteboards?from=${rangeFrom}&to=${rangeTo}&limit=200`,
      ),
    staleTime: 10_000,
  });
  // We separately pull *all* recent whiteboards (not just the visible month)
  // so the side rail can show "Recent boards" no matter where you are in the
  // calendar.
  const recentBoards = useQuery({
    queryKey: ['whiteboards', 'recent'],
    queryFn: () => api.get<{ whiteboards: WhiteboardSummary[] }>(`/api/whiteboards?limit=24`),
    staleTime: 10_000,
  });

  const lists = useQuery({
    queryKey: ['lists', { from: rangeFrom, to: rangeTo }],
    queryFn: () =>
      api.get<{ lists: ListSummary[] }>(
        `/api/lists?from=${rangeFrom}&to=${rangeTo}`,
      ),
    staleTime: 10_000,
  });
  const recentLists = useQuery({
    queryKey: ['lists', 'recent'],
    queryFn: () => api.get<{ lists: ListSummary[] }>(`/api/lists`),
    staleTime: 10_000,
  });

  // Quick-lookup: which artefacts live on which day?
  const byDay = useMemo(() => {
    const map = new Map<DateKey, { boards: WhiteboardSummary[]; lists: ListSummary[] }>();
    const ensure = (key: DateKey) => {
      let v = map.get(key);
      if (!v) {
        v = { boards: [], lists: [] };
        map.set(key, v);
      }
      return v;
    };
    for (const b of whiteboards.data?.whiteboards ?? []) {
      if (b.date) ensure(b.date).boards.push(b);
    }
    for (const l of lists.data?.lists ?? []) {
      if (l.date) ensure(l.date).lists.push(l);
    }
    return map;
  }, [whiteboards.data, lists.data]);

  const createBoard = useMutation({
    mutationFn: (date: DateKey | null) =>
      api.post<{ whiteboard: Whiteboard }>('/api/whiteboards', {
        title: `Board · ${date ? readableDate(date) : 'Unscheduled'}`,
        date,
        background: 'paper',
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] });
      setOpen({ kind: 'whiteboard', id: res.whiteboard.id });
    },
    onError: () => toastError('Couldn’t create whiteboard'),
  });
  const createList = useMutation({
    mutationFn: (input: { date: DateKey | null; kind: 'shopping' | 'todo' | 'packing' | 'other' }) =>
      api.post<{ list: ListSummary }>('/api/lists', {
        title:
          input.kind === 'shopping'
            ? `Shopping · ${input.date ? readableDate(input.date) : 'Unscheduled'}`
            : input.kind === 'packing'
              ? `Packing · ${input.date ? readableDate(input.date) : 'Unscheduled'}`
              : input.kind === 'todo'
                ? `Todo · ${input.date ? readableDate(input.date) : 'Unscheduled'}`
                : `List · ${input.date ? readableDate(input.date) : 'Unscheduled'}`,
        date: input.date,
        kind: input.kind,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      setOpen({ kind: 'list', id: res.list.id });
    },
    onError: () => toastError('Couldn’t create list'),
  });
  const deleteBoard = useMutation({
    mutationFn: (id: string) => api.delete(`/api/whiteboards/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] });
      toastSuccess('Whiteboard deleted');
    },
    onError: () => toastError('Couldn’t delete that whiteboard'),
  });
  const deleteList = useMutation({
    mutationFn: (id: string) => api.delete(`/api/lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      toastSuccess('List deleted');
    },
    onError: () => toastError('Couldn’t delete that list'),
  });

  // When an editor is open we hand the main pane over to it. The user uses
  // the back button to return to the calendar; the side rail vanishes so
  // they have the full canvas/list at their disposal.
  if (open?.kind === 'whiteboard') {
    return (
      <div className="h-full min-h-0">
        <WhiteboardEditor whiteboardId={open.id} onClose={() => setOpen(null)} />
      </div>
    );
  }
  if (open?.kind === 'list') {
    return (
      <div className="h-full min-h-0">
        <ListEditor
          listId={open.id}
          onClose={() => setOpen(null)}
          onListChanged={() => qc.invalidateQueries({ queryKey: ['lists'] })}
        />
      </div>
    );
  }

  const today = todayKey(tz);
  const selectedDay = byDay.get(selected) ?? { boards: [], lists: [] };
  const canDelete = (item: { createdByUserId?: string | null; createdByKidId?: string | null }) => {
    const p = session.data;
    if (!p) return false;
    if (p.kind === 'parent') return true;
    return item.createdByKidId === p.kidId;
  };
  const dayActions = {
    openBoard: (id: string) => {
      setDaySheetOpen(false);
      setOpen({ kind: 'whiteboard', id });
    },
    openList: (id: string) => {
      setDaySheetOpen(false);
      setOpen({ kind: 'list', id });
    },
    deleteBoard: (id: string) => deleteBoard.mutate(id),
    deleteList: (id: string) => deleteList.mutate(id),
    canDelete,
  };

  return (
    <div className="mx-auto h-full w-full max-w-[1800px] overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">
      <DesktopTitle
        date="CALENDAR · CANVAS & LISTS"
        title="The family canvas"
        subtitle="Whiteboard sessions and shopping lists, pinned to the days they belong to."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => createBoard.mutate(selected)}
              className="btn-secondary"
            >
              ＋ Whiteboard
            </button>
            <button
              type="button"
              onClick={() => createList.mutate({ date: selected, kind: 'shopping' })}
              className="btn-primary"
            >
              ＋ Shopping list
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b-2 border-ink-900/10 bg-cream-100/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnchor(addMonths(anchor, -1))}
                className="btn-icon"
                aria-label="Previous month"
              >
                ‹
              </button>
              <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 sm:text-xl">
                {monthLabel(anchor)}
              </h2>
              <button
                type="button"
                onClick={() => setAnchor(addMonths(anchor, 1))}
                className="btn-icon"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setAnchor(today);
                setSelected(today);
              }}
              className="btn-ghost text-xs"
            >
              Today
            </button>
          </header>

          <div className="grid grid-cols-7 gap-px bg-ink-900/10 px-px py-px text-center text-[11px] font-bold uppercase tracking-wide text-ink-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="bg-cream-100/60 py-1.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-ink-900/10 px-px pb-px">
            {grid.map((key) => {
              const data = byDay.get(key) ?? { boards: [], lists: [] };
              const inMonth = isSameMonth(key, anchor);
              const isToday = key === today;
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelected(key);
                    setDaySheetOpen(true);
                  }}
                  className={`relative flex min-h-[88px] flex-col gap-1 bg-paper p-1.5 text-left transition hover:bg-cream-100 focus:outline-none focus:ring-2 focus:ring-accent-blue ${
                    inMonth ? '' : 'opacity-50'
                  } ${isSelected ? 'ring-2 ring-ink-900' : ''}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full font-bold tabular-nums ${
                        isToday
                          ? 'bg-accent-orange text-white shadow-paper-sm'
                          : 'text-ink-700'
                      }`}
                    >
                      {dayOfMonth(key)}
                    </span>
                    {(data.boards.length > 0 || data.lists.length > 0) && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                        {data.boards.length + data.lists.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {data.boards.slice(0, 2).map((b) => (
                      <span
                        key={b.id}
                        className="truncate rounded-md bg-accent-blue/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent-blue"
                      >
                        ✏️ {b.title}
                      </span>
                    ))}
                    {data.lists.slice(0, 2).map((l) => (
                      <span
                        key={l.id}
                        className={`truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                          l.checkedCount === l.itemCount && l.itemCount > 0
                            ? 'bg-money/15 text-money'
                            : 'bg-cream-200 text-ink-700'
                        }`}
                      >
                        {l.kind === 'shopping' ? '🛒' : l.kind === 'packing' ? '🧳' : '📋'} {l.title}
                      </span>
                    ))}
                    {data.boards.length + data.lists.length > 4 && (
                      <span className="text-[10px] text-ink-500">
                        +{data.boards.length + data.lists.length - 4} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="card p-4">
            <header className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-extrabold tracking-tight text-ink-900">
                {readableDate(selected)}
              </h3>
              <span className="text-xs text-ink-500">
                {selectedDay.boards.length + selectedDay.lists.length === 0
                  ? 'Nothing pinned yet'
                  : `${selectedDay.boards.length} board · ${selectedDay.lists.length} list${
                      selectedDay.lists.length === 1 ? '' : 's'
                    }`}
              </span>
            </header>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => createBoard.mutate(selected)}
                className="btn-secondary"
              >
                ✏️ New board
              </button>
              <button
                type="button"
                onClick={() => createList.mutate({ date: selected, kind: 'shopping' })}
                className="btn-secondary"
              >
                🛒 New shopping list
              </button>
              <button
                type="button"
                onClick={() => createList.mutate({ date: selected, kind: 'todo' })}
                className="btn-ghost text-xs"
              >
                + Todo
              </button>
              <button
                type="button"
                onClick={() => createList.mutate({ date: selected, kind: 'packing' })}
                className="btn-ghost text-xs"
              >
                + Packing
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {selectedDay.boards.map((b) => (
                <div
                  key={b.id}
                  className="group flex items-center gap-3 rounded-xl border border-ink-900/15 bg-paper p-2.5 text-left transition hover:border-ink-900 hover:shadow-paper-sm"
                >
                  <button
                    type="button"
                    onClick={() => dayActions.openBoard(b.id)}
                    className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-accent-blue/15 text-xl"
                    aria-label={`Open ${b.title}`}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => dayActions.openBoard(b.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-bold text-ink-900">{b.title}</div>
                    <div className="text-xs text-ink-500">
                      {b.pointsCount === 0
                        ? 'Empty board'
                        : `${b.pointsCount.toLocaleString()} points`}
                    </div>
                  </button>
                  {dayActions.canDelete(b) && (
                    <button
                      type="button"
                      onClick={() => dayActions.deleteBoard(b.id)}
                      className="btn-ghost text-xs text-accent-red"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dayActions.openBoard(b.id)}
                    className="text-ink-400 transition group-hover:text-ink-900"
                    aria-label={`Edit ${b.title}`}
                  >
                    Edit
                  </button>
                </div>
              ))}
              {selectedDay.lists.map((l) => (
                <ListPreviewButton
                  key={l.id}
                  list={l}
                  onOpen={() => dayActions.openList(l.id)}
                  onDelete={dayActions.canDelete(l) ? () => dayActions.deleteList(l.id) : undefined}
                />
              ))}
              {selectedDay.boards.length + selectedDay.lists.length === 0 && (
                <p className="rounded-xl border border-dashed border-ink-900/20 bg-paper px-3 py-4 text-center text-sm text-ink-500">
                  Pin a whiteboard or list to this day to get started.
                </p>
              )}
            </div>
          </section>

          <section className="card p-4">
            <header className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display text-sm font-extrabold tracking-tight text-ink-900">
                Recent whiteboards
              </h3>
              <button
                type="button"
                onClick={() => createBoard.mutate(null)}
                className="btn-ghost text-xs"
              >
                + Unscheduled board
              </button>
            </header>
            {(recentBoards.data?.whiteboards ?? []).length === 0 ? (
              <p className="text-xs text-ink-500">No boards yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(recentBoards.data?.whiteboards ?? []).slice(0, 6).map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => setOpen({ kind: 'whiteboard', id: b.id })}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-cream-100"
                    >
                      <span className="truncate font-semibold text-ink-900">{b.title}</span>
                      <span className="text-[11px] text-ink-500">
                        {b.date ?? 'unscheduled'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <header className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display text-sm font-extrabold tracking-tight text-ink-900">
                Active lists
              </h3>
              <button
                type="button"
                onClick={() => createList.mutate({ date: null, kind: 'shopping' })}
                className="btn-ghost text-xs"
              >
                + Unscheduled list
              </button>
            </header>
            {(recentLists.data?.lists ?? []).length === 0 ? (
              <p className="text-xs text-ink-500">No lists yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(recentLists.data?.lists ?? []).slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setOpen({ kind: 'list', id: l.id })}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-cream-100"
                    >
                      <span className="truncate font-semibold text-ink-900">{l.title}</span>
                      <span className="text-[11px] text-ink-500">
                        {l.checkedCount}/{l.itemCount}
                        {l.totalCents > 0 ? ` · ${money(l.totalCents)}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {daySheetOpen && (
        <DaySheet
          date={selected}
          day={selectedDay}
          actions={dayActions}
          onClose={() => setDaySheetOpen(false)}
          onNewBoard={() => createBoard.mutate(selected)}
          onNewShoppingList={() => createList.mutate({ date: selected, kind: 'shopping' })}
        />
      )}
    </div>
  );
}

function DaySheet({
  date,
  day,
  actions,
  onClose,
  onNewBoard,
  onNewShoppingList,
}: {
  date: DateKey;
  day: { boards: WhiteboardSummary[]; lists: ListSummary[] };
  actions: {
    openBoard: (id: string) => void;
    openList: (id: string) => void;
    deleteBoard: (id: string) => void;
    deleteList: (id: string) => void;
    canDelete: (item: { createdByUserId?: string | null; createdByKidId?: string | null }) => boolean;
  };
  onClose: () => void;
  onNewBoard: () => void;
  onNewShoppingList: () => void;
}) {
  const total = day.boards.length + day.lists.length;
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/35 p-3 backdrop-blur-sm lg:hidden">
      <button
        type="button"
        aria-label="Close day sheet"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <section className="safe-pb absolute inset-x-3 bottom-3 max-h-[78vh] overflow-hidden rounded-chunky bg-paper ring-2 ring-ink-900 shadow-paper-lg">
        <header className="flex items-start justify-between gap-3 border-b border-ink-900/10 bg-cream-100 px-4 py-3">
          <div>
            <div className="page-tag">DAY DETAILS</div>
            <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900">
              {readableDate(date)}
            </h3>
            <p className="mt-1 text-xs text-ink-500">
              {total === 0 ? 'No boards or lists yet.' : `${total} item${total === 1 ? '' : 's'} on this day`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            ×
          </button>
        </header>
        <div className="max-h-[calc(78vh-92px)] overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={onNewBoard} className="btn-secondary">
              ✏️ New board
            </button>
            <button type="button" onClick={onNewShoppingList} className="btn-primary">
              🛒 New list
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {day.boards.map((b) => (
              <div key={b.id} className="rounded-xl border border-ink-900/15 bg-paper p-3">
                <div className="mb-2 flex items-start gap-3">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg bg-accent-blue/15 text-xl">
                    ✏️
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink-900">{b.title}</div>
                    <div className="text-xs text-ink-500">
                      {b.pointsCount === 0 ? 'Empty board' : `${b.pointsCount.toLocaleString()} points`}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => actions.openBoard(b.id)} className="btn-primary">
                    Open / edit
                  </button>
                  {actions.canDelete(b) && (
                    <button
                      type="button"
                      onClick={() => actions.deleteBoard(b.id)}
                      className="btn-danger"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {day.lists.map((l) => (
              <div key={l.id} className="rounded-xl border border-ink-900/15 bg-paper p-3">
                <div className="mb-2 flex items-start gap-3">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg bg-cream-200 text-xl">
                    {l.kind === 'shopping' ? '🛒' : l.kind === 'packing' ? '🧳' : '📋'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink-900">{l.title}</div>
                    <div className="text-xs text-ink-500">
                      {l.itemCount === 0
                        ? 'Empty list'
                        : `${l.checkedCount}/${l.itemCount} done${
                            l.totalCents > 0 ? ` · ${money(l.totalCents)}` : ''
                          }`}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => actions.openList(l.id)} className="btn-primary">
                    Open / edit
                  </button>
                  {actions.canDelete(l) && (
                    <button
                      type="button"
                      onClick={() => actions.deleteList(l.id)}
                      className="btn-danger"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {total === 0 && (
              <p className="rounded-xl border border-dashed border-ink-900/20 bg-cream-100 px-3 py-5 text-center text-sm text-ink-500">
                Create a whiteboard or list and it will be pinned to this day.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ListPreviewButton({
  list,
  onOpen,
  onDelete,
}: {
  list: ListSummary;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const glyph = list.kind === 'shopping' ? '🛒' : list.kind === 'packing' ? '🧳' : '📋';
  const allDone = list.itemCount > 0 && list.checkedCount === list.itemCount;
  return (
    <div
      className="group flex items-center gap-3 rounded-xl border border-ink-900/15 bg-paper p-2.5 text-left transition hover:border-ink-900 hover:shadow-paper-sm"
    >
      <button
        type="button"
        onClick={onOpen}
        className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-cream-200 text-xl"
        aria-label={`Open ${list.title}`}
      >
        {glyph}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-bold text-ink-900">{list.title}</div>
        <div className="text-xs text-ink-500">
          {list.itemCount === 0
            ? 'Empty'
            : `${list.checkedCount}/${list.itemCount} done${
                list.totalCents > 0 ? ` · ${money(list.totalCents)}` : ''
              }`}
        </div>
      </button>
      {allDone && <span className="pill-approved">DONE</span>}
      {onDelete && (
        <button type="button" onClick={onDelete} className="btn-ghost text-xs text-accent-red">
          Delete
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="text-ink-400 transition group-hover:text-ink-900"
        aria-label={`Edit ${list.title}`}
      >
        Edit
      </button>
    </div>
  );
}
