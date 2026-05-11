import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BoardResponse, LeaderboardResponse } from '../lib/types';
import { money, timeUntil } from '../lib/format';
import {
  DesktopTitle,
  MemberAvatar,
  MoneyHeadline,
  ProgressBar,
  buildMemberLookup,
} from '../ui/primitives';

type LatestBadge = {
  code: string;
  name: string;
  description: string;
  icon: string | null;
  awardedAt: string;
  memberType: 'user' | 'kid';
  memberId: string;
};

export function FamilyDashboard({
  leaderboard,
  board,
}: {
  leaderboard?: LeaderboardResponse;
  board?: BoardResponse;
}) {
  const familyTotals = useQuery({
    queryKey: ['family-stats'],
    queryFn: () =>
      api.get<{ lifetimeCents: number; lifetimeChores: number }>('/api/stats/family'),
    refetchInterval: 5 * 60_000,
  });

  // Aggregated "top streak", "most recent level up", and "latest badge" across
  // members. Cheap to compute client-side from each member's stats.
  const memberStats = useMemberStats(board);
  const topStreak = pickTopStreak(memberStats);
  const lastLevelUp = pickLastLevelUp(memberStats);
  const latestBadge = pickLatestBadge(memberStats);

  // Refresh the countdown every 30s.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const entries = leaderboard?.entries ?? [];
  const total = entries.reduce((acc, e) => acc + e.amountCents, 0);
  const maxAmount = Math.max(1, ...entries.map((e) => e.amountCents));
  const lookup = board ? buildMemberLookup(board.kids, board.parents) : null;

  return (
    <div className="h-full overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <DesktopTitle
          date={
            board?.family.name
              ? `${board.family.name.toUpperCase()} · THIS WEEK`
              : 'THIS WEEK'
          }
          title="Family dashboard"
        />

        {/* Hero: giant money headline + payday countdown + jar illustration */}
        <section className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <MoneyHeadline amountCents={total} />
            {leaderboard?.payoutAt && (
              <p className="mt-2 text-sm font-semibold text-ink-700">
                Payday in {timeUntil(leaderboard.payoutAt)}
              </p>
            )}
          </div>
          <MoneyJar amountCents={total} />
        </section>

        {/* Leaderboard + side tiles */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <section className="card p-5 sm:p-6">
            <header className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-extrabold tracking-tight">
                This week
              </h2>
              {leaderboard?.payoutAt && (
                <span className="text-xs text-ink-500">
                  Champion announced{' '}
                  {new Date(leaderboard.payoutAt).toLocaleString(undefined, {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </header>
            <ol className="flex flex-col gap-3">
              {entries.length === 0 && (
                <li className="text-sm text-ink-500">
                  No earnings yet this week — be the first!
                </li>
              )}
              {entries.map((e, i) => (
                <li
                  key={`${e.memberType}:${e.memberId}`}
                  className="flex items-center gap-3"
                >
                  <span className="w-4 text-right text-sm font-semibold text-ink-500">
                    {i + 1}
                  </span>
                  <MemberAvatar name={e.name} color={e.color} size="sm" />
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-semibold">
                          {e.name}
                          {i === 0 && entries.length > 1 && (
                            <span className="ml-1.5 inline-block animate-crownBob">👑</span>
                          )}
                        </span>
                        <span className="money-amt text-sm">
                          {money(e.amountCents)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <ProgressBar
                          percent={(e.amountCents / maxAmount) * 100}
                          color={e.color ?? '#10182B'}
                          height="sm"
                        />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-col gap-4">
            <StatTile
              tag="Top daily streak"
              icon="🔥"
              accent="#E07E2E"
              value={topStreak ? `${topStreak.streak}` : '—'}
              caption={
                topStreak
                  ? `${topStreak.name} · ${topStreak.streak === topStreak.best ? 'longest yet' : `best ${topStreak.best}`}`
                  : 'No streaks yet.'
              }
            />
            <StatTile
              tag={
                lastLevelUp ? `${lastLevelUp.name.toUpperCase()} · LEVEL UP` : 'LEVEL'
              }
              icon="⚡"
              accent="#E8B12A"
              value={lastLevelUp ? `${lastLevelUp.level}` : '—'}
              caption={
                lastLevelUp
                  ? `Champion · ${lastLevelUp.xp.toLocaleString()} XP`
                  : 'Approve a chore to start earning XP.'
              }
            />
            <BadgeTile
              latest={latestBadge}
              ownerName={
                latestBadge && lookup
                  ? lookup.byKey(latestBadge.memberType, latestBadge.memberId)?.name
                  : null
              }
            />
          </div>
        </div>

        {/* Family footer stats — lifetime totals */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FamilyStat label="Family lifetime $" value={money(familyTotals.data?.lifetimeCents ?? 0)} />
          <FamilyStat
            label="Family lifetime chores"
            value={String(familyTotals.data?.lifetimeChores ?? 0)}
          />
          {board && (
            <>
              <FamilyStat
                label="On the board"
                value={`${board.instances.filter((i) => i.status === 'available').length}`}
              />
              <FamilyStat
                label="Approved today"
                value={`${board.instances.filter((i) => i.status === 'approved').length}`}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type MemberRollup = {
  member: { type: 'user' | 'kid'; id: string; name: string; color?: string };
  streak: number;
  best: number;
  level: number;
  xp: number;
  badges: Array<{
    code: string;
    name: string;
    description: string;
    icon: string | null;
    awardedAt: string;
  }>;
};

function useMemberStats(board?: BoardResponse): MemberRollup[] | undefined {
  // Fetch per-member stats in parallel so we can derive top streak / latest
  // badge without bespoke API surface. React Query batches the requests and
  // caches them with the same key as Member Dashboards.
  return useQuery<MemberRollup[]>({
    queryKey: [
      'family-stats-rollup',
      board?.kids.map((k) => k.id).join(','),
      board?.parents.map((p) => p.id).join(','),
    ],
    enabled: !!board,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      if (!board) return [];
      const members: Array<MemberRollup['member']> = [
        ...board.kids.map((k) => ({
          type: 'kid' as const,
          id: k.id,
          name: k.name,
          color: k.color,
        })),
        ...board.parents.map((u) => ({
          type: 'user' as const,
          id: u.id,
          name: u.name,
          color: undefined,
        })),
      ];
      const results = await Promise.all(
        members.map(async (m): Promise<MemberRollup | null> => {
          try {
            const r = await api.get<{
              stats: { streak: number; bestStreak: number; level: number; xp: number };
              badges: MemberRollup['badges'];
            }>(`/api/stats/member/${m.type}/${m.id}`);
            return {
              member: m,
              streak: r.stats.streak,
              best: r.stats.bestStreak,
              level: r.stats.level,
              xp: r.stats.xp,
              badges: r.badges ?? [],
            };
          } catch {
            return null;
          }
        }),
      );
      return results.filter((x): x is MemberRollup => x !== null);
    },
  }).data;
}

function pickTopStreak(rollup?: MemberRollup[]) {
  if (!rollup) return null;
  return rollup.reduce<{ name: string; streak: number; best: number } | null>((best, r) => {
    if (r.streak === 0) return best;
    if (!best || r.streak > best.streak) return { name: r.member.name, streak: r.streak, best: r.best };
    return best;
  }, null);
}

function pickLastLevelUp(rollup?: MemberRollup[]) {
  if (!rollup) return null;
  // No timestamps here yet — show the member with the highest level as proxy.
  return rollup.reduce<{ name: string; level: number; xp: number } | null>((best, r) => {
    if (r.xp === 0) return best;
    if (!best || r.level > best.level || (r.level === best.level && r.xp > best.xp)) {
      return { name: r.member.name, level: r.level, xp: r.xp };
    }
    return best;
  }, null);
}

function pickLatestBadge(rollup?: MemberRollup[]): LatestBadge | null {
  if (!rollup) return null;
  let best: LatestBadge | null = null;
  for (const r of rollup) {
    for (const b of r.badges) {
      if (!best || b.awardedAt > best.awardedAt) {
        best = { ...b, memberType: r.member.type, memberId: r.member.id };
      }
    }
  }
  return best;
}

function MoneyJar({ amountCents }: { amountCents: number }) {
  // Simple, themable SVG jar that "fills" with the family weekly tally.
  // Doesn't try to be photoreal — just a cute ambient signal.
  const max = 10_000; // visually saturates around $100/week
  const fill = Math.max(0, Math.min(1, amountCents / max));
  return (
    <div className="relative h-32 w-32 flex-shrink-0 sm:h-36 sm:w-36">
      <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full">
        <defs>
          <clipPath id="jar-clip">
            <rect x="22" y="46" width="96" height="78" rx="14" />
          </clipPath>
        </defs>
        {/* Rays */}
        <g stroke="#E8B12A" strokeWidth="3" strokeLinecap="round">
          {Array.from({ length: 10 }, (_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            const x1 = 70 + Math.cos(angle) * 60;
            const y1 = 70 + Math.sin(angle) * 60;
            const x2 = 70 + Math.cos(angle) * 70;
            const y2 = 70 + Math.sin(angle) * 70;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
        {/* Lid */}
        <rect x="28" y="36" width="84" height="14" rx="5" fill="#10182B" />
        {/* Jar body */}
        <rect
          x="22"
          y="46"
          width="96"
          height="78"
          rx="14"
          fill="#FBFAF4"
          stroke="#10182B"
          strokeWidth="3"
        />
        {/* Liquid fill */}
        <g clipPath="url(#jar-clip)">
          <rect
            x="22"
            y={46 + 78 * (1 - fill)}
            width="96"
            height={78 * fill}
            fill="#E8B12A"
          />
          {/* Coin glints */}
          {[0, 1, 2, 3].map((i) => (
            <circle
              key={i}
              cx={40 + (i * 18) % 60}
              cy={46 + 78 - 14 - (i * 10)}
              r="6"
              fill="#E07E2E"
              stroke="#10182B"
              strokeWidth="1.5"
            />
          ))}
        </g>
        {/* Label */}
        <rect
          x="40"
          y="86"
          width="60"
          height="16"
          rx="3"
          fill="#FBFAF4"
          stroke="#10182B"
          strokeWidth="1.5"
        />
        <text x="70" y="98" textAnchor="middle" fontSize="9" fontWeight="700" fill="#10182B">
          PAYDAY
        </text>
      </svg>
    </div>
  );
}

function StatTile({
  tag,
  icon,
  accent,
  value,
  caption,
}: {
  tag: string;
  icon: string;
  accent: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg text-lg ring-2 ring-ink-900"
        style={{ backgroundColor: hexAlpha(accent, 0.18) }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="page-tag">{tag}</div>
        <div className="flex items-baseline gap-2">
          <span
            className="font-display text-2xl font-extrabold"
            style={{ color: accent }}
          >
            {value}
          </span>
          <span className="truncate text-xs text-ink-500">{caption}</span>
        </div>
      </div>
    </div>
  );
}

function BadgeTile({
  latest,
  ownerName,
}: {
  latest: LatestBadge | null;
  ownerName?: string | null;
}) {
  if (!latest) {
    return (
      <div className="card flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-cream-200 text-lg ring-2 ring-ink-900">
          🏅
        </div>
        <div className="min-w-0 flex-1">
          <div className="page-tag">Latest badge</div>
          <p className="truncate text-xs text-ink-500">No badges yet.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-yellow/20 text-lg ring-2 ring-ink-900">
        {latest.icon ?? '🏅'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="page-tag">Latest badge</div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-extrabold text-accent-orange">
            {latest.name}
          </span>
          <span className="truncate text-xs text-ink-500">
            {ownerName ? `${ownerName} · ${latest.description}` : latest.description}
          </span>
        </div>
      </div>
    </div>
  );
}

function FamilyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="page-tag">{label}</span>
      <span className="font-display text-2xl font-extrabold tracking-tight">{value}</span>
    </div>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(91,96,114,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
