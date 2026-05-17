import { useMemo, useState, type ReactNode } from 'react';
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
import { money, relativePast, timeUntil } from '../lib/format';
import { formatLongDate, formatPayoutShort } from '../lib/time';
import type {
  BoardInstance,
  BoardResponse,
  Chore,
  DevicePairing,
  Kid,
  LeaderboardResponse,
  Parent,
} from '../lib/types';
import { Link } from 'react-router-dom';
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
import { ParentSignInSheet } from '../ui/ParentSignInSheet';

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
  // PR 9 — kid-side reminder banner only renders when zero devices are
  // paired AND the parent hasn't dismissed the reminder yet. Parents see
  // it on the Kanban (and only on the Kanban — going to Family/History
  // shouldn't follow them around with the prompt). The query key is shared
  // with AdminFamily so the banner self-clears the moment a device is paired.
  const pairings = useQuery({
    queryKey: ['device-pairings'],
    queryFn: () =>
      api.get<{ pairings: DevicePairing[] }>('/api/family/pairings').then((r) => r.pairings),
    enabled: session.data?.kind === 'parent',
  });
  const [dragging, setDragging] = useState<BoardInstance | null>(null);
  // PR 7 — kid-side "Get a parent to approve" → ParentSignInSheet visibility.
  const [showParentSignIn, setShowParentSignIn] = useState(false);

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
        // We may be claiming on behalf of someone else (kid session dragging
        // a chore onto Mum's swim lane on the shared tablet), so name the
        // recipient instead of saying "yours".
        const target = vars.body as { memberType?: 'user' | 'kid'; memberId?: string } | undefined;
        const recipientName =
          target?.memberType === 'kid'
            ? board?.kids.find((k) => k.id === target.memberId)?.name
            : target?.memberType === 'user'
              ? board?.parents.find((p) => p.id === target.memberId)?.name
              : undefined;
        const detail = inst
          ? recipientName
            ? `${inst.choreName} → ${recipientName}`
            : inst.choreName
          : undefined;
        toastSuccess('Claimed', detail);
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
    ...board.parents.map((u) => ({ type: 'user' as const, id: u.id, name: u.name, color: u.color })),
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
      color: u.color,
    })),
  ];

  const todayLabel = formatLongDate(board.now, board.family.timezone);

  const nextRenewal = soonestRenewal(board.instances, board.now);

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
      // Any family member can release a `claimed` card back to Available
      // (it's an explicit "this is back up for grabs" gesture). Sending a
      // `pending` card back is effectively a reject and stays parent-only
      // — a kid session on the shared tablet shouldn't be able to silently
      // undo someone's "I'm done" without a parent in the loop.
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
        // The drop target *is* the identity assertion: drag-to-Wife's-lane
        // on the kitchen tablet claims for Wife even when the tablet is
        // PIN'd into a kid. The matching guard in /board/claim trusts the
        // explicit body target for any family member.
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
        // Same logic as above: dragging a claimed card to Pending is the
        // claimant saying "I'm done", and on the shared family tablet that
        // can be any family member, not just the currently-PIN'd kid.
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
      {/* Fit-to-viewport board.
       *
       * The page chrome (TopBar + DesktopTabs + LegalFooter) and the
       * Kanban's own header line consume roughly 200px of vertical real
       * estate. On an old 9.7" iPad (1024×768 CSS, landscape) that leaves
       * ~560px for the actual board. Rather than letting the page scroll
       * and forcing a parent to swipe past member lanes, we:
       *
       *   1. Lock the board to its parent's height with `h-full
       *      overflow-hidden` — no page scroll.
       *   2. Distribute the swim-lane row across the full viewport with
       *      equal-width columns (via [data-kanban-lanes] CSS).
       *   3. Let each column scroll its own card list internally.
       *   4. Render Pending + Completed as a compact bottom strip with
       *      row-style entries instead of full chore cards — that turns
       *      a ~280px "second row" into a ~140-180px tray that still
       *      shows the next 3-4 items at a glance.
       */}
      <div
        data-kanban-root="1"
        className="flex min-h-full flex-col gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-5 2xl:gap-6 2xl:p-7"
      >
        <PairTabletReminder
          family={board.family}
          pairings={pairings.data ?? []}
          isParent={isParent}
        />

        <div className="mx-auto w-full max-w-[1800px] flex-shrink-0">
          <DesktopTitle
            compact
            date={todayLabel.toUpperCase()}
            title="The board"
            subtitle={
              nextRenewal
                ? `Next renewal in ${timeUntil(nextRenewal)}${leaderboard.data?.payoutAt ? ` · Pays out ${formatPayoutShort(leaderboard.data.payoutAt, board.family.timezone)}` : ''}`
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

        {/* Row 1 — Available + member lanes. Equal-width on tablet+, with
            horizontal scroll-snap on phones (where 4 columns never fit). */}
        <div className="mx-auto w-full max-w-[1800px] flex-shrink-0">
          <div data-kanban-lanes>
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

        {/* Row 2 — Pending + Completed compact tray. Each column caps at
            ~24vh on short viewports and scrolls internally; on a tall
            monitor it stays a roomy 320px max. */}
        <div className="mx-auto w-full max-w-[1800px]" data-kanban-tray>
          <PendingTrayColumn
            instances={board.instances}
            isParent={isParent}
            lookup={lookup}
            onApprove={(id) => action.mutate({ instanceId: id, action: 'approve' })}
            onReject={(id) => action.mutate({ instanceId: id, action: 'reject' })}
            onApproveAll={approveAll}
            onGetAParent={!isParent ? () => setShowParentSignIn(true) : undefined}
          />
          <CompletedTrayColumn
            instances={board.instances}
            lookup={lookup}
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

      <ParentSignInSheet
        open={showParentSignIn}
        context={(() => {
          const pending = board.instances.filter((i) => i.status === 'pending');
          if (pending.length === 0) return undefined;
          if (pending.length === 1) {
            const inst = pending[0]!;
            const claimer =
              inst.claimedByType && inst.claimedById
                ? lookup.byKey(inst.claimedByType, inst.claimedById)
                : undefined;
            return claimer
              ? `${claimer.name} finished ${inst.choreName}. Approve from here?`
              : `${inst.choreName} is waiting for approval.`;
          }
          return `${pending.length} chores are waiting for approval.`;
        })()}
        onCancel={() => setShowParentSignIn(false)}
      />

      {/* Errors flow through the global Toast viewport — see action.onError. */}
    </DndContext>
  );
}

