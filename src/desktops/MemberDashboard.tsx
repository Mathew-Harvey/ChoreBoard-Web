import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { BoardResponse, Goal, MemberStats } from '../lib/types';
import { money, relativePast } from '../lib/format';
import { useSession } from '../lib/session';
import {
  DesktopTitle,
  MemberAvatar,
  PageTag,
  ProgressBar,
} from '../ui/primitives';

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

  const action = useMutation({
    mutationFn: async (input: { instanceId: string; action: 'approve' | 'reject' }) =>
      api.post(`/api/board/instances/${input.instanceId}/${input.action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['member', member.type, member.id] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
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

  const stats = statsQ.data?.stats;
  const recent = statsQ.data?.recent ?? [];
  const badges = statsQ.data?.badges ?? [];
  const accent = member.color ?? '#5B6072';

  if (statsQ.isLoading) {
    return <div className="grid h-full place-items-center text-ink-500">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <DesktopTitle
          title={member.name}
          subtitle={
            stats
              ? `Level ${stats.level} · ${stats.xp.toLocaleString()} XP · 🔥 ${stats.streak}-day streak`
              : undefined
          }
          right={
            <div className="hidden sm:block">
              <PageTag index={3} label="MEMBER" title={`Member dashboard · ${member.name}`} />
            </div>
          }
        />

        {/* Top hero: avatar + this week + badge case */}
        <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="card flex items-center gap-5 p-5">
            <MemberAvatar name={member.name} color={accent} size="xl" />
            <div className="flex-1 text-right sm:text-left">
              <div className="page-tag">THIS WEEK</div>
              <div
                className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl"
                style={{ color: '#0F6E37' }}
              >
                {money(stats?.weekCents ?? 0)}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold">Badge case</h2>
              <span className="text-xs text-ink-500">{badges.length} earned</span>
            </header>
            <div className="grid grid-cols-5 gap-2">
              {badges.slice(0, 10).map((b) => (
                <div
                  key={b.code}
                  title={`${b.name} · ${b.description}`}
                  className="grid h-12 w-12 place-items-center rounded-full bg-accent-yellow/20 text-xl ring-2 ring-ink-900"
                >
                  {b.icon ?? '🏅'}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 10 - badges.length) }).map((_, i) => (
                <div
                  key={`l-${i}`}
                  className="grid h-12 w-12 place-items-center rounded-full bg-cream-200/60 text-[10px] uppercase tracking-wider text-ink-400 ring-2 ring-dashed ring-ink-400"
                >
                  locked
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
          <section className="card p-5">
            <h3 className="mb-3 font-display text-lg font-extrabold">Approval queue</h3>
            <ul className="flex flex-col gap-2">
              {pendingApproval.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900"
                >
                  <div>
                    <div className="text-sm font-semibold">{i.choreName}</div>
                    <div className="text-xs text-ink-500">
                      Done {i.completedAt ? relativePast(i.completedAt) : ''} ·{' '}
                      {money(i.amountCents)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-money !py-1.5"
                      onClick={() => action.mutate({ instanceId: i.id, action: 'approve' })}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-secondary !py-1.5"
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

        <section className="card p-5">
          <h3 className="mb-3 font-display text-lg font-extrabold">Recent activity</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-500">No earnings yet.</p>
          ) : (
            <ul className="flex flex-col divide-y-2 divide-cream-200">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-semibold">{r.choreName}</div>
                    <div className="text-xs text-ink-500">{relativePast(r.earnedAt)}</div>
                  </div>
                  <span className="money-amt text-sm">{money(r.amountCents)}</span>
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
  const del = useMutation({
    mutationFn: () => api.delete(`/api/goals/${goal.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
  return (
    <div className="card p-5">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="page-tag truncate uppercase">
          GOAL · {goal.name}
        </h3>
        <div className="text-sm">
          <span className="money-amt text-accent-red">
            {money(goal.progressCents)}
          </span>
          <span className="ml-1 text-ink-500"> / {money(goal.targetCents)}</span>
        </div>
      </header>
      <ProgressBar
        percent={goal.percent}
        color={goal.hitAt ? '#0F6E37' : '#DB4646'}
        height="lg"
      />
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
      {/* Accent indicator so colored progress matches member */}
      <span aria-hidden className="sr-only" style={{ color: accent }} />
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
      onDone();
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

function SmallTile({ label, big, sub }: { label: string; big: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="page-tag">{label}</div>
      <div className="font-display text-2xl font-extrabold tracking-tight">{big}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-500">{sub}</div>}
    </div>
  );
}
