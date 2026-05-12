import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { money, timeUntil } from '../lib/format';
import { useSession } from '../lib/session';
import type { BoardResponse, Goal, Kid, MemberStats } from '../lib/types';
import { DesktopTitle, MemberAvatar, ProgressBar } from '../ui/primitives';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonDesktop } from '../ui/Skeleton';
import { toastError, toastSuccess } from '../ui/Toast';

type KidBudget = {
  kid: Kid;
  stats: MemberStats['stats'] | null;
  goal: Goal | null;
};

export function BudgetDesktop({
  board,
  payoutAt,
}: {
  board?: BoardResponse;
  payoutAt: string | null;
}) {
  const goalsQ = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get<{ goals: Goal[] }>('/api/goals').then((r) => r.goals),
    refetchInterval: 60_000,
  });
  const statsQ = useKidBudgetStats(board);

  const budgets = useMemo<KidBudget[]>(() => {
    const goals = goalsQ.data ?? [];
    const statsByKid = statsQ.data ?? new Map<string, MemberStats['stats']>();
    return (board?.kids ?? []).map((kid) => {
      const kidGoals = goals
        .filter((g) => g.memberType === 'kid' && g.memberId === kid.id)
        .sort((a, b) => {
          if (a.hitAt && !b.hitAt) return 1;
          if (!a.hitAt && b.hitAt) return -1;
          return b.percent - a.percent;
        });
      return {
        kid,
        stats: statsByKid.get(kid.id) ?? null,
        goal: kidGoals[0] ?? null,
      };
    });
  }, [board?.kids, goalsQ.data, statsQ.data]);

  const avgChoreCents = useMemo(() => {
    const amounts = (board?.instances ?? [])
      .map((i) => i.amountCents)
      .filter((amount) => amount > 0);
    if (amounts.length === 0) return 500;
    return Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length);
  }, [board?.instances]);

  if (!board) {
    return <SkeletonDesktop />;
  }

  const totalToyProgress = budgets.reduce(
    (sum, b) => sum + (b.goal?.progressCents ?? 0),
    0,
  );
  const totalOwed = budgets.reduce((sum, b) => sum + (b.stats?.unpaidCents ?? 0), 0);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7 2xl:p-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 sm:gap-6 2xl:gap-8">
        <DesktopTitle
          date="POCKET MONEY PLANNER"
          title="Budget goals"
          subtitle="Turn this week's chores into toy-money plans kids can actually see."
        />

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr] 2xl:gap-6">
          <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7 2xl:p-10">
            <div className="min-w-0">
              <div className="page-tag mb-1.5">Toy-goal progress</div>
              <AnimatedNumber
                value={totalToyProgress}
                format={money}
                className="block font-display text-fluid-money font-extrabold tabular-nums tracking-tight text-money"
              />
              <p className="mt-3 max-w-xl text-sm text-ink-700 sm:text-base">
                Budgeting here is intentionally simple: pick the toy, see what is
                owed, and decide how much of payday gets protected for the goal.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm sm:flex-col sm:items-end">
              <span className="pill-dark whitespace-nowrap">
                Owed now {money(totalOwed)}
              </span>
              {payoutAt && (
                <span className="pill whitespace-nowrap">
                  Payday in {timeUntil(payoutAt)}
                </span>
              )}
            </div>
          </div>

          <BudgetRuleCard />
        </section>

        {budgets.length === 0 ? (
          <section className="card p-6">
            <EmptyState
              illustration="kids"
              title="No kids yet"
              body="Add a kid in Family settings to start planning pocket money goals."
            />
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {budgets.map((budget) => (
              <KidBudgetCard
                key={budget.kid.id}
                budget={budget}
                avgChoreCents={avgChoreCents}
                loading={statsQ.isLoading || goalsQ.isLoading}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function useKidBudgetStats(board?: BoardResponse) {
  return useQuery({
    queryKey: ['budget-stats', board?.kids.map((k) => k.id).join(',')],
    enabled: !!board,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!board) return new Map<string, MemberStats['stats']>();
      const rows = await Promise.all(
        board.kids.map(async (kid) => {
          const result = await api.get<MemberStats>(`/api/stats/member/kid/${kid.id}`);
          return [kid.id, result.stats] as const;
        }),
      );
      return new Map(rows);
    },
  });
}

function KidBudgetCard({
  budget,
  avgChoreCents,
  loading,
}: {
  budget: KidBudget;
  avgChoreCents: number;
  loading: boolean;
}) {
  const session = useSession();
  const isParent = session.data?.kind === 'parent';
  const isOwnKid = session.data?.kind === 'kid' && session.data.kidId === budget.kid.id;
  const canCreateGoal = isParent || isOwnKid;
  const [showForm, setShowForm] = useState(false);

  const stats = budget.stats;
  const goal = budget.goal;
  const owedCents = stats?.unpaidCents ?? 0;
  const weekCents = stats?.weekCents ?? 0;
  const plannerPool = Math.max(owedCents, weekCents);
  const saveCents = Math.round(plannerPool * 0.7);
  const spendCents = Math.round(plannerPool * 0.2);
  const laterCents = Math.max(0, plannerPool - saveCents - spendCents);
  const shortfallCents = Math.max(0, (goal?.targetCents ?? 0) - (goal?.progressCents ?? 0));
  const choresNeeded = goal ? Math.max(0, Math.ceil(shortfallCents / avgChoreCents)) : 0;
  const weeksNeeded =
    goal && saveCents > 0 ? Math.max(1, Math.ceil(shortfallCents / saveCents)) : null;

  return (
    <article className="card flex flex-col gap-4 p-5 sm:p-6 2xl:p-7">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MemberAvatar name={budget.kid.name} color={budget.kid.color} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-extrabold sm:text-3xl">
              {budget.kid.name}
            </h2>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              {loading ? 'checking pocket money...' : `${money(owedCents)} owed now`}
            </p>
          </div>
        </div>
        <span className="pill whitespace-nowrap">70 / 20 / 10</span>
      </header>

      {goal ? (
        <div className="rounded-2xl bg-cream-50 p-4 ring-2 ring-ink-900">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div>
              <div className="page-tag">Toy goal</div>
              <h3 className="font-display text-xl font-extrabold">{goal.name}</h3>
            </div>
            <div className="text-right text-sm">
              <span className="money-amt">{money(goal.progressCents)}</span>
              <span className="text-ink-500"> / {money(goal.targetCents)}</span>
            </div>
          </div>
          <ProgressBar percent={goal.percent} color={budget.kid.color} height="lg" />
          <p className="mt-2 text-xs text-ink-500">
            {shortfallCents === 0
              ? 'Ready to buy when the grown-up says yes.'
              : `${money(shortfallCents)} left, about ${choresNeeded} chore${choresNeeded === 1 ? '' : 's'} at the current average.`}
          </p>
        </div>
      ) : showForm ? (
        <BudgetGoalForm kid={budget.kid} onDone={() => setShowForm(false)} />
      ) : (
        <button
          className="rounded-2xl bg-cream-50 p-4 text-left ring-2 ring-dashed ring-ink-400 transition hover:bg-cream-200"
          onClick={() => setShowForm(true)}
          disabled={!canCreateGoal}
        >
          <div className="page-tag">No toy goal yet</div>
          <div className="mt-1 font-display text-xl font-extrabold">
            {canCreateGoal ? '+ Pick something to save for' : 'Waiting for their goal'}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Goals can be a LEGO set, headphones, a game, or whatever is currently
            impossible to stop talking about.
          </p>
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        <SplitTile label="Toy fund" value={money(saveCents)} accent={budget.kid.color} />
        <SplitTile label="Spend now" value={money(spendCents)} />
        <SplitTile label="Later" value={money(laterCents)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span>This week: {money(weekCents)}</span>
        {weeksNeeded && <span>At 70%, roughly {weeksNeeded} payday{weeksNeeded === 1 ? '' : 's'}.</span>}
        {goal && canCreateGoal && (
          <button className="underline-offset-2 hover:underline" onClick={() => setShowForm(true)}>
            add another goal
          </button>
        )}
      </div>

      {goal && showForm && <BudgetGoalForm kid={budget.kid} onDone={() => setShowForm(false)} />}
    </article>
  );
}

function BudgetGoalForm({ kid, onDone }: { kid: Kid; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('30.00');
  const targetCents = Math.round(parseFloat(target) * 100);
  const valid = name.trim().length > 0 && Number.isFinite(targetCents) && targetCents > 0;

  const mut = useMutation({
    mutationFn: () =>
      api.post('/api/goals', {
        memberType: 'kid',
        memberId: kid.id,
        name: name.trim(),
        targetCents,
        basis: 'weekly_plus_unpaid',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toastSuccess('Goal added', name.trim());
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t save goal', err.message);
    },
  });

  return (
    <form
      className="rounded-2xl bg-cream-50 p-4 ring-2 ring-ink-900"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mut.mutate();
      }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-lg font-extrabold">New toy goal</h3>
        <button type="button" className="pill" onClick={onDone}>
          cancel
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <input
          className="input"
          placeholder='e.g. "Pokemon cards"'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Target dollars"
        />
      </div>
      {mut.error instanceof ApiError && (
        <p className="mt-2 text-sm text-accent-red">{mut.error.message}</p>
      )}
      <button className="btn-primary mt-3 w-full" disabled={!valid || mut.isPending}>
        {mut.isPending ? 'Saving...' : 'Save goal'}
      </button>
    </form>
  );
}

function BudgetRuleCard() {
  return (
    <div className="card-dark flex flex-col justify-between gap-4 p-6">
      <div>
        <div className="page-tag text-cream-200">Suggested split</div>
        <h2 className="mt-1 font-display text-3xl font-extrabold">70 / 20 / 10</h2>
        <p className="mt-2 text-sm text-cream-100/80">
          70% toward the toy goal, 20% for tiny impulse buys, and 10% kept for
          later. It is a guide, not a bank contract.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        <span className="rounded-xl bg-cream-50/10 px-2 py-2">Save</span>
        <span className="rounded-xl bg-cream-50/10 px-2 py-2">Spend</span>
        <span className="rounded-xl bg-cream-50/10 px-2 py-2">Later</span>
      </div>
    </div>
  );
}

function SplitTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-cream-100 p-3 ring-2 ring-ink-900/15">
      <div className="page-tag">{label}</div>
      <div className="mt-1 font-display text-xl font-extrabold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