function soonestRenewal(list: BoardInstance[], nowIso: string): string | null {
  const now = new Date(nowIso).getTime();
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

/**
 * Tiny inline leaderboard pill row used in the Kanban's compact header.
 *
 * Two breakpoints' worth of layout:
 *   - `< xl`: horizontal podium — one row of three (rank · avatar ·
 *     amount) pills that fits in a single 32px line so the title bar
 *     stays one row tall on an iPad in landscape.
 *   - `xl+`: the full stacked card with bar charts, ranks, and streak
 *     chips. Wide screens have room to spare so the richer view shows.
 */
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
    <>
      <div className="hidden items-center gap-1.5 sm:flex xl:hidden">
        <span className="page-tag mr-1 hidden lg:inline">This week</span>
        {entries.map((e, i) => {
          const r = memberLookup.get(e.memberType, e.memberId);
          return (
            <span
              key={`mini-${e.memberType}:${e.memberId}`}
              title={`${e.name} · ${money(e.amountCents)} this week`}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-1.5 py-1 text-[11px] font-bold text-cream-50 ring-2 ring-ink-900"
              style={{ paddingLeft: i === 0 ? 4 : undefined }}
            >
              {i === 0 && <span aria-hidden>👑</span>}
              <MemberAvatar
                name={e.name}
                color={e.color}
                size="xs"
                className="!h-5 !w-5 !text-[10px] !ring-1"
                level={r?.stats.level ?? null}
                gender={r?.member.displayGender}
                showLevelChip={false}
              />
              <AnimatedNumber
                value={e.amountCents}
                format={money}
                className="font-display tabular-nums text-cream-50"
              />
            </span>
          );
        })}
      </div>

      <div className="card-dark hidden w-72 px-4 py-3 xl:block">
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
                <span className="w-3 text-right text-xs text-cream-50/60">
                  {i + 1}
                </span>
                <MemberAvatar
                  name={e.name}
                  color={e.color}
                  size="xs"
                  level={rollup?.stats.level ?? null}
                  gender={rollup?.member.displayGender}
                  showLevelChip={false}
                />
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
    </>
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
      data-kanban-col=""
      className={`flex w-[18rem] flex-shrink-0 flex-col gap-2 rounded-chunky bg-ink-900 p-2.5 text-cream-50 ring-2 ring-ink-900 shadow-paper sm:p-3 ${
        isOver ? 'outline outline-2 outline-offset-2 outline-accent-yellow' : ''
      }`}
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-2 px-1 pt-0.5">
        <h2 className="font-display text-sm font-bold sm:text-base 2xl:text-lg">
          Available · <span className="text-cream-50/60">{items.length}</span>
        </h2>
        {onSpawn && <SpawnPicker chores={activeChores} onSpawn={onSpawn} />}
      </header>
      <div data-kanban-col-list="" className="flex flex-col gap-2 pr-0.5">
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
      data-kanban-col=""
      className={`flex w-[18rem] flex-shrink-0 flex-col gap-2 rounded-chunky p-2.5 ring-2 ring-ink-900 shadow-paper transition sm:p-3 ${
        isOver ? 'outline outline-2 outline-offset-2' : ''
      }`}
      style={{
        backgroundColor: hexAlpha(accent, 0.18),
        outlineColor: isOver ? accent : 'transparent',
        // Accent ribbon along the top edge — a 4px stripe in the member's
        // colour curves into the chunky corners and anchors the lane's
        // identity without leaning on the avatar to do all the work. We
        // shave the same 4px off the top padding so the header sits at the
        // same baseline as it would without the ribbon (p-2.5 → 10px - 4px
        // border = 6px).
        borderTop: `4px solid ${accent}`,
        paddingTop: 6,
      }}
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-2 px-1 pt-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <MemberAvatar
            name={column.name}
            color={accent}
            size="sm"
            level={rollup?.stats.level ?? null}
            gender={rollup?.member.displayGender}
          />
          <h2 className="truncate font-display text-sm font-bold sm:text-base 2xl:text-lg">
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
      <div data-kanban-col-list="" className="flex flex-col gap-2 pr-0.5">
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
  // Soft dashed empty-state that nests inside the chunky column. The radius
  // (`rounded-2xl` = 16px) is one step in from the lane's `rounded-chunky`
  // (22px) → 10-12px inner padding for a concentric look. The dashed border
  // sits at 55% accent opacity so it reads as a hint rather than another
  // hard border competing with the lane's dark ring; a 6% accent-tinted
  // fill keeps the box from feeling like a hollow rectangle.
  return (
    <div
      className="grid place-items-center rounded-2xl px-3 py-6 text-center transition sm:py-7"
      style={{
        border: `2px dashed ${hexAlpha(accent, 0.55)}`,
        backgroundColor: hexAlpha(accent, 0.06),
      }}
    >
      <div className="flex flex-col items-center gap-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-700/80">
          Drop a chore here
        </div>
        <div className="text-[10px] font-medium text-ink-500/80">
          or use the ⋯ menu
        </div>
      </div>
    </div>
  );
}

