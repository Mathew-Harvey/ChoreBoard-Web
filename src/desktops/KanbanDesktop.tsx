import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { money, timeUntil } from '../lib/format';
import type {
  BoardInstance,
  BoardResponse,
  Chore,
  Kid,
  LeaderboardResponse,
  Parent,
} from '../lib/types';
import {
  ChoreIcon,
  DesktopTitle,
  DueHint,
  MemberAvatar,
  MoneyCell,
  StatusPill,
  buildMemberLookup,
} from '../ui/primitives';
import { Menu, MenuDivider, MenuItem, MenuLabel } from '../ui/Popover';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonChoreCard, SkeletonDesktop } from '../ui/Skeleton';
import { toastError, toastMoney, toastSuccess } from '../ui/Toast';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { StreakChip } from '../ui/StreakChip';
import { celebrate } from '../lib/celebrate';
import { useFamilyMemberStats, rollupByKey } from '../lib/useFamilyMemberStats';

/** Subtle vibrate on touch devices that support it. */
function tinyHaptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

// Reference so unused-import lint stays happy (Skeleton is exported for
// future uses; SkeletonDesktop is what we render in the loading branch).
void SkeletonChoreCard;

type RosterMember = { type: 'user' | 'kid'; id: string; name: string; color?: string };
type SetStatusFn = (instanceId: string, payload: SetStatusPayload) => void;
type SetStatusPayload = {
  status: 'available' | 'claimed' | 'pending' | 'approved' | 'missed';
  claimant?: { memberType: 'user' | 'kid'; memberId: string };
};
type SpawnFn = (choreId: string) => void;

type Column =
  | { kind: 'available' }
  | { kind: 'member'; memberType: 'user' | 'kid'; memberId: string; name: string; color?: string }
  | { kind: 'pending' }
  | { kind: 'completed' };

/* eslint-disable @typescript-eslint/no-explicit-any */

