import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Family, Kid, LedgerEntry, MemberType, Parent } from '../../lib/types';
import { money, relativePast } from '../../lib/format';
import { MemberAvatar } from '../../ui/primitives';
import { EmptyState } from '../../ui/EmptyState';
import { toastError, toastMoney } from '../../ui/Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

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

export function AdminLedger() {
  const qc = useQueryClient();
  const fam = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ family: Family; parents: Parent[]; kids: Kid[] }>('/api/family'),
  });
  const entries = useQuery({
    queryKey: ['ledger', { status: 'unpaid' }],
    queryFn: () =>
      api
        .get<{ entries: LedgerEntry[] }>('/api/ledger?status=unpaid&limit=500')
        .then((r) => r.entries),
  });
  const weeks = useQuery({
    queryKey: ['ledger-weeks'],
    queryFn: () => api.get<{ weeks: WeekRow[] }>('/api/ledger/weeks').then((r) => r.weeks),
  });

  const pay = useMutation({
    mutationFn: (body: any) => api.post('/api/ledger/pay', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['ledger-weeks'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      qc.invalidateQueries({ queryKey: ['member'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      toastMoney('Marked paid', 'Ledger updated.');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t mark paid', err.message);
    },
  });

  const totals = useMemo(() => {
    const acc = new Map<
      string,
      {
        memberType: MemberType;
        memberId: string;
        total: number;
        count: number;
        name: string;
        color?: string;
      }
    >();
    for (const e of entries.data ?? []) {
      const key = `${e.memberType}:${e.memberId}`;
      const meta = nameFor(e.memberType, e.memberId, fam.data);
      const prev = acc.get(key) ?? {
        memberType: e.memberType,
        memberId: e.memberId,
        total: 0,
        count: 0,
        name: meta.name,
        color: meta.color,
      };
      prev.total += e.amountCents;
      prev.count += 1;
      acc.set(key, prev);
    }
    return Array.from(acc.values()).sort((a, b) => b.total - a.total);
  }, [entries.data, fam.data]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-tag mb-1">LEDGER</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Ledger &amp; payout
          </h2>
        </div>
        <a className="btn-secondary" href="/api/ledger.csv" download>
          Download CSV
        </a>
      </header>

      <section className="card p-5 sm:p-6">
        <h3 className="mb-3 font-display text-lg font-extrabold sm:text-xl">
          Owed (unpaid) by member
        </h3>
        {totals.length === 0 ? (
          <EmptyState
            illustration="ledger"
            compact
            title="All paid up"
            body="Nothing owed right now."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {totals.map((t) => (
              <li
                key={`${t.memberType}:${t.memberId}`}
                className="flex flex-col items-stretch gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900 sm:flex-row sm:items-center sm:justify-between sm:p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar name={t.name} color={t.color} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold sm:text-base">
                      {t.name}
                    </div>
                    <div className="text-xs text-ink-500">{t.count} chores</div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <span className="money-amt text-lg sm:text-xl">{money(t.total)}</span>
                  <button
                    className="btn-money"
                    onClick={() =>
                      pay.mutate({ memberType: t.memberType, memberId: t.memberId })
                    }
                    disabled={pay.isPending}
                  >
                    Mark paid
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <h3 className="mb-3 font-display text-lg font-extrabold sm:text-xl">
          Unpaid line items
        </h3>
        {(entries.data ?? []).length === 0 ? (
          <EmptyState
            illustration="ledger"
            compact
            title="No unpaid entries"
            body="Approved chores show up here while they’re still owed."
          />
        ) : (
          <ul className="divide-y-2 divide-cream-200">
            {entries.data!.map((e) => {
              const meta = nameFor(e.memberType, e.memberId, fam.data);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{e.choreName}</div>
                    <div className="text-xs text-ink-500">
                      {meta.name} · {relativePast(e.earnedAt)}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span className="money-amt text-sm">{money(e.amountCents)}</span>
                    <button
                      className="btn-secondary"
                      onClick={() => pay.mutate({ entryIds: [e.id] })}
                    >
                      Mark paid
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <h3 className="mb-3 font-display text-lg font-extrabold sm:text-xl">Past weeks</h3>
        {(weeks.data ?? []).length === 0 ? (
          <EmptyState
            illustration="ledger"
            compact
            title="No closed weeks yet"
            body="Once Sunday rolls around, this fills with payday snapshots."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {weeks.data!.map((w) => {
              const champ = w.championMemberId
                ? nameFor(w.championMemberType ?? 'kid', w.championMemberId, fam.data)
                : null;
              const total = w.totals.reduce((acc, t) => acc + t.totalCents, 0);
              return (
                <li
                  key={w.id}
                  className="rounded-xl bg-cream-50 p-4 ring-2 ring-ink-900"
                >
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {new Date(w.startsAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      –{' '}
                      {new Date(w.endsAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="money-amt text-sm">{money(total)}</span>
                  </div>
                  {champ && (
                    <div className="mb-2 text-xs text-ink-500">
                      Champion: <span className="font-semibold text-ink-900">{champ.name}</span>{' '}
                      · {money(w.championAmountCents ?? 0)}
                    </div>
                  )}
                  <ul className="flex flex-col gap-2">
                    {w.totals.map((t) => {
                      const meta = nameFor(t.memberType, t.memberId, fam.data);
                      return (
                        <li
                          key={`${w.id}-${t.memberType}-${t.memberId}`}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <MemberAvatar name={meta.name} color={meta.color} size="xs" />
                            <span className="truncate">{meta.name}</span>
                            <span className="hidden text-xs text-ink-500 sm:inline">
                              · {t.count} chores
                            </span>
                          </span>
                          <span className="flex flex-shrink-0 items-center gap-2">
                            <span className="money-amt">{money(t.totalCents)}</span>
                            {t.unpaidCents > 0 && (
                              <button
                                className="btn-money"
                                onClick={() =>
                                  pay.mutate({
                                    weekId: w.id,
                                    memberType: t.memberType,
                                    memberId: t.memberId,
                                  })
                                }
                              >
                                Pay {money(t.unpaidCents)}
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function nameFor(
  type: MemberType,
  id: string,
  data?: { kids: Kid[]; parents: Parent[] },
): { name: string; color?: string } {
  if (!data) return { name: 'Unknown' };
  if (type === 'kid') {
    const k = data.kids.find((x) => x.id === id);
    return { name: k?.name ?? 'Unknown', color: k?.color };
  }
  const p = data.parents.find((x) => x.id === id);
  return { name: p?.name ?? 'Unknown' };
}