/**
 * Compact tray version of the Pending column. Lives in Row 2 of the board
 * and renders each pending chore as a single dense row (avatar · name ·
 * meta · approve · reject) instead of the full chore card. This keeps the
 * "needs a parent" queue glanceable without consuming a full card's worth
 * of vertical real estate per item.
 *
 * Drag-and-drop is retained on the section itself so dragging a claimed
 * card onto the tray still submits it.
 */
function PendingTrayColumn({
  instances,
  isParent,
  lookup,
  onApprove,
  onReject,
  onApproveAll,
  onGetAParent,
}: {
  instances: BoardInstance[];
  isParent: boolean;
  lookup: ReturnType<typeof buildMemberLookup>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll?: () => void;
  /** Kid-only callback that opens the ParentSignInSheet so a parent
   *  walking up to the tablet can elevate and approve in place (PR 7). */
  onGetAParent?: () => void;
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
      data-tray-col=""
      className={`card gap-2 p-3 sm:p-3.5 ${
        isOver ? 'outline outline-2 outline-offset-2 outline-accent-orange' : ''
      }`}
    >
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 pb-1">
        <h2 className="font-display text-sm font-bold sm:text-base">
          Pending · <span className="text-ink-500">{items.length}</span>
        </h2>
        <div className="flex items-center gap-1.5">
          {items.length > 0 && (
            <span className="pill-pending">{items.length} waiting</span>
          )}
          {isParent && items.length >= 2 && onApproveAll && (
            <button
              type="button"
              className="btn-money !min-h-[32px] !px-3 !py-1 text-xs"
              onClick={onApproveAll}
            >
              Approve all
            </button>
          )}
        </div>
      </header>
      <div data-tray-list="" className="flex flex-col gap-1.5 pr-0.5">
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
              <TrayRow
                key={inst.id}
                instance={inst}
                claimer={claimer}
                waitingForParent={!isParent}
                actions={
                  isParent ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          celebrate(
                            { x: r.left + r.width / 2, y: r.top + r.height / 2 },
                            { pieces: 22, spread: 130, durationMs: 1500 },
                          );
                          onApprove(inst.id);
                        }}
                        className="btn-money !min-h-[32px] !px-2.5 !py-1 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReject(inst.id);
                        }}
                        className="btn-secondary !min-h-[32px] !px-2.5 !py-1 text-xs"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null
                }
              />
            );
          })
        )}
      </div>
      {!isParent && items.length > 0 && onGetAParent && (
        <button
          type="button"
          onClick={onGetAParent}
          className="btn-secondary mt-2 w-full !min-h-[44px] text-sm"
          aria-label="Get a parent to approve these pending chores"
        >
          Get a parent to approve →
        </button>
      )}
    </section>
  );
}

