import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { money, relativePast, timeUntil } from '../lib/format';
import { useSession, useLogout } from '../lib/session';
import { useSseStatus } from '../lib/sseStatus';
import {
  useFamilyMemberStats,
  rollupByKey,
  type MemberRollup,
} from '../lib/useFamilyMemberStats';
import type {
  BoardInstance,
  BoardResponse,
  Goal,
  LeaderboardResponse,
  MemberType,
} from '../lib/types';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { ChoreIcon, MemberAvatar, ProgressBar } from '../ui/primitives';
import { IdentityPrompt, type IdentityScope, type ResolvedIdentity } from '../ui/IdentityPrompt';
import { StreakChip } from '../ui/StreakChip';
import { toastError, toastMoney, toastSuccess } from '../ui/Toast';
import { celebrate } from '../lib/celebrate';

/** Subtle haptic feedback on touch devices that support `navigator.vibrate`. */
function tinyHaptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

/** Closed-week row from `/api/ledger/weeks`. Mirrors the AdminLedger shape. */
type WeekRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  championMemberType: MemberType | null;
  championMemberId: string | null;
  championAmountCents: number | null;
  totals: Array<{
    memberType: MemberType;
    memberId: string;
    totalCents: number;
    unpaidCents: number;
    count: number;
  }>;
};

/**
 * Full-screen kitchen-wall display, inspired by the Apple TV App Store:
 * dark theme, huge type, glass cards, vibrant accent gradients, auto-cycling
 * featured slides, live clock, and a slide-progress strip at the very top.
 *
 * Activation paths (handled outside this component):
 *   1. `?tv=1` query parameter (used by kiosk pinning + the TopBar button).
 *   2. The "TV" button in the global TopBar.
 *   3. Triple-tap on the Family dashboard header (power-user hint).
 *
 * Exit paths:
 *   - The corner "Exit TV" chip.
 *   - Esc key.
 */