export function KanbanDesktop({
  board,
  loading,
}: {
  board?: BoardResponse;
  loading: boolean;
}) {
  const session = useSession();
  const qc = useQueryClient();
  const leaderboard = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get<LeaderboardResponse>('/api/stats/leaderboard'),
  });
  const memberStatsQ = useFamilyMemberStats(board);
  const memberStatsLookup = rollupByKey(memberStatsQ.data);
  const [dragging, setDragging] = useState<BoardInstance | null>(null);

  // Sensor split rationale:
  //   - MouseSensor only listens to mouse events → snappy distance activation
  //     for laptop/desktop without any delay.
  //   - TouchSensor only listens to touch events → uses a long-press delay so
  //     the user can still scroll the board / a column by touching a card. The
  //     drag only "lifts" once the finger has held still for ~200ms (iPad-ish).
  //   - We deliberately do NOT use PointerSensor here. On Windows touchscreen
  //     laptops PointerEvents fire for both mouse AND touch, which used to
  //     race TouchSensor's delay and turn every horizontal scroll attempt
  //     into an accidental drag.
  //   - KeyboardSensor keeps drag-and-drop accessible (Tab to focus, Space to
  //     pick up, arrows to move, Space/Enter to drop, Escape to cancel).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const action = useMutation({
    mutationFn: async (input: { instanceId: string; action: string; body?: any }) => {
      return api.post(`/api/board/instances/${input.instanceId}/${input.action}`, input.body);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      // Quick human-friendly feedback on the verb that just succeeded. The
      // SSE channel still drives the authoritative state — these are vibes.
      const inst = board?.instances?.find?.((i) => i.id === vars.instanceId);
      if (vars.action === 'claim') {
        toastSuccess('Claimed', inst ? `${inst.choreName} is yours.` : undefined);
      } else if (vars.action === 'unclaim') {
        toastSuccess('Returned to Available');
      } else if (vars.action === 'submit') {
        toastSuccess('Submitted', 'Waiting on a parent to approve.');
      } else if (vars.action === 'approve' && inst) {
        toastMoney(`Approved · ${money(inst.amountCents)}`, inst.choreName);
      } else if (vars.action === 'reject') {
        toastSuccess('Sent back', 'The card is back with the claimant.');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t do that', humanizeError(err.message));
    },
  });

  // Parent-only catalog query, drives the spawn picker on the Available column.
  const isParentSession = session.data?.kind === 'parent';
  const choreCatalog = useQuery({
    queryKey: ['chores'],
    queryFn: () => api.get<{ chores: Chore[] }>('/api/chores').then((r) => r.chores),
    enabled: isParentSession,
  });

  const spawn = useMutation({
    mutationFn: (choreId: string) => api.post(`/api/chores/${choreId}/spawn`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      toastSuccess('Added to the board');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t add', err.message);
    },
  });

  const setStatus = useMutation({
    mutationFn: (input: { instanceId: string; payload: SetStatusPayload }) =>
      api.post(`/api/board/instances/${input.instanceId}/set-status`, input.payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      qc.invalidateQueries({ queryKey: ['member'] });
      const verb =
        vars.payload.status === 'approved'
          ? 'Approved'
          : vars.payload.status === 'claimed'
            ? 'Assigned'
            : vars.payload.status === 'available'
              ? 'Returned to Available'
              : vars.payload.status === 'pending'
                ? 'Sent to pending'
                : 'Marked missed';
      toastSuccess(verb);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t update', err.message);
    },
  });

  if (loading || !board) {
    return <SkeletonDesktop />;
  }

  const principal = session.data;
  const isParent = principal?.kind === 'parent';
  const me =
    principal?.kind === 'kid'
      ? { type: 'kid' as const, id: principal.kidId }
      : principal?.kind === 'parent'
        ? { type: 'user' as const, id: principal.userId }
        : null;
  const lookup = buildMemberLookup(board.kids, board.parents);

  // Flattened roster for "Claim for…" submenus.
  const roster: RosterMember[] = [
    ...board.kids.map((k) => ({ type: 'kid' as const, id: k.id, name: k.name, color: k.color })),
    ...board.parents.map((u) => ({ type: 'user' as const, id: u.id, name: u.name })),
  ];

  const onSetStatus: SetStatusFn = (instanceId, payload) =>
    setStatus.mutate({ instanceId, payload });
  const onSpawn: SpawnFn = (choreId) => spawn.mutate(choreId);

  // Parent-only convenience: approve everything pending in one go.
  const approveAll = () => {
    const pending = board.instances.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    if (
      pending.length > 1 &&
      !confirm(`Approve all ${pending.length} pending chores?`)
    )
      return;
    for (const inst of pending) {
      action.mutate({ instanceId: inst.id, action: 'approve' });
    }
  };
  const activeChores = (choreCatalog.data ?? [])
    .filter((c) => c.active)
    .sort((a, b) => a.name.localeCompare(b.name));

  type MemberColumnT = Extract<Column, { kind: 'member' }>;
  const memberColumns: MemberColumnT[] = [
    ...board.kids.map<MemberColumnT>((k: Kid) => ({
      kind: 'member',
      memberType: 'kid',
      memberId: k.id,
      name: k.name,
      color: k.color,
    })),
    ...board.parents.map<MemberColumnT>((u: Parent) => ({
      kind: 'member',
      memberType: 'user',
      memberId: u.id,
      name: u.name,
    })),
  ];

  const todayLabel = new Date(board.now).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const nextRenewal = soonestRenewal(board.instances);

  const onDragStart = (e: DragStartEvent) => {
    const inst = board.instances.find((i) => i.id === e.active.id);
    setDragging(inst ?? null);
    document.body.dataset.dragging = '1';
    tinyHaptic();
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    delete document.body.dataset.dragging;
    if (!e.over) return;
    const inst = board.instances.find((i) => i.id === e.active.id);
    if (!inst) return;
    const target = e.over.id as string;

    if (target === 'col:available') {
      // Spec §3: kids may un-claim something they own, but only before they
      // submit. Pending → available is a parent reject path.
      if (
        inst.status === 'claimed' ||
        (inst.status === 'pending' && isParent)
      ) {
        action.mutate({ instanceId: inst.id, action: 'unclaim' });
      }
      return;
    }
    if (target.startsWith('col:member:')) {
      const [, , type, id] = target.split(':');
      if (inst.status === 'available') {
        if (principal?.kind === 'kid' && (type !== 'kid' || id !== principal.kidId)) return;
        action.mutate({
          instanceId: inst.id,
          action: 'claim',
          body: { memberType: type, memberId: id },
        });
      }
      return;
    }
    if (target === 'col:pending') {
      if (inst.status === 'claimed') {
        if (
          principal?.kind === 'kid' &&
          (inst.claimedByType !== 'kid' || inst.claimedById !== principal.kidId)
        )
          return;
        action.mutate({ instanceId: inst.id, action: 'submit' });
      }
      return;
    }
    if (target === 'col:completed') {
      if (inst.status === 'pending' && isParent) {
        action.mutate({ instanceId: inst.id, action: 'approve' });
      }
    }
  };

  const lb = leaderboard.data?.entries.slice(0, 3) ?? [];
  const maxLb = Math.max(1, ...lb.map((e) => e.amountCents));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        delete document.body.dataset.dragging;
      }}
      // Tighter autoscroll thresholds + gentler acceleration so the kanban
      // row glides under the dragged card instead of jerking on touch.
      autoScroll={{
        threshold: { x: 0.18, y: 0.18 },
        acceleration: 8,
        interval: 5,
      }}
    >
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:gap-5 sm:p-7 2xl:p-10">
        <div className="mx-auto w-full max-w-[1800px]">
          <DesktopTitle
            date={todayLabel.toUpperCase()}
            title="The board"
            subtitle={
              nextRenewal
                ? `Next renewal in ${timeUntil(nextRenewal)}${leaderboard.data?.payoutAt ? ` · Pays out ${new Date(leaderboard.data.payoutAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' })}` : ''}`
                : undefined
            }
            right={
              lb.length > 0 ? (
                <MiniLeaderboard
                  entries={lb}
                  maxAmount={maxLb}
                  memberLookup={memberStatsLookup}
                />
              ) : null
            }
          />
        </div>

        {/* Row 1 — Available + member lanes. Scroll-snap so flicking a finger
            lands on a column edge rather than mid-card. */}
        <div className="mx-auto w-full max-w-[1800px]">
          <div className="h-scroll-snap -mx-1 flex gap-3 overflow-x-auto px-1 pt-1 pb-3 sm:gap-4 2xl:gap-6">
            <AvailableColumn
              instances={board.instances}
              isParent={isParent}
              me={me}
              roster={roster}
              onSetStatus={onSetStatus}
              onSpawn={isParent ? onSpawn : undefined}
              activeChores={isParent ? activeChores : []}
            />
            {memberColumns.map((c) => (
              <MemberColumn
                key={`m-${c.kind === 'member' ? c.memberId : ''}`}
                column={c}
                instances={board.instances}
                isParent={isParent}
                me={me}
                lookup={lookup}
                roster={roster}
                onSetStatus={onSetStatus}
                onSubmit={(id) => action.mutate({ instanceId: id, action: 'submit' })}
                onUnclaim={(id) => action.mutate({ instanceId: id, action: 'unclaim' })}
                memberLookup={memberStatsLookup}
              />
            ))}
          </div>
        </div>

        {/* Row 2 — Pending + Completed */}
        <div className="mx-auto grid w-full max-w-[1800px] gap-3 sm:grid-cols-2 sm:gap-4 2xl:gap-6">
          <PendingColumn
            instances={board.instances}
            isParent={isParent}
            me={me}
            lookup={lookup}
            roster={roster}
            onApprove={(id) => action.mutate({ instanceId: id, action: 'approve' })}
            onReject={(id) => action.mutate({ instanceId: id, action: 'reject' })}
            onSetStatus={onSetStatus}
            onApproveAll={approveAll}
          />
          <CompletedColumn
            instances={board.instances}
            lookup={lookup}
            isParent={isParent}
            roster={roster}
            onSetStatus={onSetStatus}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null} zIndex={9999}>
        {dragging && (
          <div className="pointer-events-none animate-dragLift will-change-transform drop-shadow-[10px_14px_0_rgba(16,24,43,0.45)]">
            <CardShell instance={dragging} draggable={false} accentColor={undefined} overlay />
          </div>
        )}
      </DragOverlay>

      {/* Errors flow through the global Toast viewport — see action.onError. */}
    </DndContext>
  );
}