/**
 * Compact tray version of "Completed today". Read-only summary — the
 * point on the Kanban is "what got done"; the audit trail lives on the
 * Budget desktop.
 */
function CompletedTrayColumn({
  instances,
  lookup,
}: {
  instances: BoardInstance[];
  lookup: ReturnType<typeof buildMemberLookup>;
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'approved')
        .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '')),
    [instances],
  );
  return (
    <section data-tray-col="" className="card gap-2 p-3 sm:p-3.5">
      <header className="flex flex-shrink-0 items-center justify-between pb-1">
        <h2 className="font-display text-sm font-bold sm:text-base">
          Completed today · <span className="text-ink-500">{items.length}</span>
        </h2>
        {items.length > 0 && (
          <span className="pill-approved">✓ {items.length}</span>
        )}
      </header>
      <div data-tray-list="" className="flex flex-col gap-1.5 pr-0.5">
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
            return <TrayRow key={inst.id} instance={inst} claimer={claimer} dimmed />;
          })
        )}
      </div>
    </section>
  );
}

/**
 * Single-row entry for the Pending / Completed tray. Renders all the same
 * info as a full chore card (chore name, claimant, money, status,
 * overdue state) but in a flat row — roughly 40px tall, vs ~95px for the
 * full card. This is what makes the bottom strip fit in ~140-180px on
 * the iPad without losing context.
 */