export function TVMode({ onExit }: { onExit: () => void }) {
  const session = useSession();
  const qc = useQueryClient();
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardResponse>('/api/board'),
    refetchInterval: 60_000,
  });
  const leaderboard = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get<LeaderboardResponse>('/api/stats/leaderboard'),
    refetchInterval: 60_000,
  });
  const goals = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get<{ goals: Goal[] }>('/api/goals').then((r) => r.goals),
    refetchInterval: 120_000,
  });
  // Lifetime family totals — drives the "Family stats" slide.
  const familyStats = useQuery({
    queryKey: ['family-stats'],
    queryFn: () =>
      api.get<{ lifetimeCents: number; lifetimeChores: number }>('/api/stats/family'),
    refetchInterval: 5 * 60_000,
  });
  // Closed weeks → champion of the week. Same shape used by AdminLedger.
  const weeks = useQuery({
    queryKey: ['ledger-weeks'],
    queryFn: () =>
      api
        .get<{ weeks: WeekRow[] }>('/api/ledger/weeks')
        .then((r) => r.weeks),
    refetchInterval: 5 * 60_000,
  });

  // ----------------------------------------------------- Interactive actions
  // Identity gate: every claim / submit on the wall iPad asks "Who's this?"
  // up front so siblings can't act on each other's behalf by accident.
  type Pending =
    | { kind: 'claim'; instance: BoardInstance }
    | { kind: 'done'; instance: BoardInstance };
  const [pending, setPending] = useState<Pending | null>(null);

  // Auto-rotation pause window after any interaction so we don't yank the
  // slide out from under a kid mid-PIN. 30 seconds resumes us automatically.
  const [softPauseUntil, setSoftPauseUntil] = useState<number | null>(null);
  useEffect(() => {
    if (softPauseUntil === null) return;
    const ms = softPauseUntil - Date.now();
    if (ms <= 0) {
      setSoftPauseUntil(null);
      return;
    }
    const t = setTimeout(() => setSoftPauseUntil(null), ms);
    return () => clearTimeout(t);
  }, [softPauseUntil]);
  const bumpInteraction = () => setSoftPauseUntil(Date.now() + 30_000);

  const claim = useMutation({
    mutationFn: (input: { instanceId: string; identity: ResolvedIdentity }) => {
      // When a parent is acting "for" a kid, the API accepts member targeting
      // in the body. Otherwise the session principal owns the claim.
      const body = input.identity.asParent
        ? { memberType: input.identity.memberType, memberId: input.identity.memberId }
        : undefined;
      return api.post(`/api/board/instances/${input.instanceId}/claim`, body);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      toastSuccess('Claimed', `${vars.identity.name}, it's yours.`);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t claim', friendlyError(err.message));
    },
  });

  const submit = useMutation({
    mutationFn: (input: { instanceId: string; identity: ResolvedIdentity }) =>
      api.post(`/api/board/instances/${input.instanceId}/submit`),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      toastMoney(`Nice work, ${vars.identity.name}!`, 'Waiting for a parent to approve.');
      // Local celebration on the wall — feels rewarding.
      celebrate(null, { pieces: 70, spread: 320, durationMs: 2600 });
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t submit', friendlyError(err.message));
    },
  });

  // Parent-only approval / rejection. Gated in the slide so non-parents can't
  // even fire these requests; the API will also enforce it.
  const approve = useMutation({
    mutationFn: (instanceId: string) =>
      api.post(`/api/board/instances/${instanceId}/approve`),
    onSuccess: (_d, instanceId) => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      const inst = board.data?.instances.find((i) => i.id === instanceId);
      if (inst) {
        toastMoney(`Approved · ${money(inst.amountCents)}`, inst.choreName);
      } else {
        toastSuccess('Approved');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t approve', friendlyError(err.message));
    },
  });
  const reject = useMutation({
    mutationFn: (instanceId: string) =>
      api.post(`/api/board/instances/${instanceId}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      toastSuccess('Sent back', 'The card is back with the claimant.');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t reject', friendlyError(err.message));
    },
  });

  const handleResolve = (id: ResolvedIdentity) => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'claim') claim.mutate({ instanceId: p.instance.id, identity: id });
    else submit.mutate({ instanceId: p.instance.id, identity: id });
  };

  // Per-member streak rollup shared across the app.
  const memberStatsQ = useFamilyMemberStats(board.data);
  const memberRollup = memberStatsQ.data;
  const memberLookup = rollupByKey(memberRollup);

  // -------------------------------------------------------------- Slides
  // Interactive slides are pinned earlier in the carousel so a kid walking
  // up to the wall sees their actionable options within ~22 seconds.
  const slides = useMemo(() => {
    const list: Array<{ id: string; theme: SlideTheme }> = [{ id: 'hero', theme: 'gold' }];
    const availableNow = (board.data?.instances ?? []).filter(
      (i) => i.status === 'available',
    );
    const inProgress = (board.data?.instances ?? []).filter(
      (i) => i.status === 'claimed',
    );
    const pendingApproval = (board.data?.instances ?? []).filter(
      (i) => i.status === 'pending',
    );
    if (availableNow.length > 0) {
      list.push({ id: 'available', theme: 'orange' });
    }
    if (inProgress.length > 0) {
      list.push({ id: 'doing', theme: 'green' });
    }
    if (pendingApproval.length > 0) {
      list.push({ id: 'approvals', theme: 'pink' });
    }
    if ((leaderboard.data?.entries ?? []).length > 0) {
      list.push({ id: 'leaderboard', theme: 'orange' });
    }
    const approvedToday = todaysApproved(board.data?.instances ?? [], board.data?.now);
    if (approvedToday.length > 0) {
      list.push({ id: 'today', theme: 'green' });
    }
    if ((goals.data ?? []).length > 0) {
      list.push({ id: 'goals', theme: 'purple' });
    }
    if ((memberRollup ?? []).some((s) => s.stats.streak > 0)) {
      list.push({ id: 'streaks', theme: 'pink' });
    }
    // Champion of the most recently closed week — only show if we have one.
    const lastClosed = (weeks.data ?? []).find(
      (w) => w.closedAt && w.championMemberId,
    );
    if (lastClosed) {
      list.push({ id: 'champion', theme: 'gold' });
    }
    // Lifetime family stats — fun ambient context, always last in the loop.
    if ((familyStats.data?.lifetimeChores ?? 0) > 0) {
      list.push({ id: 'family', theme: 'purple' });
    }
    return list;
  }, [
    board.data,
    leaderboard.data,
    goals.data,
    memberRollup,
    weeks.data,
    familyStats.data,
  ]);

  const [idx, setIdx] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const safeIdx = Math.min(idx, Math.max(0, slides.length - 1));

  // Effective pause: user pressed pause OR a modal is open OR an interaction
  // happened recently. The progress strip and auto-advance both honour this.
  const paused =
    userPaused ||
    pending !== null ||
    (softPauseUntil !== null && Date.now() < softPauseUntil);
  const setPaused = setUserPaused;

  // Auto-rotate every ROTATE_MS. Restart timer whenever slide changes or
  // pause toggles, so the progress strip stays in sync with reality.
  const ROTATE_MS = 11_000;
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setTimeout(() => {
      setIdx((i) => (i + 1) % Math.max(1, slides.length));
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [safeIdx, paused, slides.length]);

  // Esc closes the identity modal first if it's open, otherwise exits TV.
  // Arrow keys step slides, space toggles pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pending !== null) setPending(null);
        else onExit();
      } else if (e.key === 'ArrowRight')
        setIdx((i) => (i + 1) % Math.max(1, slides.length));
      else if (e.key === 'ArrowLeft')
        setIdx((i) => (i - 1 + slides.length) % Math.max(1, slides.length));
      else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, onExit, pending]);

  // Hide global chrome (top bar + dot indicator) and request screen wake.
  useEffect(() => {
    document.body.dataset.tv = '1';
    let release: { release: () => Promise<void> } | undefined;
    const ws = (navigator as any).wakeLock;
    ws?.request?.('screen').then((r: any) => (release = r)).catch(() => undefined);
    return () => {
      delete document.body.dataset.tv;
      release?.release?.();
    };
  }, []);

  // First-visit welcome hint. Stored in localStorage so it only shows once
  // per device, fades automatically after ~7s.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem('cb-tv-seen')) {
        setShowHint(true);
        localStorage.setItem('cb-tv-seen', '1');
        const t = setTimeout(() => setShowHint(false), 7_000);
        return () => clearTimeout(t);
      }
    } catch {
      /* private-mode fallback: never show */
    }
  }, []);

  const slide = slides[safeIdx];
  const theme = slide?.theme ?? 'gold';

  // ----------------------------------------------------------- Touch zones
  // Tap-left = back, tap-right = forward, tap-center = pause toggle. Any
  // manual navigation bumps the interaction window so the carousel doesn't
  // fight the user.
  const onZoneTap = (zone: 'l' | 'c' | 'r') => {
    tinyHaptic();
    if (zone === 'l') {
      bumpInteraction();
      setIdx((i) => (i - 1 + slides.length) % Math.max(1, slides.length));
    } else if (zone === 'r') {
      bumpInteraction();
      setIdx((i) => (i + 1) % Math.max(1, slides.length));
    } else {
      setPaused((p) => !p);
    }
  };

  const total = leaderboard.data?.entries.reduce((acc, e) => acc + e.amountCents, 0) ?? 0;
  const familyName = board.data?.family.name;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink-900 text-cream-50"
      role="presentation"
    >
      <TVBackground theme={theme} />

      {/* Slide progress strip at the very top — segmented, the active segment
          fills over ROTATE_MS, paused segments freeze. */}
      <ProgressStrip
        count={slides.length}
        activeIdx={safeIdx}
        durationMs={ROTATE_MS}
        paused={paused}
      />

      {/* Top chrome: family name + live clock + exit chip. */}
      <TopChrome
        familyName={familyName}
        payoutAt={leaderboard.data?.payoutAt ?? null}
        paused={paused}
        userPaused={userPaused}
        softPauseUntil={softPauseUntil}
        modalOpen={pending !== null}
        principal={session.data ?? null}
        onExit={onExit}
        onPause={() => setPaused((p) => !p)}
      />

      {/* Slide stage with crossfade. */}
      <main className="relative flex flex-1 items-stretch justify-stretch overflow-hidden">
        <SlideStage idKey={slide?.id ?? 'hero'}>
          {slide?.id === 'hero' && (
            <HeroSlide
              total={total}
              payoutAt={leaderboard.data?.payoutAt ?? null}
              familyName={familyName}
            />
          )}
          {slide?.id === 'available' && board.data && (
            <AvailableSlide
              instances={board.data.instances}
              onClaim={(inst) => {
                tinyHaptic();
                bumpInteraction();
                setPending({ kind: 'claim', instance: inst });
              }}
            />
          )}
          {slide?.id === 'doing' && board.data && (
            <DoingSlide
              instances={board.data.instances}
              kids={board.data.kids}
              parents={board.data.parents}
              onDone={(inst) => {
                tinyHaptic();
                bumpInteraction();
                setPending({ kind: 'done', instance: inst });
              }}
            />
          )}
          {slide?.id === 'approvals' && board.data && (
            <ApprovalsSlide
              instances={board.data.instances}
              kids={board.data.kids}
              parents={board.data.parents}
              isParent={session.data?.kind === 'parent'}
              onApprove={(inst, anchor) => {
                tinyHaptic();
                bumpInteraction();
                if (anchor) {
                  const r = anchor.getBoundingClientRect();
                  celebrate(
                    { x: r.left + r.width / 2, y: r.top + r.height / 2 },
                    { pieces: 36, spread: 220, durationMs: 1800 },
                  );
                }
                approve.mutate(inst.id);
              }}
              onReject={(inst) => {
                tinyHaptic();
                bumpInteraction();
                if (confirm(`Send "${inst.choreName}" back to the claimant?`)) {
                  reject.mutate(inst.id);
                }
              }}
            />
          )}
          {slide?.id === 'leaderboard' && leaderboard.data && (
            <LeaderboardSlide
              entries={leaderboard.data.entries}
              memberLookup={memberLookup}
            />
          )}
          {slide?.id === 'today' && board.data && (
            <TodaySlide board={board.data} />
          )}
          {slide?.id === 'goals' && board.data && goals.data && (
            <GoalsSlide goals={goals.data} board={board.data} />
          )}
          {slide?.id === 'streaks' && memberRollup && (
            <StreaksSlide rollup={memberRollup} />
          )}
          {slide?.id === 'champion' && weeks.data && board.data && (
            <ChampionSlide weeks={weeks.data} board={board.data} />
          )}
          {slide?.id === 'family' && familyStats.data && (
            <FamilyStatsSlide
              lifetimeCents={familyStats.data.lifetimeCents}
              lifetimeChores={familyStats.data.lifetimeChores}
              weekCount={(weeks.data ?? []).filter((w) => w.closedAt).length}
              memberCount={
                (board.data?.kids.length ?? 0) + (board.data?.parents.length ?? 0)
              }
            />
          )}
        </SlideStage>

        {/* Invisible touch zones. They never receive focus so they don't get
            in the way of keyboard nav, and z-index sits above the slide so
            taps reliably land. */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => onZoneTap('l')}
          className="absolute inset-y-0 left-0 w-1/4 cursor-default focus:outline-none"
          tabIndex={-1}
        />
        <button
          type="button"
          aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
          onClick={() => onZoneTap('c')}
          className="absolute inset-y-0 left-1/4 right-1/4 cursor-default focus:outline-none"
          tabIndex={-1}
        />
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => onZoneTap('r')}
          className="absolute inset-y-0 right-0 w-1/4 cursor-default focus:outline-none"
          tabIndex={-1}
        />
      </main>

      {/* Bottom slide dots — explicit nav for fingers on the wall iPad. */}
      <SlideDots
        count={slides.length}
        activeIdx={safeIdx}
        onPick={(i) => {
          tinyHaptic();
          bumpInteraction();
          setIdx(i);
        }}
        labels={slides.map((s) => s.id)}
      />


      {/* Identity prompt — open during any interactive claim or submit. */}
      <IdentityPrompt
        open={pending !== null}
        prompt={
          pending?.kind === 'claim'
            ? `Who's claiming "${pending.instance.choreName}"?`
            : pending?.kind === 'done'
              ? `Done with "${pending.instance.choreName}"?`
              : ''
        }
        scope={pendingScope(pending)}
        kids={board.data?.kids ?? []}
        parents={board.data?.parents ?? []}
        currentPrincipal={session.data ?? null}
        memberLookup={memberLookup}
        onResolve={handleResolve}
        onCancel={() => setPending(null)}
      />

      {/* First-visit welcome hint. Auto-fades. */}
      {showHint && (
        <button
          type="button"
          onClick={() => setShowHint(false)}
          aria-label="Dismiss hint"
          className="safe-pb pointer-events-auto fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-[min(640px,calc(100%-2rem))] animate-floatIn items-center gap-3 rounded-2xl bg-cream-50/12 px-5 py-4 text-left text-cream-50 ring-1 ring-cream-50/20 backdrop-blur-md sm:bottom-28 sm:px-6 sm:py-5"
        >
          <span aria-hidden className="text-2xl sm:text-3xl">
            👋
          </span>
          <span className="flex-1 text-sm font-semibold sm:text-base">
            <span className="block font-display text-base font-extrabold sm:text-lg">
              This screen is interactive.
            </span>
            <span className="text-cream-50/70">
              Tap a chore to claim it. Tap your face to confirm. Carousel pauses
              while you're tapping.
            </span>
          </span>
          <span className="hidden text-[10px] font-bold uppercase tracking-wider text-cream-50/55 sm:inline">
            Tap to dismiss
          </span>
        </button>
      )}
    </div>
  );
}