function soonestRenewal(list: BoardInstance[]): string | null {
  const now = Date.now();
  let best: number | null = null;
  for (const i of list) {
    if (!i.dueAt) continue;
    const t = new Date(i.dueAt).getTime();
    if (t > now && (best === null || t < best)) best = t;
  }
  return best ? new Date(best).toISOString() : null;
}

function humanizeError(code: string): string {
  switch (code) {
    case 'photo_required':
      return 'This chore needs a photo before you submit.';
    case 'not_yours':
      return 'That one belongs to someone else.';
    case 'already_submitted':
      return 'Already submitted — a parent has to approve or reject.';
    case 'not_yet_available':
      return 'Not available yet.';
    case 'not_available':
      return 'Already claimed by someone else.';
    default:
      return code;
  }
}

// ---------------------------------------------------------------------------
// Mini leaderboard (top-right of Kanban)
// ---------------------------------------------------------------------------

function MiniLeaderboard({
  entries,
  maxAmount,
  memberLookup,
}: {
  entries: NonNullable<LeaderboardResponse['entries']>;
  maxAmount: number;
  memberLookup: ReturnType<typeof rollupByKey>;
}) {
  return (
    <div className="card-dark hidden w-72 px-4 py-3 sm:block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-display text-sm font-bold">This week</span>
        <span className="text-[10px] uppercase tracking-wider text-cream-50/60">
          Pays out
        </span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {entries.map((e, i) => {
          const rollup = memberLookup.get(e.memberType, e.memberId);
          return (
            <li
              key={`${e.memberType}:${e.memberId}`}
              className="flex items-center gap-2 text-sm"
            >
              <span className="w-3 text-right text-xs text-cream-50/60">{i + 1}</span>
              <MemberAvatar name={e.name} color={e.color} size="xs" />
              <span className="flex flex-1 items-center gap-1.5 truncate">
                <span className="truncate">{e.name}</span>
                {rollup && (
                  <StreakChip
                    streak={rollup.stats.streak}
                    bestStreak={rollup.stats.bestStreak}
                    size="xs"
                    tone="dark"
                  />
                )}
              </span>
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-cream-50/15">
                <div
                  className="h-full"
                  style={{
                    width: `${(e.amountCents / maxAmount) * 100}%`,
                    backgroundColor: e.color ?? '#FBF6E6',
                  }}
                />
              </div>
              <AnimatedNumber
                value={e.amountCents}
                format={money}
                className="font-display tabular-nums"
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function AvailableColumn({
  instances,
  isParent,
  me,
  roster,
  onSetStatus,
  onSpawn,
  activeChores,
}: {
  instances: BoardInstance[];
  isParent: boolean;
  me: { type: 'user' | 'kid'; id: string } | null;
  roster: RosterMember[];
  onSetStatus: SetStatusFn;
  onSpawn?: SpawnFn;
  activeChores: Chore[];
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'available')
        .sort((a, b) => (a.dueAt ?? a.availableAt).localeCompare(b.dueAt ?? b.availableAt)),
    [instances],
  );
  const { setNodeRef, isOver } = useDroppable({ id: 'col:available' });
  return (
    <section
      ref={setNodeRef}
      data-droppable="1"
      className={`flex w-[18rem] flex-shrink-0 flex-col gap-2 rounded-chunky bg-ink-900 p-3 text-cream-50 ring-2 ring-ink-900 shadow-paper sm:w-[20rem] xl:w-[22rem] 2xl:w-[24rem] ${
        isOver ? 'outline outline-2 outline-offset-2 outline-accent-yellow' : ''
      }`}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between rounded-t-chunky bg-ink-900 px-2 py-2">
        <h2 className="font-display text-base font-bold sm:text-lg 2xl:text-xl">
          Available · <span className="text-cream-50/60">{items.length}</span>
        </h2>
        {onSpawn && <SpawnPicker chores={activeChores} onSpawn={onSpawn} />}
      </header>
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <EmptyState
            illustration="available"
            tone="dark"
            compact
            title="All clear"
            body={
              isParent
                ? 'Nothing to claim right now. Use + Add to drop one onto the board.'
                : 'Nothing to claim right now — check back soon.'
            }
          />
        )}
        {items.map((inst) => (
          <DraggableCard
            key={inst.id}
            instance={inst}
            draggable={canDrag(inst, { kind: 'available' }, isParent, me)}
            tone="onDark"
            isParent={isParent}
            roster={roster}
            onSetStatus={onSetStatus}
          />
        ))}
      </div>
    </section>
  );
}

function SpawnPicker({ chores, onSpawn }: { chores: Chore[]; onSpawn: SpawnFn }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? chores.filter((c) => c.name.toLowerCase().includes(q)) : chores;
  }, [chores, query]);
  return (
    <Menu
      align="end"
      width={300}
      trigger={(open, setOpen) => (
        <button
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-lg bg-cream-50/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-cream-50 ring-1 ring-cream-50/25 transition hover:bg-cream-50/25 active:translate-y-px"
          style={{ minHeight: 32 }}
        >
          <span>+</span>
          <span>Add</span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <MenuLabel>Drop a chore on the board</MenuLabel>
          <div className="px-1.5 pb-1.5">
            <input
              autoFocus
              className="input"
              placeholder="Search chores…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <MenuDivider />
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-ink-500">No matching chores.</p>
            )}
            {filtered.map((c) => (
              <MenuItem
                key={c.id}
                onClick={() => {
                  onSpawn(c.id);
                  close();
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <span className="money-amt text-xs">{`$${(c.amountCents / 100).toFixed(2)}`}</span>
                </span>
              </MenuItem>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}

function MemberColumn({
  column,
  instances,
  isParent,
  me,
  lookup,
  roster,
  onSetStatus,
  onSubmit,
  onUnclaim,
  memberLookup,
}: {
  column: Extract<Column, { kind: 'member' }>;
  instances: BoardInstance[];
  isParent: boolean;
  me: { type: 'user' | 'kid'; id: string } | null;
  lookup: ReturnType<typeof buildMemberLookup>;
  roster: RosterMember[];
  onSetStatus: SetStatusFn;
  onSubmit: (id: string) => void;
  onUnclaim: (id: string) => void;
  memberLookup: ReturnType<typeof rollupByKey>;
}) {
  const rollup = memberLookup.get(column.memberType, column.memberId);
  const items = useMemo(
    () =>
      instances
        .filter(
          (i) =>
            i.status === 'claimed' &&
            i.claimedByType === column.memberType &&
            i.claimedById === column.memberId,
        )
        .sort((a, b) => (a.claimedAt ?? '').localeCompare(b.claimedAt ?? '')),
    [column, instances],
  );
  const total = items.reduce((acc, i) => acc + i.amountCents, 0);
  const { setNodeRef, isOver } = useDroppable({
    id: `col:member:${column.memberType}:${column.memberId}`,
  });
  const accent = column.color ?? '#5B6072';
  return (
    <section
      ref={setNodeRef}
      data-droppable="1"
      className={`flex w-[18rem] flex-shrink-0 flex-col gap-2 rounded-chunky p-3 ring-2 ring-ink-900 shadow-paper transition sm:w-[20rem] xl:w-[22rem] 2xl:w-[24rem] ${
        isOver ? 'outline outline-2 outline-offset-2' : ''
      }`}
      style={{
        backgroundColor: hexAlpha(accent, 0.18),
        outlineColor: isOver ? accent : 'transparent',
      }}
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <MemberAvatar name={column.name} color={accent} size="sm" />
          <h2 className="truncate font-display text-base font-bold sm:text-lg 2xl:text-xl">
            {column.name}
          </h2>
          {rollup && (
            <StreakChip
              streak={rollup.stats.streak}
              bestStreak={rollup.stats.bestStreak}
              size="xs"
            />
          )}
        </div>
        <AnimatedNumber
          value={total}
          format={money}
          className="money-amt text-sm sm:text-base"
        />
      </header>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <DropHint accent={accent} />
        ) : (
          items.map((inst) => (
            <DraggableCard
              key={inst.id}
              instance={inst}
              draggable={canDrag(inst, column, isParent, me)}
              accentColor={accent}
              claimedByName={
                inst.claimedByType && inst.claimedById
                  ? lookup.byKey(inst.claimedByType, inst.claimedById)?.name
                  : null
              }
              isParent={isParent}
              roster={roster}
              onSetStatus={onSetStatus}
              canSubmit={canSubmit(inst, isParent, me)}
              onSubmit={onSubmit}
              canUnclaim={canUnclaim(inst, isParent, me)}
              onUnclaim={onUnclaim}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DropHint({ accent }: { accent: string }) {
  return (
    <div
      className="grid place-items-center rounded-xl py-8 text-center text-[11px] font-bold uppercase tracking-wider text-ink-700 transition"
      style={{
        border: `2px dashed ${accent}`,
        backgroundColor: 'transparent',
      }}
    >
      <div>
        <div className="opacity-70">Drop a chore here</div>
        <div className="mt-1 text-[10px] font-semibold normal-case opacity-60">
          (or use the ⋯ menu)
        </div>
      </div>
    </div>
  );
}

function PendingColumn({
  instances,
  isParent,
  me,
  lookup,
  roster,
  onApprove,
  onReject,
  onSetStatus,
  onApproveAll,
}: {
  instances: BoardInstance[];
  isParent: boolean;
  me: { type: 'user' | 'kid'; id: string } | null;
  lookup: ReturnType<typeof buildMemberLookup>;
  roster: RosterMember[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSetStatus: SetStatusFn;
  onApproveAll?: () => void;
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'pending')
        .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')),
    [instances],
  );
  const { setNodeRef, isOver } = useDroppable({ id: 'col:pending' });
  return (
    <section
      ref={setNodeRef}
      data-droppable="1"
      className={`card flex flex-col gap-2 p-4 sm:p-5 ${
        isOver ? 'outline outline-2 outline-offset-2 outline-accent-orange' : ''
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold sm:text-lg 2xl:text-xl">
          Pending · <span className="text-ink-500">{items.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          {items.length > 0 && <span className="pill-pending">{items.length} waiting</span>}
          {isParent && items.length >= 2 && onApproveAll && (
            <button type="button" className="btn-money" onClick={onApproveAll}>
              Approve all
            </button>
          )}
        </div>
      </header>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState
            illustration="pending"
            compact
            title="Inbox zero"
            body="Nothing waiting for approval right now."
          />
        ) : (
          items.map((inst) => {
            const claimer =
              inst.claimedByType && inst.claimedById
                ? lookup.byKey(inst.claimedByType, inst.claimedById)
                : undefined;
            return (
              <DraggableCard
                key={inst.id}
                instance={inst}
                draggable={canDrag(inst, { kind: 'pending' }, isParent, me)}
                claimedByName={claimer?.name ?? null}
                showApproveActions={isParent}
                onApprove={onApprove}
                onReject={onReject}
                isParent={isParent}
                roster={roster}
                onSetStatus={onSetStatus}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function CompletedColumn({
  instances,
  lookup,
  isParent,
  roster,
  onSetStatus,
}: {
  instances: BoardInstance[];
  lookup: ReturnType<typeof buildMemberLookup>;
  isParent: boolean;
  roster: RosterMember[];
  onSetStatus: SetStatusFn;
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'approved')
        .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '')),
    [instances],
  );
  return (
    <section className="card flex flex-col gap-2 p-4 sm:p-5">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold sm:text-lg 2xl:text-xl">
          Completed today · <span className="text-ink-500">{items.length}</span>
        </h2>
        {items.length > 0 && (
          <span className="pill-approved">✓ {items.length}</span>
        )}
      </header>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState
            illustration="completed"
            compact
            title="No chores filed yet today"
            body="Approved chores show up here, ready for Sunday."
          />
        ) : (
          items.map((inst) => {
            const claimer =
              inst.claimedByType && inst.claimedById
                ? lookup.byKey(inst.claimedByType, inst.claimedById)
                : undefined;
            return (
              <CardShell
                key={inst.id}
                instance={inst}
                draggable={false}
                claimedByName={claimer?.name ?? null}
                accentColor={claimer?.color}
                isParent={isParent}
                roster={roster}
                onSetStatus={onSetStatus}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

function canDrag(
  inst: BoardInstance,
  col: Column,
  isParent: boolean,
  me: { type: 'user' | 'kid'; id: string } | null,
): boolean {
  if (col.kind === 'completed') return false;
  if (isParent) return true;
  if (!me) return false;
  if (col.kind === 'available') return true;
  if (col.kind === 'member')
    return col.memberType === me.type && col.memberId === me.id;
  if (col.kind === 'pending') {
    return inst.claimedByType === me.type && inst.claimedById === me.id;
  }
  return false;
}

function DraggableCard({
  instance,
  draggable,
  accentColor,
  tone = 'onLight',
  claimedByName,
  showApproveActions,
  onApprove,
  onReject,
  isParent,
  roster,
  onSetStatus,
  canSubmit,
  onSubmit,
  canUnclaim,
  onUnclaim,
}: {
  instance: BoardInstance;
  draggable: boolean;
  accentColor?: string;
  tone?: 'onLight' | 'onDark';
  claimedByName?: string | null;
  showApproveActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  isParent?: boolean;
  roster?: RosterMember[];
  onSetStatus?: SetStatusFn;
  canSubmit?: boolean;
  onSubmit?: (id: string) => void;
  canUnclaim?: boolean;
  onUnclaim?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: instance.id,
    disabled: !draggable,
  });
  // `data-dnd-draggable` lets index.css give the card a subtle "press to lift"
  // affordance during the TouchSensor delay window. We deliberately do NOT set
  // `touch-action: none` here — the TouchSensor's delay activation lets the
  // browser keep handling pan/scroll until a real long-press registers.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-dnd-draggable={draggable ? '' : undefined}
      data-dnd-dragging={isDragging ? '' : undefined}
      style={{
        opacity: isDragging ? 0 : 1,
        // Skip the press-affordance transition during the active drag so the
        // (now-invisible) source card doesn't visibly transform underneath
        // the floating overlay.
        transition: isDragging ? 'none' : undefined,
      }}
    >
      <CardShell
        instance={instance}
        draggable={draggable}
        accentColor={accentColor}
        tone={tone}
        claimedByName={claimedByName}
        showApproveActions={showApproveActions}
        onApprove={onApprove}
        onReject={onReject}
        isParent={isParent}
        roster={roster}
        onSetStatus={onSetStatus}
        canSubmit={canSubmit}
        onSubmit={onSubmit}
        canUnclaim={canUnclaim}
        onUnclaim={onUnclaim}
      />
    </div>
  );
}

function CardShell({
  instance,
  draggable,
  accentColor,
  tone = 'onLight',
  claimedByName,
  showApproveActions,
  onApprove,
  onReject,
  overlay,
  isParent,
  roster,
  onSetStatus,
  canSubmit,
  onSubmit,
  canUnclaim,
  onUnclaim,
}: {
  instance: BoardInstance;
  draggable: boolean;
  accentColor?: string;
  tone?: 'onLight' | 'onDark';
  claimedByName?: string | null;
  showApproveActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  overlay?: boolean;
  isParent?: boolean;
  roster?: RosterMember[];
  onSetStatus?: SetStatusFn;
  canSubmit?: boolean;
  onSubmit?: (id: string) => void;
  canUnclaim?: boolean;
  onUnclaim?: (id: string) => void;
}) {
  const overdue = instance.overdue;
  return (
    <article
      className={`relative flex select-none items-start gap-3 rounded-xl bg-paper p-3 ring-2 ring-ink-900 shadow-paper-sm transition ${
        overlay ? '' : 'animate-floatIn'
      } ${draggable ? 'cursor-grab hover:-translate-y-0.5 hover:shadow-paper active:cursor-grabbing' : 'cursor-default'} ${
        overlay ? 'rotate-1 scale-[1.02] shadow-paper' : ''
      } ${overdue ? 'animate-pulseRed ring-accent-red' : ''} ${tone === 'onDark' ? 'bg-cream-50' : ''}`}
      style={
        accentColor
          ? {
              borderLeftWidth: 6,
              borderLeftStyle: 'solid',
              borderLeftColor: accentColor,
              paddingLeft: '0.65rem',
            }
          : undefined
      }
    >
      <ChoreIcon name={instance.choreName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold leading-tight text-ink-900">
            {instance.choreName}
          </h3>
          <div className="flex items-center gap-1">
            <MoneyCell amountCents={instance.amountCents} />
            {isParent && roster && onSetStatus && !overlay && (
              <CardActionsMenu
                instance={instance}
                roster={roster}
                onSetStatus={onSetStatus}
              />
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusPill
            status={instance.status}
            memberName={claimedByName}
            overdue={overdue}
            overdueSince={instance.dueAt}
          />
          <DueHint instance={instance} />
        </div>
        <EvidenceHint instance={instance} />
        {(canSubmit || canUnclaim) && !overlay && (
          <div className="mt-2 flex gap-2">
            {canSubmit && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSubmit?.(instance.id);
                }}
                className="btn-money flex-1 !py-1.5"
              >
                I&apos;m done
              </button>
            )}
            {canUnclaim && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnclaim?.(instance.id);
                }}
                aria-label="Return to Available"
                title="Return to Available"
                className={`btn-secondary !py-1.5 ${canSubmit ? '' : 'flex-1'}`}
              >
                Return
              </button>
            )}
          </div>
        )}
        {showApproveActions && (
          <div className="mt-2 flex gap-2">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                // Sparkle from the button to make the tap feel rewarding.
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                celebrate({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, {
                  pieces: 24,
                  spread: 140,
                  durationMs: 1600,
                });
                onApprove?.(instance.id);
              }}
              className="btn-money flex-1 !py-1.5"
            >
              Approve
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onReject?.(instance.id);
              }}
              className="btn-secondary !py-1.5"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function canSubmit(
  inst: BoardInstance,
  _isParent: boolean,
  me: { type: 'user' | 'kid'; id: string } | null,
): boolean {
  return (
    !!me &&
    inst.status === 'claimed' &&
    inst.claimedByType === me.type &&
    inst.claimedById === me.id
  );
}

// A claimed card can be sent back to Available by either:
//   - any parent (the API allows it), or
//   - the kid who currently claims it.
// We deliberately do NOT expose this for `pending` cards: the parent reject
// flow handles that, and a kid can't unclaim once they've submitted.
function canUnclaim(
  inst: BoardInstance,
  isParent: boolean,
  me: { type: 'user' | 'kid'; id: string } | null,
): boolean {
  if (inst.status !== 'claimed') return false;
  if (isParent) return true;
  return (
    !!me && inst.claimedByType === me.type && inst.claimedById === me.id
  );
}

function EvidenceHint({ instance }: { instance: BoardInstance }) {
  if (instance.status !== 'claimed' && instance.status !== 'pending') return null;

  const label = instance.photoKey
    ? 'Photo evidence attached'
    : instance.photoRequired
      ? 'Photo evidence required'
      : 'Photo evidence optional';

  return (
    <div className="mt-2 rounded-lg border-2 border-dashed border-ink-900/20 bg-cream-100 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
      {label}
    </div>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  // Accept "#RRGGBB"; fall back to a neutral if anything looks off.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(91,96,114,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Parent-only "⋯" menu on each card. Lets a parent move a card to any state
 * without using drag-and-drop, including assigning it to a specific member
 * (the kid "Claim for…" path) or approving from any state. Uses the
 * `POST /api/board/instances/:id/set-status` endpoint under the hood.
 */
function CardActionsMenu({
  instance,
  roster,
  onSetStatus,
}: {
  instance: BoardInstance;
  roster: RosterMember[];
  onSetStatus: SetStatusFn;
}) {
  const status = instance.status;
  const currentClaimant =
    instance.claimedByType && instance.claimedById
      ? { type: instance.claimedByType, id: instance.claimedById }
      : null;
  return (
    <Menu
      align="end"
      width={224}
      trigger={(open, setOpen) => (
        <button
          aria-label="Card actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="btn-icon text-ink-700"
        >
          <span className="text-xl leading-none">⋯</span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <MenuLabel>Move to</MenuLabel>
          <MenuItem
            disabled={status === 'available'}
            onClick={() => {
              onSetStatus(instance.id, { status: 'available' });
              close();
            }}
          >
            Available
          </MenuItem>
          <MenuLabel>Assign &amp; advance</MenuLabel>
          {roster.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-500">
              Add a member in /admin first.
            </p>
          )}
          {roster.map((m) => {
            const isCurrent =
              currentClaimant?.type === m.type && currentClaimant?.id === m.id;
            return (
              <MenuItem
                key={`${m.type}:${m.id}`}
                onClick={() => {
                  onSetStatus(instance.id, {
                    status: 'claimed',
                    claimant: { memberType: m.type, memberId: m.id },
                  });
                  close();
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: m.color ?? '#5B6072' }}
                  />
                  <span className="flex-1 truncate">
                    {isCurrent ? `Claim · ${m.name} (current)` : `Claim for ${m.name}`}
                  </span>
                </span>
              </MenuItem>
            );
          })}
          {currentClaimant && (
            <>
              <MenuDivider />
              <MenuItem
                disabled={status === 'pending' || status === 'approved'}
                onClick={() => {
                  onSetStatus(instance.id, {
                    status: 'pending',
                    claimant: {
                      memberType: currentClaimant.type,
                      memberId: currentClaimant.id,
                    },
                  });
                  close();
                }}
              >
                Send to pending
              </MenuItem>
              <MenuItem
                disabled={status === 'approved'}
                onClick={() => {
                  onSetStatus(instance.id, {
                    status: 'approved',
                    claimant: {
                      memberType: currentClaimant.type,
                      memberId: currentClaimant.id,
                    },
                  });
                  close();
                }}
              >
                ✓ Approve now
              </MenuItem>
            </>
          )}
          <MenuDivider />
          <MenuItem
            destructive
            disabled={status === 'missed'}
            onClick={() => {
              onSetStatus(instance.id, { status: 'missed' });
              close();
            }}
          >
            Mark missed
          </MenuItem>
        </div>
      )}
    </Menu>
  );
}
