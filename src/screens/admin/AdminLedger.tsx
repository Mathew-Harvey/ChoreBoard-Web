import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Family, Kid, LedgerEntry, MemberType, Parent } from '../../lib/types';
import { money, relativePast } from '../../lib/format';
import { MemberAvatar } from '../../ui/primitives';

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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="page-tag">LEDGER</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            Ledger & payout
          </h2>
        </div>
        <a className="btn-secondary" href="/api/ledger.csv" download>
          Download CSV
        </a>
      </header>

      <section className="card p-6">
        <h3 className="mb-3 font-display text-lg font-extrabold">
          Owed (unpaid) by member
        </h3>
        {totals.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing owed right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {totals.map((t) => (
              <li
                key={`${t.memberType}:${t.memberId}`}
                className="flex items-center justify-between rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar name={t.name} color={t.color} size="md" />
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-ink-500">{t.count} chores</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="money-amt text-lg">{money(t.total)}</span>
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

      <section className="card p-6">
        <h3 className="mb-3 font-display text-lg font-extrabold">Unpaid line items</h3>
        {(entries.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">No unpaid entries.</p>
        ) : (
          <ul className="divide-y-2 divide-cream-200">
            {entries.data!.map((e) => {
              const meta = nameFor(e.memberType, e.memberId, fam.data);
              return (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-semibold">{e.choreName}</div>
                    <div className="text-xs text-ink-500">
                      {meta.name} · {relativePast(e.earnedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="money-amt text-sm">{money(e.amountCents)}</span>
                    <button
                      className="btn-secondary !py-1.5"
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

      <section className="card p-6">
        <h3 className="mb-3 font-display text-lg font-extrabold">Past weeks</h3>
        {(weeks.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">No closed weeks yet.</p>
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
                  <ul className="flex flex-col gap-1.5">
                    {w.totals.map((t) => {
                      const meta = nameFor(t.memberType, t.memberId, fam.data);
                      return (
                        <li
                          key={`${w.id}-${t.memberType}-${t.memberId}`}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <MemberAvatar name={meta.name} color={meta.color} size="xs" />
                            <span>{meta.name}</span>
                            <span className="text-xs text-ink-500">· {t.count} chores</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="money-amt">{money(t.totalCents)}</span>
                            {t.unpaidCents > 0 && (
                              <button
                                className="btn-money !py-1"
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