function pendingScope(pending: { kind: 'claim' | 'done'; instance: BoardInstance } | null): IdentityScope {
  if (!pending) return 'any';
  if (pending.kind === 'claim') return 'any';
  const inst = pending.instance;
  if (inst.claimedByType && inst.claimedById) {
    return { memberType: inst.claimedByType, memberId: inst.claimedById };
  }
  return 'any';
}

function friendlyError(code: string): string {
  switch (code) {
    case 'invalid_pin':
      return 'Wrong PIN.';
    case 'photo_required':
      return 'This chore needs a photo before you submit.';
    case 'not_yours':
      return 'That one belongs to someone else.';
    case 'already_submitted':
      return 'Already submitted — a parent has to approve.';
    case 'not_available':
      return 'Already claimed by someone else.';
    case 'not_yet_available':
      return 'Not available yet.';
    default:
      return code;
  }
}

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------

type SlideTheme = 'gold' | 'orange' | 'green' | 'purple' | 'pink';

function themeGradient(theme: SlideTheme): string {
  switch (theme) {
    case 'gold':
      return 'radial-gradient(60% 60% at 30% 0%, rgba(232,177,42,0.32), transparent 60%), radial-gradient(80% 60% at 110% 100%, rgba(224,126,46,0.22), transparent 60%)';
    case 'orange':
      return 'radial-gradient(60% 60% at 80% 0%, rgba(224,126,46,0.30), transparent 60%), radial-gradient(80% 60% at 0% 100%, rgba(232,177,42,0.18), transparent 60%)';
    case 'green':
      return 'radial-gradient(60% 60% at 50% 0%, rgba(60,161,99,0.30), transparent 60%), radial-gradient(80% 60% at 90% 100%, rgba(15,110,55,0.20), transparent 60%)';
    case 'purple':
      return 'radial-gradient(60% 60% at 20% 0%, rgba(139,91,217,0.32), transparent 60%), radial-gradient(70% 60% at 100% 100%, rgba(50,83,215,0.20), transparent 60%)';
    case 'pink':
      return 'radial-gradient(60% 60% at 80% 0%, rgba(226,92,166,0.32), transparent 60%), radial-gradient(70% 60% at 0% 100%, rgba(139,91,217,0.20), transparent 60%)';
  }
}

function todaysApproved(
  instances: BoardResponse['instances'],
  nowIso?: string,
): BoardResponse['instances'] {
  const now = nowIso ? new Date(nowIso) : new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return instances
    .filter((i) => i.status === 'approved' && i.approvedAt)
    .filter((i) => i.approvedAt && new Date(i.approvedAt).getTime() >= start.getTime())
    .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? ''));
}

// ---------------------------------------------------------------------------
// Background + chrome
// ---------------------------------------------------------------------------