function TrayRow({
  instance,
  claimer,
  actions,
  dimmed,
  waitingForParent,
}: {
  instance: BoardInstance;
  claimer?: { name: string; color?: string };
  actions?: ReactNode;
  dimmed?: boolean;
  /** True when a kid principal is staring at their own pending card on a
   *  shared family device. Yellow inset ring + slow `pendingWait` pulse,
   *  defined by `[data-waiting-parent='1']` in index.css. */
  waitingForParent?: boolean;
}) {
  const overdue = instance.overdue;
  // When a claimer's accent is set we want both the left-edge color ribbon
  // *and* whatever ring the row's status calls for (red when overdue, ink
  // otherwise). The combined inline box-shadow needs to win over the CSS
  // selectors via specificity, so we compose the full shadow string here
  // when a ribbon is in play and let the CSS default render otherwise.
  // Skip the inline shadow when waitingForParent so the yellow CSS rule wins.
  const ringColor = overdue ? '#DB4646' : 'rgba(16, 24, 43, 0.92)';
  return (
    <div
      data-tray-item=""
      data-overdue={overdue ? '1' : undefined}
      data-waiting-parent={waitingForParent ? '1' : undefined}
      style={
        claimer?.color && !waitingForParent
          ? {
              boxShadow: `inset 4px 0 0 0 ${claimer.color}, inset 0 0 0 2px ${ringColor}`,
            }
          : undefined
      }
    >
      {claimer && (
        <MemberAvatar name={claimer.name} color={claimer.color} size="xs" />
      )}
      <span data-tray-name="" className={dimmed ? 'opacity-80' : undefined}>
        {instance.choreName}
      </span>
      <span data-tray-meta="" className="hidden sm:inline">
        {instance.status === 'approved' && instance.approvedAt
          ? relativePast(instance.approvedAt)
          : instance.status === 'pending' && instance.completedAt
            ? `done ${relativePast(instance.completedAt)}`
            : claimer?.name ?? ''}
      </span>
      <span className={`money-amt flex-shrink-0 text-sm ${dimmed ? 'opacity-70' : ''}`}>
        {money(instance.amountCents)}
      </span>
      {actions}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

function canDrag(
  _inst: BoardInstance,
  col: Column,
  _isParent: boolean,
  _me: { type: 'user' | 'kid'; id: string } | null,
): boolean {
  // Completed cards are immutable. Everything else on the board is draggable
  // from any session — the Kanban is treated as a shared family surface, and
  // the API checks that the *target* of each action lives in the family
  // (rather than gating on who's currently PIN'd into the tablet). That
  // lets a parent on the kitchen wall reach into their own swim lane to
  // submit work even when a kid is currently signed in.
  return col.kind !== 'completed';
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
      data-chore-card=""
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

// The "I'm done" quick-action mirrors the drag-to-Pending gesture: any
// signed-in family member can mark any claimed card as submitted from the
// shared family tablet. The matching `/board/submit` API has the same trust
// model.
function canSubmit(
  inst: BoardInstance,
  _isParent: boolean,
  me: { type: 'user' | 'kid'; id: string } | null,
): boolean {
  return !!me && inst.status === 'claimed';
}

// The "Return to Available" quick-action mirrors drag-to-Available: any
// signed-in family member can release a `claimed` card. We deliberately do
// NOT expose this for `pending` cards — the parent reject flow handles that
// and nobody should be able to silently undo a claimant's "I'm done"
// without a parent in the loop.
function canUnclaim(
  inst: BoardInstance,
  _isParent: boolean,
  me: { type: 'user' | 'kid'; id: string } | null,
): boolean {
  return !!me && inst.status === 'claimed';
}

function EvidenceHint({ instance }: { instance: BoardInstance }) {
  if (instance.status !== 'claimed' && instance.status !== 'pending') return null;

  const label = instance.photoKey
    ? 'Photo evidence attached'
    : instance.photoRequired
      ? 'Photo evidence required'
      : 'Photo evidence optional';

  return (
    <div
      data-evidence-hint=""
      className="mt-2 rounded-lg border-2 border-dashed border-ink-900/20 bg-cream-100 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500"
    >
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

/**
 * "Pair a kitchen tablet" sticky reminder strip. Lives ONLY on the Kanban
 * (not the Family / History / Schedule desktops) because:
 *   • The Kanban is the desktop a kid can't reach without sign-in, so the
 *     prompt is most semantically tied to the screen where the missing
 *     pairing causes a problem.
 *   • Showing it on every desktop would feel naggy and dilute the cohesion
 *     of the rest of the app.
 *
 * Visibility:
 *   • The viewer is a parent (kids never see this).
 *   • The family has zero paired devices (`pairings.length === 0` filtered
 *     to active+pending, so revoked / expired entries don't suppress the
 *     reminder).
 *   • The parent hasn't dismissed it via AdminFamily → Paired devices.
 *
 * Dismissal happens *only* from the AdminFamily panel — there's no "x" on
 * the banner itself. A casual close shouldn't kill the prompt and undermine
 * the second-user pillar; the dismissal is a deliberate "I know, leave me
 * alone" act, lived inside the surface that exposes the actual fix.
 */
function PairTabletReminder({
  family,
  pairings,
  isParent,
}: {
  family: BoardResponse['family'];
  pairings: DevicePairing[];
  isParent: boolean;
}) {
  if (!isParent) return null;
  if (family.pairingReminderDismissedAt) return null;
  // Only "active" or "pending" pairings count as "we have a paired device" —
  // a revoked or expired row is bookkeeping, not a working tablet.
  const hasUsableDevice = pairings.some(
    (p) => p.status === 'active' || p.status === 'pending',
  );
  if (hasUsableDevice) return null;

  return (
    <div className="mx-auto w-full max-w-[1800px] flex-shrink-0">
      <Link
        to="/admin/family#paired-devices"
        className="flex items-center justify-between gap-3 rounded-xl bg-cream-200 px-4 py-2.5 text-sm font-semibold text-ink-900 ring-2 ring-ink-900/15 transition hover:bg-cream-100 sm:py-3"
        aria-label="Pair a kitchen tablet"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-lg">📱</span>
          <span>Pair a kitchen tablet so kids can sign in too</span>
        </span>
        <span aria-hidden className="text-lg leading-none text-ink-500">
          →
        </span>
      </Link>
    </div>
  );
}
