import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type {
  BoardResponse,
  Goal,
  MemberStats,
  Milestone,
  MilestoneMetric,
} from '../lib/types';
import { money, relativePast } from '../lib/format';
import { useSession } from '../lib/session';
import {
  DesktopTitle,
  MemberAvatar,
  PageTag,
  ProgressBar,
} from '../ui/primitives';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonDesktop } from '../ui/Skeleton';
import { StreakChip } from '../ui/StreakChip';
import { toastError, toastMoney, toastSuccess } from '../ui/Toast';
import { celebrate } from '../lib/celebrate';

function hexAlpha(hex: string | undefined, alpha: number): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(91,96,114,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type Member = { type: 'user' | 'kid'; id: string; name: string; color?: string };

export function MemberDashboard({
  member,
  board,
}: {
  member: Member;
  board?: BoardResponse;
}) {
  const session = useSession();
  const qc = useQueryClient();

  const statsQ = useQuery({
    queryKey: ['member', member.type, member.id],
    queryFn: () => api.get<MemberStats>(`/api/stats/member/${member.type}/${member.id}`),
    refetchInterval: 60_000,
  });

  const goalsQ = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get<{ goals: Goal[] }>('/api/goals').then((r) => r.goals),
    refetchInterval: 60_000,
  });

  const milestonesQ = useQuery({
    queryKey: ['milestones'],
    queryFn: () =>
      api.get<{ milestones: Milestone[] }>('/api/milestones').then((r) => r.milestones),
    refetchInterval: 60_000,
  });

  const claim = useMutation({
    mutationFn: ({ hitId, claimed }: { hitId: string; claimed: boolean }) =>
      api.post(`/api/milestones/hits/${hitId}/${claimed ? 'unclaim' : 'claim'}`),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['milestones'] });
      toastSuccess(vars.claimed ? 'Marked outstanding' : 'Reward delivered ✨');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t update', err.message);
    },
  });

  const action = useMutation({
    mutationFn: async (input: { instanceId: string; action: 'approve' | 'reject' }) =>
      api.post(`/api/board/instances/${input.instanceId}/${input.action}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['member', member.type, member.id] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      const inst = board?.instances.find((i) => i.id === vars.instanceId);
      if (vars.action === 'approve' && inst) {
        toastMoney(`Approved · ${money(inst.amountCents)}`, inst.choreName);
      } else if (vars.action === 'reject') {
        toastSuccess('Sent back');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t do that', err.message);
    },
  });

  const isParent = session.data?.kind === 'parent';
  const isMe =
    session.data?.kind === 'parent'
      ? member.type === 'user' && member.id === session.data.userId
      : member.type === 'kid' && member.id === session.data?.kidId;
  const canEditGoals = isParent || isMe;

  const pendingApproval = (board?.instances ?? []).filter((i) => i.status === 'pending');

  const myGoals = useMemo(
    () =>
      (goalsQ.data ?? []).filter(
        (g) => g.memberType === member.type && g.memberId === member.id,
      ),
    [goalsQ.data, member.id, member.type],
  );

  const myMilestones = useMemo(
    () =>
      (milestonesQ.data ?? []).filter(
        (m) =>
          m.scope === 'member' &&
          m.memberType === member.type &&
          m.memberId === member.id &&
          (m.active || m.unclaimedHitCount > 0),
      ),
    [milestonesQ.data, member.id, member.type],
  );

  const stats = statsQ.data?.stats;
  const recent = statsQ.data?.recent ?? [];
  const badges = statsQ.data?.badges ?? [];
  const accent = member.color ?? '#5B6072';

  if (statsQ.isLoading) {
    return <SkeletonDesktop />;
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7 2xl:p-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 sm:gap-6 2xl:gap-8">
        <DesktopTitle
          title={member.name}
          subtitle={
            stats
              ? `Level ${stats.level} · ${stats.xp.toLocaleString()} XP · 🔥 ${stats.streak}-day streak`
              : undefined
          }
          right={<PageTag index={3} label="MEMBER" title={`Member dashboard · ${member.name}`} />}
        />

        {/* Top hero — "trophy room" style. Cover gradient in the member's
            colour, avatar floats on top, and a row of inline stat chips
            (streak / level / lifetime) sits alongside the weekly headline. */}
        <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr] 2xl:gap-6">
          <div
            className="card relative overflow-hidden p-5 sm:p-7 2xl:p-10"
            style={{
              backgroundImage: `linear-gradient(135deg, ${hexAlpha(accent, 0.22)} 0%, transparent 60%)`,
            }}
          >
            {/* Decorative blob */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-20 blur-3xl"
              style={{ backgroundColor: accent }}
            />
            <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
              <MemberAvatar name={member.name} color={accent} size="2xl" />
              <div className="min-w-0 flex-1">
                <div className="page-tag mb-1">THIS WEEK</div>
                <AnimatedNumber
                  value={stats?.weekCents ?? 0}
                  format={money}
                  className="block font-display text-fluid-money font-extrabold tabular-nums tracking-tight text-money"
                />
                {stats && (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <StreakChip
                      streak={stats.streak}
                      bestStreak={stats.bestStreak}
                      size="md"
                    />
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ring-1 sm:text-sm"
                      style={{
                        backgroundColor: hexAlpha(accent, 0.12),
                        color: accent,
                        borderColor: hexAlpha(accent, 0.3),
                      }}
                    >
                      ⚡ Level {stats.level}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-900/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-700 ring-1 ring-ink-900/15 sm:text-sm">
                      🏅 {stats.badgeCount} badges
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card p-5 sm:p-6 2xl:p-7">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold sm:text-xl 2xl:text-2xl">
                Badge case
              </h2>
              <span className="text-xs text-ink-500">{badges.length} earned</span>
            </header>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-5 lg:grid-cols-5 2xl:grid-cols-10">
              {badges.slice(0, 10).map((b) => (
                <div
                  key={b.code}
                  title={`${b.name} · ${b.description}`}
                  className="aspect-square grid place-items-center rounded-full bg-accent-yellow/20 text-xl ring-2 ring-ink-900 transition hover:scale-105"
                >
                  {b.icon ?? '🏅'}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 10 - badges.length) }).map((_, i) => (
                <div
                  key={`l-${i}`}
                  className="aspect-square grid place-items-center rounded-full bg-cream-200/60 text-[10px] uppercase tracking-wider text-ink-400 ring-2 ring-dashed ring-ink-400"
                >
                  lock
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Goal cards (weekly tally + named goals) */}
        <section className="grid gap-4 lg:grid-cols-2">
          <WeeklyTallyCard
            weekCents={stats?.weekCents ?? 0}
            unpaidCents={stats?.unpaidCents ?? 0}
            firstGoal={myGoals[0] ?? null}
            accent={accent}
          />
          {myGoals.slice(0, 1).map((g) => (
            <GoalCard key={g.id} goal={g} accent={accent} />
          ))}
          {myGoals.length === 0 && canEditGoals && (
            <GoalCreatePrompt member={member} accent={accent} />
          )}
        </section>

        {/* More goals (if any beyond the first) + add-goal */}
        {myGoals.length > 1 && (
          <section className="grid gap-4 lg:grid-cols-2">
            {myGoals.slice(1).map((g) => (
              <GoalCard key={g.id} goal={g} accent={accent} editable={canEditGoals} />
            ))}
            {canEditGoals && <GoalCreatePrompt member={member} accent={accent} compact />}
          </section>
        )}
        {myGoals.length === 1 && canEditGoals && (
          <GoalCreatePrompt member={member} accent={accent} compact />
        )}

        {myMilestones.length > 0 && (
          <MemberMilestonesSection
            milestones={myMilestones}
            accent={accent}
            isParent={isParent}
            isClaiming={claim.isPending}
            onClaim={(hitId, claimed) => claim.mutate({ hitId, claimed })}
          />
        )}

        {/* Four small stat tiles */}
        {stats && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SmallTile label="Lifetime earned" big={money(stats.lifetimeCents)} sub={`${stats.lifetimeChores} chores`} />
            <SmallTile label="Longest streak" big={`${stats.bestStreak}d`} sub={stats.streak === stats.bestStreak ? 'still going' : `currently ${stats.streak}d`} />
            <SmallTile label="Level" big={`${stats.level}`} sub={`${stats.xp.toLocaleString()} XP`} />
            <SmallTile label="Badges" big={`${stats.badgeCount}`} sub="case" />
          </section>
        )}

        {isParent && pendingApproval.length > 0 && (
          <section className="card p-5 sm:p-6 2xl:p-7">
            <h3 className="mb-3 font-display text-lg font-extrabold sm:text-xl">
              Approval queue
            </h3>
            <ul className="flex flex-col gap-2">
              {pendingApproval.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-col items-stretch justify-between gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{i.choreName}</div>
                    <div className="text-xs text-ink-500">
                      Done {i.completedAt ? relativePast(i.completedAt) : ''} ·{' '}
                      {money(i.amountCents)}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      className="btn-money flex-1 sm:flex-initial"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        celebrate(
                          { x: r.left + r.width / 2, y: r.top + r.height / 2 },
                          { pieces: 24, spread: 140, durationMs: 1600 },
                        );
                        action.mutate({ instanceId: i.id, action: 'approve' });
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-secondary flex-1 sm:flex-initial"
                      onClick={() => action.mutate({ instanceId: i.id, action: 'reject' })}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-5 sm:p-6 2xl:p-7">
          <h3 className="mb-3 font-display text-lg font-extrabold sm:text-xl">
            Recent activity
          </h3>
          {recent.length === 0 ? (
            <EmptyState
              illustration="activity"
              compact
              title="No earnings yet"
              body="Approved chores show up here as soon as a parent ticks them off."
            />
          ) : (
            <ul className="flex flex-col divide-y-2 divide-cream-200">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.choreName}</div>
                    <div className="text-xs text-ink-500">{relativePast(r.earnedAt)}</div>
                  </div>
                  <span className="money-amt flex-shrink-0 text-sm sm:text-base">
                    {money(r.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function WeeklyTallyCard({
  weekCents,
  unpaidCents,
  firstGoal,
  accent,
}: {
  weekCents: number;
  unpaidCents: number;
  firstGoal: Goal | null;
  accent: string;
}) {
  // If they have a goal, show progress to it. Otherwise show unpaid total
  // as a friendly side note ("$25 owed").
  const target = firstGoal?.targetCents ?? Math.max(2500, Math.round(weekCents * 1.4));
  const percent = Math.min(100, (weekCents / target) * 100);
  return (
    <div className="card p-5">
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="page-tag">
          WEEKLY TALLY{firstGoal ? ` · GOAL ${money(firstGoal.targetCents)}` : ''}
        </h3>
        <div className="text-sm">
          <span className="money-amt">{money(weekCents)}</span>
          {firstGoal && (
            <span className="ml-1 text-ink-500"> / {money(firstGoal.targetCents)}</span>
          )}
        </div>
      </header>
      <ProgressBar percent={percent} color={accent} height="lg" />
      <p className="mt-2 text-xs text-ink-500">
        {firstGoal
          ? firstGoal.hitAt
            ? 'Goal hit! 🎉'
            : '2 days until payout'
          : `${money(unpaidCents)} owed (unpaid)`}
      </p>
    </div>
  );
}

function GoalCard({
  goal,
  accent,
  editable = true,
}: {
  goal: Goal;
  accent: string;
  editable?: boolean;
}) {
  const qc = useQueryClient();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prevHitAt = useRef<string | null>(goal.hitAt ?? null);
  const del = useMutation({
    mutationFn: () => api.delete(`/api/goals/${goal.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
  // Fire confetti the moment a goal flips from in-progress to complete.
  useEffect(() => {
    if (!prevHitAt.current && goal.hitAt) {
      celebrate(cardRef.current, { pieces: 80, spread: 280 });
      toastMoney('Goal hit!', goal.name);
    }
    prevHitAt.current = goal.hitAt ?? null;
  }, [goal.hitAt, goal.name]);
  // In-progress goals use the member's accent (or money green by default).
  // Hit goals turn solid money-green. Never red — red reads as "loss".
  const barColor = goal.hitAt ? '#0F6E37' : accent;
  return (
    <div ref={cardRef} className="card p-5 sm:p-6 2xl:p-7">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="page-tag truncate uppercase">GOAL · {goal.name}</h3>
        <div className="text-sm tabular-nums">
          <span className="money-amt">{money(goal.progressCents)}</span>
          <span className="ml-1 text-ink-500"> / {money(goal.targetCents)}</span>
        </div>
      </header>
      <ProgressBar percent={goal.percent} color={barColor} height="lg" />
      <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
        <span>
          {goal.hitAt
            ? 'Goal hit! 🎉'
            : goal.deadline
              ? `deadline · ${new Date(goal.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : goal.basis === 'lifetime'
                ? 'lifetime basis'
                : 'weekly + unpaid basis'}
        </span>
        {editable && (
          <button
            onClick={() => {
              if (confirm(`Delete goal "${goal.name}"?`)) del.mutate();
            }}
            className="text-ink-400 underline-offset-2 hover:text-accent-red hover:underline"
          >
            remove
          </button>
        )}
      </div>
    </div>
  );
}

function GoalCreatePrompt({
  member,
  accent,
  compact = false,
}: {
  member: Member;
  accent: string;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`card flex w-full items-center justify-center gap-2 text-sm font-semibold text-ink-700 transition hover:bg-cream-200 ${
          compact ? 'p-3' : 'p-5'
        }`}
        style={{ borderColor: accent }}
      >
        + Add a goal
      </button>
    );
  }
  return <NewGoalForm member={member} onDone={() => setEditing(false)} />;
}

function NewGoalForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('25.00');
  const [basis, setBasis] = useState<'weekly_plus_unpaid' | 'lifetime'>('weekly_plus_unpaid');
  const [deadline, setDeadline] = useState('');

  const targetCents = Math.round(parseFloat(target) * 100);
  const valid = name.trim().length > 0 && Number.isFinite(targetCents) && targetCents > 0;

  const mut = useMutation({
    mutationFn: () =>
      api.post('/api/goals', {
        memberType: member.type,
        memberId: member.id,
        name: name.trim(),
        targetCents,
        basis,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toastSuccess('Goal added', name.trim());
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t save', err.message);
    },
  });

  return (
    <form
      className="card flex flex-col gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mut.mutate();
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-extrabold">New goal</h3>
        <button type="button" className="pill" onClick={onDone}>
          cancel
        </button>
      </div>
      <input
        className="input"
        placeholder='e.g. "Nintendo Switch"'
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Target ($)</span>
          <input
            className="input"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Deadline</span>
          <input
            type="date"
            className="input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Counts toward goal</span>
        <select
          className="input"
          value={basis}
          onChange={(e) => setBasis(e.target.value as 'weekly_plus_unpaid' | 'lifetime')}
        >
          <option value="weekly_plus_unpaid">This week + everything still owed</option>
          <option value="lifetime">Lifetime earnings</option>
        </select>
      </label>
      {mut.error instanceof ApiError && (
        <p className="text-sm text-accent-red">{mut.error.message}</p>
      )}
      <button className="btn-primary" disabled={!valid || mut.isPending}>
        {mut.isPending ? '...' : 'Save goal'}
      </button>
    </form>
  );
}

function MemberMilestonesSection({
  milestones,
  accent,
  isParent,
  isClaiming,
  onClaim,
}: {
  milestones: Milestone[];
  accent: string;
  isParent: boolean;
  isClaiming: boolean;
  onClaim: (hitId: string, claimed: boolean) => void;
}) {
  return (
    <section className="card p-5 sm:p-6 2xl:p-7">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-lg font-extrabold sm:text-xl">
          Personal milestones
        </h3>
        {isParent && (
          <Link
            to="/admin/milestones"
            className="text-xs font-semibold text-ink-500 hover:text-ink-900 hover:underline"
          >
            Manage →
          </Link>
        )}
      </header>
      <ul className="grid gap-3 lg:grid-cols-2">
        {milestones.map((m) => (
          <li
            key={m.id}
            className="rounded-xl bg-cream-50 p-4 ring-2 ring-ink-900"
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl text-2xl ring-2 ring-ink-900"
                style={{ backgroundColor: hexAlpha(m.hitThisPeriod ? '#0F6E37' : accent, 0.18) }}
                aria-hidden
              >
                {m.icon ?? '🎁'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="truncate font-display text-base font-extrabold">
                    {m.name}
                  </h4>
                  <span className="text-xs tabular-nums text-ink-500">
                    {formatMemberMetric(m.metric, m.progress)} /{' '}
                    <span className="text-ink-700">
                      {formatMemberMetric(m.metric, m.targetValue)}
                    </span>
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  🎉 {m.reward}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <ProgressBar
                percent={m.percent}
                color={m.hitThisPeriod ? '#0F6E37' : accent}
                height="md"
              />
            </div>
            {m.hitThisPeriod && m.currentHit && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg bg-money/15 p-2.5 ring-2 ring-money/40 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-bold text-money">
                  🏆 Reward unlocked
                </div>
                {isParent ? (
                  <button
                    className={
                      m.currentHit.claimedAt ? 'btn-secondary' : 'btn-money'
                    }
                    disabled={isClaiming}
                    onClick={() =>
                      onClaim(m.currentHit!.id, !!m.currentHit!.claimedAt)
                    }
                  >
                    {m.currentHit.claimedAt ? '✓ Delivered' : 'Mark delivered'}
                  </button>
                ) : (
                  <span className="pill bg-ink-900 text-cream-50">
                    {m.currentHit.claimedAt ? '✓ delivered' : 'Ask a parent ✨'}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatMemberMetric(metric: MilestoneMetric, value: number): string {
  if (metric === 'cents_earned') return money(value);
  return `${value} ${value === 1 ? 'chore' : 'chores'}`;
}

function SmallTile({ label, big, sub }: { label: string; big: string; sub?: string }) {
  return (
    <div className="card p-4 sm:p-5 2xl:p-6">
      <div className="page-tag truncate">{label}</div>
      <div className="font-display text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl 2xl:text-4xl">
        {big}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink-500 sm:text-sm">{sub}</div>}
    </div>
  );
}