function TVBackground({ theme }: { theme: SlideTheme }) {
  return (
    <>
      {/* Animated colored bloom behind the slide. The gradient swaps on
          theme change; we cross-fade with a CSS transition rather than
          re-mounting so it feels continuous, not slide-y. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: themeGradient(theme) }}
      />
      {/* Soft vignette to focus the eye. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 50%, transparent 50%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      {/* Subtle film grain — paper isn't a vector, neither is the TV. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />
    </>
  );
}

function ProgressStrip({
  count,
  activeIdx,
  durationMs,
  paused,
}: {
  count: number;
  activeIdx: number;
  durationMs: number;
  paused: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1.5 px-4 pt-3 sm:px-8 sm:pt-4"
    >
      {Array.from({ length: count }).map((_, i) => {
        const filled = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div
            key={i}
            className="h-1 flex-1 overflow-hidden rounded-full bg-cream-50/15 backdrop-blur-sm"
          >
            <div
              className="h-full rounded-full bg-cream-50/95"
              style={{
                width: filled ? '100%' : active ? '0%' : '0%',
                animation: active
                  ? `progressFill ${durationMs}ms linear forwards`
                  : 'none',
                animationPlayState: paused ? 'paused' : 'running',
              }}
              key={`${i}-${activeIdx}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function TopChrome({
  familyName,
  payoutAt,
  paused,
  userPaused,
  softPauseUntil,
  modalOpen,
  principal,
  onExit,
  onPause,
}: {
  familyName?: string;
  payoutAt: string | null;
  paused: boolean;
  userPaused: boolean;
  softPauseUntil: number | null;
  modalOpen: boolean;
  principal:
    | { kind: 'parent'; name: string }
    | { kind: 'kid'; name: string; color: string }
    | null;
  onExit: () => void;
  onPause: () => void;
}) {
  const sseStatus = useSseStatus();
  const logout = useLogout();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    // While a soft pause is active we tick once a second so the countdown
    // chip stays accurate; otherwise the slower clock update is plenty.
    const interval = softPauseUntil && softPauseUntil > Date.now() ? 1_000 : 15_000;
    const t = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(t);
  }, [softPauseUntil]);

  const resumeIn =
    !userPaused && !modalOpen && softPauseUntil && softPauseUntil > now.getTime()
      ? Math.max(0, Math.ceil((softPauseUntil - now.getTime()) / 1000))
      : null;

  const clock = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="safe-pt relative z-20 flex items-start justify-between gap-4 px-6 pt-7 sm:px-10 sm:pt-9 lg:px-14 lg:pt-11">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-cream-50/55 sm:text-xs lg:text-sm">
            ChoreBoard{familyName ? ` · ${familyName}` : ''}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:text-xs ${
              sseStatus === 'open'
                ? 'bg-money/20 text-money ring-1 ring-money/40'
                : sseStatus === 'connecting'
                  ? 'bg-accent-yellow/20 text-accent-yellow ring-1 ring-accent-yellow/40'
                  : 'bg-accent-red/20 text-accent-red ring-1 ring-accent-red/40'
            }`}
            title={
              sseStatus === 'open'
                ? 'Real-time updates active'
                : sseStatus === 'connecting'
                  ? 'Reconnecting…'
                  : 'Real-time updates offline'
            }
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                sseStatus === 'open'
                  ? 'bg-money'
                  : sseStatus === 'connecting'
                    ? 'bg-accent-yellow'
                    : 'bg-accent-red'
              } ${sseStatus === 'open' ? 'animate-pulse' : ''}`}
              aria-hidden
            />
            {sseStatus === 'open' ? 'Live' : sseStatus === 'connecting' ? 'Sync' : 'Offline'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {payoutAt && (
            <div className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cream-50/75 backdrop-blur ring-1 ring-cream-50/15 sm:text-sm">
              <span aria-hidden>⏱</span> Payday in {timeUntil(payoutAt)}
            </div>
          )}
          {userPaused && (
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-yellow/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-yellow ring-1 ring-accent-yellow/40 sm:text-sm">
              <span aria-hidden>❚❚</span> Paused
            </div>
          )}
          {resumeIn !== null && resumeIn > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cream-50/75 backdrop-blur ring-1 ring-cream-50/15 sm:text-sm">
              Auto-resume in {resumeIn}s
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-3">
        <div className="flex items-start gap-3">
          <div className="text-right leading-tight">
            <div className="font-display text-2xl font-extrabold tabular-nums tracking-tight text-cream-50 sm:text-3xl lg:text-4xl">
              {clock}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-cream-50/55 sm:text-xs">
              {date}
            </div>
          </div>
          <button
            type="button"
            onClick={onPause}
            aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
            className="relative z-30 grid h-11 w-11 place-items-center rounded-full bg-cream-50/10 text-cream-50 ring-1 ring-cream-50/20 backdrop-blur transition hover:bg-cream-50/20"
          >
            <span aria-hidden className="text-base">
              {paused ? '▶' : '❚❚'}
            </span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="relative z-30 inline-flex h-11 items-center gap-2 rounded-full bg-cream-50/10 px-4 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 backdrop-blur transition hover:bg-cream-50/20 sm:text-sm"
          >
            Exit TV
          </button>
        </div>
        {principal && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Sign ${principal.name} out of this device? Anyone in the family can sign back in.`,
                )
              ) {
                logout.mutate();
              }
            }}
            title="Sign this user out"
            className="relative z-30 inline-flex items-center gap-2 rounded-full bg-cream-50/8 py-1 pl-1 pr-3 text-xs font-bold uppercase tracking-wider text-cream-50/70 ring-1 ring-cream-50/15 backdrop-blur transition hover:bg-cream-50/15 sm:text-sm"
          >
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-extrabold text-white shadow-paper-sm sm:h-8 sm:w-8 sm:text-xs"
              style={{
                backgroundColor:
                  principal.kind === 'kid' ? principal.color : '#3253D7',
              }}
            >
              {principal.name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline">
              {principal.name} · Sign out
            </span>
            <span className="sm:hidden">Sign out</span>
          </button>
        )}
      </div>
    </header>
  );
}

function SlideDots({
  count,
  activeIdx,
  onPick,
  labels,
}: {
  count: number;
  activeIdx: number;
  onPick: (i: number) => void;
  labels: string[];
}) {
  return (
    <nav className="safe-pb relative z-20 flex items-center justify-center gap-3 px-6 pb-6 sm:pb-8">
      {Array.from({ length: count }).map((_, i) => {
        const active = i === activeIdx;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`Slide ${i + 1}: ${labels[i] ?? ''}`}
            aria-current={active ? 'true' : 'false'}
            className="group relative grid h-11 w-11 place-items-center"
          >
            <span
              className={`block h-2 rounded-full transition-all ${
                active
                  ? 'w-10 bg-cream-50'
                  : 'w-2 bg-cream-50/35 group-hover:bg-cream-50/60'
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Slide stage — handles the cross-fade between slides
// ---------------------------------------------------------------------------

function SlideStage({
  idKey,
  children,
}: {
  idKey: string;
  children: React.ReactNode;
}) {
  const prevKey = useRef(idKey);
  const [renderKey, setRenderKey] = useState(idKey);
  useEffect(() => {
    if (idKey === prevKey.current) return;
    prevKey.current = idKey;
    setRenderKey(idKey);
  }, [idKey]);
  return (
    <div className="relative flex flex-1 items-stretch justify-stretch">
      <div
        key={renderKey}
        className="absolute inset-0 flex animate-floatIn items-stretch justify-stretch"
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

function HeroSlide({
  total,
  payoutAt,
  familyName,
}: {
  total: number;
  payoutAt: string | null;
  familyName?: string;
}) {
  return (
    <section className="relative flex flex-1 items-center justify-center px-8 py-12 text-center sm:px-12">
      <div className="flex flex-col items-center gap-4 sm:gap-6 lg:gap-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.4em] text-cream-50/60 sm:text-sm lg:text-base">
          {familyName ? `${familyName} · This week` : 'This week'}
        </div>
        <AnimatedNumber
          value={total}
          format={money}
          duration={900}
          className="block font-display text-fluid-ambient font-extrabold tabular-nums tracking-tight text-cream-50"
        />
        {payoutAt && (
          <div className="mt-2 inline-flex items-center gap-3 rounded-full bg-cream-50/12 px-6 py-2.5 text-base font-semibold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/25 backdrop-blur sm:px-8 sm:py-3 sm:text-lg lg:text-xl">
            <span aria-hidden>💰</span>
            Payday in {timeUntil(payoutAt)}
          </div>
        )}
      </div>
    </section>
  );
}

function AvailableSlide({
  instances,
  onClaim,
}: {
  instances: BoardInstance[];
  onClaim: (i: BoardInstance) => void;
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'available')
        .sort((a, b) => {
          // Overdue first so a kid walking up to the wall sees them at the top.
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
          return (a.dueAt ?? a.availableAt).localeCompare(b.dueAt ?? b.availableAt);
        })
        .slice(0, 8),
    [instances],
  );
  const overdueCount = items.filter((i) => i.overdue).length;
  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-10 lg:px-20 lg:py-16">
      <SlideHeader
        eyebrow="UP FOR GRABS"
        title="Pick a chore"
        right={
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full bg-accent-red/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-accent-red/50 sm:text-sm">
                {overdueCount} overdue
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 sm:text-sm">
              <span aria-hidden>👆</span> Tap to claim
            </span>
          </div>
        }
      />
      <div className="grid flex-1 auto-rows-min gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4">
        {items.map((i) => (
          <ClaimTile key={i.id} instance={i} onTap={() => onClaim(i)} />
        ))}
        {items.length === 0 && (
          <div className="col-span-full grid place-items-center rounded-3xl bg-cream-50/5 px-6 py-16 text-center text-cream-50/65 ring-1 ring-cream-50/10">
            <div>
              <div className="text-5xl">🎉</div>
              <div className="mt-4 font-display text-2xl font-extrabold sm:text-3xl">
                All clear
              </div>
              <div className="mt-1 text-sm sm:text-base">
                Every chore is claimed. The board will refill soon.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ClaimTile({
  instance,
  onTap,
}: {
  instance: BoardInstance;
  onTap: () => void;
}) {
  const dueLabel = instance.dueAt
    ? new Date(instance.dueAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: new Date(instance.dueAt).getMinutes() ? '2-digit' : undefined,
      })
    : null;
  return (
    <button
      type="button"
      onClick={onTap}
      className={`group flex flex-col items-start gap-4 rounded-3xl bg-cream-50/8 p-5 text-left ring-1 ring-cream-50/15 backdrop-blur transition active:translate-y-px hover:-translate-y-1 hover:bg-cream-50/15 hover:ring-cream-50/30 lg:p-6 2xl:p-7 ${
        instance.overdue ? 'animate-pulseRed ring-accent-red/50' : ''
      }`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <ChoreIcon name={instance.choreName} size="lg" />
        <AnimatedNumber
          value={instance.amountCents}
          format={money}
          className="font-display text-xl font-extrabold tabular-nums text-money sm:text-2xl lg:text-3xl"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-display text-xl font-extrabold leading-tight text-cream-50 sm:text-2xl lg:text-3xl">
          {instance.choreName}
        </h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-cream-50/55 sm:text-sm">
          {instance.overdue ? (
            <span className="rounded-full bg-accent-red px-2.5 py-0.5 text-white">
              Overdue
            </span>
          ) : dueLabel ? (
            <span>due {dueLabel}</span>
          ) : (
            <span>any time</span>
          )}
          {instance.photoRequired && (
            <span className="rounded-full bg-accent-blue/30 px-2.5 py-0.5 text-cream-50 ring-1 ring-accent-blue/50">
              📸 photo
            </span>
          )}
        </div>
      </div>
      <span className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cream-50 px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wider text-ink-900 transition group-hover:bg-money group-hover:text-white sm:text-base lg:text-lg">
        I’ll do this →
      </span>
    </button>
  );
}

function DoingSlide({
  instances,
  kids,
  parents,
  onDone,
}: {
  instances: BoardInstance[];
  kids: BoardResponse['kids'];
  parents: BoardResponse['parents'];
  onDone: (i: BoardInstance) => void;
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'claimed')
        .sort((a, b) => (a.claimedAt ?? '').localeCompare(b.claimedAt ?? '')),
    [instances],
  );
  const lookup = new Map<string, { name: string; color?: string }>();
  for (const k of kids) lookup.set(`kid:${k.id}`, { name: k.name, color: k.color });
  for (const p of parents) lookup.set(`user:${p.id}`, { name: p.name });

  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-10 lg:px-20 lg:py-16">
      <SlideHeader
        eyebrow="DOING NOW"
        title="Tap when you’re done"
        right={
          <span className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 sm:text-sm">
            {items.length} in flight
          </span>
        }
      />
      <div className="grid flex-1 auto-rows-min gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4">
        {items.map((i) => {
          const claimer =
            i.claimedByType && i.claimedById
              ? lookup.get(`${i.claimedByType}:${i.claimedById}`)
              : undefined;
          return (
            <DoingTile
              key={i.id}
              instance={i}
              claimerName={claimer?.name}
              claimerColor={claimer?.color}
              onDone={() => onDone(i)}
            />
          );
        })}
      </div>
    </section>
  );
}

function DoingTile({
  instance,
  claimerName,
  claimerColor,
  onDone,
}: {
  instance: BoardInstance;
  claimerName?: string;
  claimerColor?: string;
  onDone: () => void;
}) {
  const accent = claimerColor ?? '#3CA163';
  // Photo-required chores can't be submitted from TV mode in v1 — the wall
  // iPad doesn't expose camera capture yet. Show a phone-only nudge instead
  // of letting the kid dead-end on a rejected submit.
  const needsPhoto = instance.photoRequired && !instance.photoKey;
  return (
    <article
      className="flex flex-col gap-4 rounded-3xl bg-cream-50/8 p-5 ring-1 ring-cream-50/15 backdrop-blur lg:p-6 2xl:p-7"
      style={{ borderLeft: `8px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <ChoreIcon name={instance.choreName} size="lg" />
        <AnimatedNumber
          value={instance.amountCents}
          format={money}
          className="font-display text-xl font-extrabold tabular-nums text-money sm:text-2xl lg:text-3xl"
        />
      </div>
      <h3 className="line-clamp-2 font-display text-xl font-extrabold leading-tight text-cream-50 sm:text-2xl lg:text-3xl">
        {instance.choreName}
      </h3>
      {claimerName && (
        <div className="flex items-center gap-3">
          <MemberAvatar name={claimerName} color={accent} size="md" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cream-50/55">
              On it
            </div>
            <div className="font-display text-lg font-extrabold text-cream-50 sm:text-xl">
              {claimerName}
            </div>
          </div>
        </div>
      )}
      {needsPhoto ? (
        <div className="mt-auto flex flex-col items-center gap-2 rounded-2xl bg-accent-blue/15 px-4 py-3 text-center ring-1 ring-accent-blue/40">
          <div className="text-sm font-bold uppercase tracking-wider text-cream-50 sm:text-base">
            📸 Photo needed
          </div>
          <div className="text-xs text-cream-50/70 sm:text-sm">
            Submit from your phone to attach a photo.
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onDone}
          className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wider text-white transition active:translate-y-px sm:text-base lg:text-lg"
          style={{ backgroundColor: '#0F6E37' }}
        >
          ✓ I’m done
        </button>
      )}
    </article>
  );
}

function ApprovalsSlide({
  instances,
  kids,
  parents,
  isParent,
  onApprove,
  onReject,
}: {
  instances: BoardInstance[];
  kids: BoardResponse['kids'];
  parents: BoardResponse['parents'];
  isParent: boolean;
  onApprove: (i: BoardInstance, anchor: HTMLElement | null) => void;
  onReject: (i: BoardInstance) => void;
}) {
  const items = useMemo(
    () =>
      instances
        .filter((i) => i.status === 'pending')
        .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')),
    [instances],
  );
  const lookup = new Map<string, { name: string; color?: string }>();
  for (const k of kids) lookup.set(`kid:${k.id}`, { name: k.name, color: k.color });
  for (const p of parents) lookup.set(`user:${p.id}`, { name: p.name });

  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-10 lg:px-20 lg:py-16">
      <SlideHeader
        eyebrow="PENDING APPROVAL"
        title="Approval queue"
        right={
          isParent ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-money/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-money/40 sm:text-sm">
              {items.length} waiting · tap to approve
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50/65 ring-1 ring-cream-50/15 sm:text-sm">
              {items.length} waiting · parent only
            </span>
          )
        }
      />
      <div className="grid flex-1 auto-rows-min gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4">
        {items.map((i) => {
          const claimer =
            i.claimedByType && i.claimedById
              ? lookup.get(`${i.claimedByType}:${i.claimedById}`)
              : undefined;
          return (
            <ApprovalTile
              key={i.id}
              instance={i}
              claimerName={claimer?.name}
              claimerColor={claimer?.color}
              isParent={isParent}
              onApprove={(anchor) => onApprove(i, anchor)}
              onReject={() => onReject(i)}
            />
          );
        })}
      </div>
      {!isParent && items.length > 0 && (
        <p className="text-center text-xs text-cream-50/55 sm:text-sm">
          Open ChoreBoard on a parent device to approve or reject.
        </p>
      )}
    </section>
  );
}

function ApprovalTile({
  instance,
  claimerName,
  claimerColor,
  isParent,
  onApprove,
  onReject,
}: {
  instance: BoardInstance;
  claimerName?: string;
  claimerColor?: string;
  isParent: boolean;
  onApprove: (anchor: HTMLElement | null) => void;
  onReject: () => void;
}) {
  const accent = claimerColor ?? '#E07E2E';
  return (
    <article
      className="flex flex-col gap-4 rounded-3xl bg-cream-50/8 p-5 ring-1 ring-cream-50/15 backdrop-blur lg:p-6 2xl:p-7"
      style={{ borderLeft: `8px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <ChoreIcon name={instance.choreName} size="lg" />
        <AnimatedNumber
          value={instance.amountCents}
          format={money}
          className="font-display text-xl font-extrabold tabular-nums text-money sm:text-2xl lg:text-3xl"
        />
      </div>
      <h3 className="line-clamp-2 font-display text-xl font-extrabold leading-tight text-cream-50 sm:text-2xl lg:text-3xl">
        {instance.choreName}
      </h3>
      <div className="flex items-center gap-3">
        {claimerName && <MemberAvatar name={claimerName} color={accent} size="md" />}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cream-50/55">
            Submitted
          </div>
          <div className="truncate font-display text-base font-extrabold text-cream-50 sm:text-lg">
            {claimerName ?? '—'}
          </div>
          {instance.completedAt && (
            <div className="text-xs text-cream-50/55">
              {relativePast(instance.completedAt)}
            </div>
          )}
        </div>
      </div>
      {instance.photoRequired && (
        <div className="rounded-xl bg-cream-50/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-cream-50/65 ring-1 ring-cream-50/10">
          {instance.photoKey ? '📸 Photo attached' : '📸 Photo required'}
        </div>
      )}
      <div className="mt-auto flex gap-2">
        <button
          type="button"
          onClick={(e) => onApprove(e.currentTarget)}
          disabled={!isParent}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-money px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wider text-white transition active:translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:bg-cream-50/15 disabled:text-cream-50/40 sm:text-base lg:text-lg"
        >
          ✓ Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={!isParent}
          className="flex items-center justify-center gap-2 rounded-2xl bg-cream-50/10 px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 transition active:translate-y-px hover:bg-cream-50/20 disabled:cursor-not-allowed disabled:opacity-40 sm:text-base lg:text-lg"
        >
          ← Send back
        </button>
      </div>
    </article>
  );
}

function LeaderboardSlide({
  entries,
  memberLookup,
}: {
  entries: LeaderboardResponse['entries'];
  memberLookup: ReturnType<typeof rollupByKey>;
}) {
  const max = Math.max(1, ...entries.map((e) => e.amountCents));
  const top = entries.slice(0, 6);
  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-12 lg:px-20 lg:py-16">
      <SlideHeader eyebrow="THIS WEEK" title="Leaderboard" />
      <ol className="flex flex-1 flex-col justify-center gap-5 sm:gap-6 lg:gap-8">
        {top.map((e, i) => {
          const rollup = memberLookup.get(e.memberType, e.memberId);
          return (
          <li
            key={`${e.memberType}:${e.memberId}`}
            className="flex items-center gap-4 sm:gap-6 lg:gap-8"
          >
            <span className="w-10 text-right font-display text-3xl font-extrabold tabular-nums text-cream-50/40 sm:text-4xl lg:w-16 lg:text-6xl">
              {i + 1}
            </span>
            <MemberAvatar name={e.name} color={e.color} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="flex flex-wrap items-center gap-3 truncate font-display text-2xl font-extrabold sm:text-3xl lg:text-5xl">
                  <span className="truncate">{e.name}</span>
                  {i === 0 && entries.length > 1 && (
                    <span className="inline-block animate-crownBob text-3xl sm:text-4xl lg:text-5xl">
                      👑
                    </span>
                  )}
                  {rollup && (
                    <StreakChip
                      streak={rollup.stats.streak}
                      bestStreak={rollup.stats.bestStreak}
                      size="md"
                      tone="dark"
                    />
                  )}
                </span>
                <AnimatedNumber
                  value={e.amountCents}
                  format={money}
                  duration={650}
                  className="font-display text-2xl font-extrabold tabular-nums text-money sm:text-3xl lg:text-5xl"
                />
              </div>
              <div className="mt-2.5">
                <div className="h-3 w-full overflow-hidden rounded-full bg-cream-50/10 ring-1 ring-cream-50/20 lg:h-4">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${(e.amountCents / max) * 100}%`,
                      backgroundColor: e.color ?? '#FBF6E6',
                    }}
                  />
                </div>
              </div>
            </div>
          </li>
        );
        })}
      </ol>
    </section>
  );
}

function TodaySlide({ board }: { board: BoardResponse }) {
  const approved = todaysApproved(board.instances, board.now);
  const total = approved.reduce((acc, i) => acc + i.amountCents, 0);
  const lookup = new Map<string, { name: string; color?: string }>();
  for (const k of board.kids) lookup.set(`kid:${k.id}`, { name: k.name, color: k.color });
  for (const p of board.parents) lookup.set(`user:${p.id}`, { name: p.name });

  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-10 lg:px-20 lg:py-16">
      <SlideHeader
        eyebrow="TODAY"
        title="Wins today"
        right={
          <div className="flex flex-col items-end gap-1">
            <AnimatedNumber
              value={total}
              format={money}
              className="font-display text-3xl font-extrabold tabular-nums text-money sm:text-4xl lg:text-6xl"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-cream-50/55 sm:text-sm">
              {approved.length} chore{approved.length === 1 ? '' : 's'} done
            </span>
          </div>
        }
      />
      <div className="grid flex-1 auto-rows-min gap-4 overflow-hidden sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {approved.slice(0, 9).map((i) => {
          const claimer =
            i.claimedByType && i.claimedById
              ? lookup.get(`${i.claimedByType}:${i.claimedById}`)
              : undefined;
          const accent = claimer?.color ?? '#3CA163';
          return (
            <article
              key={i.id}
              className="flex items-center gap-4 rounded-3xl bg-cream-50/8 p-5 ring-1 ring-cream-50/15 backdrop-blur transition lg:p-6"
              style={{
                borderLeft: `8px solid ${accent}`,
              }}
            >
              <div
                aria-hidden
                className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl text-3xl lg:h-16 lg:w-16 lg:text-4xl"
                style={{ backgroundColor: `${accent}30` }}
              >
                ✓
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg font-extrabold text-cream-50 sm:text-xl lg:text-2xl">
                  {i.choreName}
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2 text-sm text-cream-50/70 lg:text-base">
                  <span className="font-display font-extrabold tabular-nums text-money">
                    {money(i.amountCents)}
                  </span>
                  {claimer && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-semibold">{claimer.name}</span>
                    </>
                  )}
                  {i.approvedAt && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{relativePast(i.approvedAt)}</span>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {approved.length === 0 && (
          <div className="col-span-full grid place-items-center rounded-3xl bg-cream-50/5 px-6 py-16 text-center text-cream-50/65 ring-1 ring-cream-50/10">
            <div>
              <div className="text-5xl">🌅</div>
              <div className="mt-4 font-display text-2xl font-extrabold sm:text-3xl">
                A fresh day
              </div>
              <div className="mt-1 text-sm sm:text-base">
                The first approved chore of the day shows up here.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function GoalsSlide({
  goals,
  board,
}: {
  goals: Goal[];
  board: BoardResponse;
}) {
  const lookup = new Map<string, { name: string; color?: string }>();
  for (const k of board.kids) lookup.set(`kid:${k.id}`, { name: k.name, color: k.color });
  for (const p of board.parents) lookup.set(`user:${p.id}`, { name: p.name });

  // Sort: active goals by percent desc, hit goals after.
  const sorted = [...goals].sort((a, b) => {
    if (!!a.hitAt !== !!b.hitAt) return a.hitAt ? 1 : -1;
    return (b.percent ?? 0) - (a.percent ?? 0);
  });
  const top = sorted.slice(0, 4);

  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-12 lg:px-20 lg:py-16">
      <SlideHeader eyebrow="SAVING UP" title="Family goals" />
      <div className="grid flex-1 auto-rows-min gap-5 sm:grid-cols-2 sm:gap-6 lg:gap-8">
        {top.map((g) => {
          const owner = lookup.get(`${g.memberType}:${g.memberId}`);
          const accent = owner?.color ?? '#8B5BD9';
          const hit = !!g.hitAt;
          const pct = Math.min(100, Math.max(0, g.percent ?? 0));
          return (
            <article
              key={g.id}
              className="flex flex-col gap-4 rounded-3xl bg-cream-50/8 p-6 ring-1 ring-cream-50/15 backdrop-blur lg:p-8"
            >
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {owner && (
                    <MemberAvatar
                      name={owner.name}
                      color={owner.color}
                      size="lg"
                    />
                  )}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cream-50/55">
                      {owner?.name ?? 'Family'}
                    </div>
                    <div className="font-display text-2xl font-extrabold leading-tight sm:text-3xl lg:text-4xl">
                      {g.name}
                    </div>
                  </div>
                </div>
                {hit && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-money px-3 py-1 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-money/40 lg:text-sm">
                    ✓ Hit
                  </span>
                )}
              </header>
              <div className="flex items-baseline justify-between gap-3">
                <AnimatedNumber
                  value={g.progressCents}
                  format={money}
                  className="font-display text-3xl font-extrabold tabular-nums text-cream-50 sm:text-4xl lg:text-5xl"
                />
                <span className="font-display text-base font-semibold tabular-nums text-cream-50/55 lg:text-xl">
                  / {money(g.targetCents)}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-cream-50/10 ring-1 ring-cream-50/20 lg:h-4">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: hit ? '#0F6E37' : accent,
                  }}
                />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-cream-50/55 lg:text-sm">
                {hit
                  ? 'Goal hit — ready to buy.'
                  : `${pct.toFixed(0)}% there`}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StreaksSlide({ rollup }: { rollup: MemberRollup[] }) {
  // Top streaks first.
  const streaks = [...rollup]
    .filter((r) => r.stats.streak > 0)
    .sort((a, b) => b.stats.streak - a.stats.streak)
    .slice(0, 4);
  const latestBadge = rollup
    .flatMap((r) =>
      r.badges.map((b) => ({ ...b, owner: r.member })),
    )
    .sort((a, b) => (b.awardedAt ?? '').localeCompare(a.awardedAt ?? ''))[0];

  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-12 lg:px-20 lg:py-16">
      <SlideHeader eyebrow="STREAKS · BADGES" title="On a roll" />
      <div className="grid flex-1 auto-rows-min gap-5 sm:grid-cols-2 sm:gap-6 lg:gap-8">
        {streaks.map((r) => {
          const accent = r.member.color ?? '#E07E2E';
          return (
            <article
              key={`${r.member.type}:${r.member.id}`}
              className="flex items-center gap-5 rounded-3xl bg-cream-50/8 p-6 ring-1 ring-cream-50/15 backdrop-blur lg:p-8"
            >
              <MemberAvatar name={r.member.name} color={accent} size="2xl" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cream-50/55">
                  Daily streak
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-display text-6xl font-extrabold tabular-nums lg:text-7xl"
                    style={{ color: accent }}
                  >
                    {r.stats.streak}
                  </span>
                  <span className="text-2xl lg:text-3xl">🔥</span>
                </div>
                <div className="mt-1 truncate font-display text-xl font-extrabold sm:text-2xl">
                  {r.member.name}
                </div>
                {r.stats.bestStreak > r.stats.streak && (
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-cream-50/55 lg:text-sm">
                    Best ever · {r.stats.bestStreak}
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {latestBadge && (
          <article
            className={`flex items-center gap-5 rounded-3xl bg-cream-50/8 p-6 ring-1 ring-cream-50/15 backdrop-blur lg:p-8 ${
              streaks.length === 0 ? 'col-span-full' : 'sm:col-span-2 lg:col-span-2'
            }`}
          >
            <div
              aria-hidden
              className="grid h-20 w-20 flex-shrink-0 place-items-center rounded-3xl bg-accent-yellow/20 text-4xl ring-2 ring-accent-yellow/30 lg:h-24 lg:w-24 lg:text-5xl"
            >
              {latestBadge.icon ?? '🏅'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-cream-50/55">
                Latest badge
              </div>
              <div className="font-display text-3xl font-extrabold leading-tight text-accent-yellow sm:text-4xl lg:text-5xl">
                {latestBadge.name}
              </div>
              <div className="mt-1 text-sm text-cream-50/70 lg:text-base">
                {latestBadge.owner.name} · {latestBadge.description}
              </div>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function ChampionSlide({
  weeks,
  board,
}: {
  weeks: WeekRow[];
  board: BoardResponse;
}) {
  // Pick the most recent closed week that actually has a champion.
  const lastClosed = useMemo(
    () =>
      weeks
        .filter((w) => w.closedAt && w.championMemberId)
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))[0],
    [weeks],
  );
  const previousChamps = useMemo(() => {
    return weeks
      .filter((w) => w.closedAt && w.championMemberId)
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
      .slice(1, 5);
  }, [weeks]);

  if (!lastClosed) return null;
  const lookup = new Map<string, { name: string; color?: string }>();
  for (const k of board.kids) lookup.set(`kid:${k.id}`, { name: k.name, color: k.color });
  for (const p of board.parents) lookup.set(`user:${p.id}`, { name: p.name });
  const championKey = `${lastClosed.championMemberType}:${lastClosed.championMemberId}`;
  const champion = lookup.get(championKey);
  if (!champion) return null;
  const accent = champion.color ?? '#E8B12A';

  // Tally how many times each member has been champion across closed weeks.
  const tally = new Map<string, number>();
  for (const w of weeks) {
    if (!w.closedAt || !w.championMemberId || !w.championMemberType) continue;
    const k = `${w.championMemberType}:${w.championMemberId}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const championTotalWins = tally.get(championKey) ?? 0;

  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-10 lg:px-20 lg:py-16">
      <SlideHeader
        eyebrow="LAST WEEK"
        title="Champion"
        right={
          <span className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 sm:text-sm">
            {weekRange(lastClosed.startsAt, lastClosed.endsAt)}
          </span>
        }
      />
      <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
        <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <div className="relative inline-block">
            <MemberAvatar name={champion.name} color={accent} size="3xl" />
            <span
              aria-hidden
              className="absolute -top-6 left-1/2 -translate-x-1/2 animate-crownBob text-5xl lg:-top-8 lg:text-6xl"
            >
              👑
            </span>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-cream-50/55 sm:text-xs lg:text-sm">
              CHAMPION OF THE WEEK
            </div>
            <h3
              className="mt-2 font-display text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-8xl"
              style={{ color: accent }}
            >
              {champion.name}
            </h3>
            <AnimatedNumber
              value={lastClosed.championAmountCents ?? 0}
              format={money}
              className="mt-3 block font-display text-3xl font-extrabold tabular-nums text-money sm:text-4xl lg:text-6xl"
            />
          </div>
          {championTotalWins > 1 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-cream-50/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cream-50/70 ring-1 ring-cream-50/20 sm:text-sm">
              👑 {championTotalWins} weekly wins
            </div>
          )}
        </div>

        {previousChamps.length > 0 && (
          <div className="rounded-3xl bg-cream-50/8 p-6 ring-1 ring-cream-50/15 backdrop-blur lg:p-8">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-cream-50/55 sm:text-sm">
              Previous champions
            </div>
            <ol className="flex flex-col gap-4">
              {previousChamps.map((w) => {
                const k = `${w.championMemberType}:${w.championMemberId}`;
                const m = lookup.get(k);
                if (!m) return null;
                return (
                  <li key={w.id} className="flex items-center gap-4">
                    <MemberAvatar name={m.name} color={m.color} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-base font-extrabold text-cream-50 sm:text-lg">
                        {m.name}
                      </div>
                      <div className="text-xs text-cream-50/55 sm:text-sm">
                        {weekRange(w.startsAt, w.endsAt)}
                      </div>
                    </div>
                    <span className="font-display text-base font-extrabold tabular-nums text-money sm:text-lg">
                      {money(w.championAmountCents ?? 0)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

function weekRange(starts: string, ends: string): string {
  const a = new Date(starts);
  const b = new Date(ends);
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function FamilyStatsSlide({
  lifetimeCents,
  lifetimeChores,
  weekCount,
  memberCount,
}: {
  lifetimeCents: number;
  lifetimeChores: number;
  weekCount: number;
  memberCount: number;
}) {
  // Average earned per member per week — fun ambient stat.
  const perMemberPerWeek =
    memberCount > 0 && weekCount > 0
      ? Math.round(lifetimeCents / Math.max(1, memberCount) / Math.max(1, weekCount))
      : 0;
  return (
    <section className="relative flex flex-1 flex-col gap-8 px-8 py-12 sm:px-12 lg:gap-12 lg:px-20 lg:py-16">
      <SlideHeader eyebrow="ALL TIME" title="Family stats" />
      <div className="grid flex-1 auto-rows-min gap-4 sm:grid-cols-2 sm:gap-6 lg:gap-8 2xl:grid-cols-4">
        <BigStat label="Lifetime earned" accent="#0F6E37" big value={lifetimeCents} format={money} />
        <BigStat label="Chores done" accent="#3253D7" value={lifetimeChores} />
        <BigStat label="Weeks running" accent="#E07E2E" value={weekCount} />
        <BigStat
          label="Per member · per week"
          accent="#8B5BD9"
          value={perMemberPerWeek}
          format={money}
        />
      </div>
    </section>
  );
}

function BigStat({
  label,
  accent,
  value,
  format,
  big,
}: {
  label: string;
  accent: string;
  value: number;
  format?: (n: number) => string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-cream-50/8 p-6 ring-1 ring-cream-50/15 backdrop-blur lg:p-8 2xl:p-10">
      <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cream-50/55 sm:text-xs lg:text-sm">
        {label}
      </div>
      <AnimatedNumber
        value={value}
        format={format ?? ((n) => Math.round(n).toLocaleString())}
        duration={900}
        className={`block font-display font-extrabold tabular-nums tracking-tight ${
          big ? 'text-fluid-ambient' : 'text-5xl sm:text-6xl lg:text-7xl 2xl:text-8xl'
        }`}
      />
      <div className="h-1.5 rounded-full" style={{ backgroundColor: accent, opacity: 0.6 }} />
    </div>
  );
}

function SlideHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end sm:gap-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.32em] text-cream-50/55 sm:text-sm lg:text-base">
          {eyebrow}
        </div>
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-cream-50 sm:text-5xl lg:text-7xl">
          {title}
        </h2>
      </div>
      {right}
    </header>
  );
}

/* ---------------------------------------------------------------------------
   Re-export ProgressBar reference so unused-import lint stays quiet — we
   reference it in a slide variant that's currently inlined for tighter
   visual control over the dark-themed bars.
--------------------------------------------------------------------------- */
void ProgressBar;
