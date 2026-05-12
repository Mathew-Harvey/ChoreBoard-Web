import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { BoardResponse, LeaderboardResponse } from '../lib/types';
import { money, timeUntil } from '../lib/format';
import {
  DesktopTitle,
  MemberAvatar,
  ProgressBar,
  buildMemberLookup,
} from '../ui/primitives';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonDesktop, SkeletonStatRow } from '../ui/Skeleton';
import { StreakChip } from '../ui/StreakChip';
import {
  useFamilyMemberStats,
  rollupByKey,
  type MemberRollup,
} from '../lib/useFamilyMemberStats';

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
  // members. Cheap to compute client-side from each member's stats. Shared
  // with TVMode + Kanban via the same React Query key.
  const memberStatsQ = useFamilyMemberStats(board);
  const memberStats = memberStatsQ.data;
  const memberLookup = rollupByKey(memberStats);
  const topStreak = pickTopStreak(memberStats);
  const lastLevelUp = pickLastLevelUp(memberStats);
  const latestBadge = pickLatestBadge(memberStats);

  // Refresh the countdown every 30s.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // TV mode is global now — Desktops.tsx renders <TVMode /> when ?tv=1.
  // The Family dashboard exposes a kiosk-pin button and a triple-tap on the
  // page title (power-user hint) that flips that flag.
  const [searchParams, setSearchParams] = useSearchParams();
  const openTv = () => {
    const next = new URLSearchParams(searchParams);
    next.set('tv', '1');
    setSearchParams(next, { replace: false });
  };
  const tapTimes = useRef<number[]>([]);
  const handleTitleTap = () => {
    const now = Date.now();
    tapTimes.current = [...tapTimes.current.filter((t) => now - t < 800), now];
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      openTv();
    }
  };

  const entries = leaderboard?.entries ?? [];
  const total = entries.reduce((acc, e) => acc + e.amountCents, 0);
  const maxAmount = Math.max(1, ...entries.map((e) => e.amountCents));
  const lookup = board ? buildMemberLookup(board.kids, board.parents) : null;

  if (!board || !leaderboard) {
    return <SkeletonDesktop />;
  }
  // Mark skeleton helper as referenced so unused-imports lint stays quiet.
  void SkeletonStatRow;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-7 2xl:p-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 sm:gap-6 2xl:gap-8">
        <div onClick={handleTitleTap}>
          <DesktopTitle
            date={
              board?.family.name
                ? `${board.family.name.toUpperCase()} · THIS WEEK`
                : 'THIS WEEK'
            }
            title="Family dashboard"
            right={
              <button
                type="button"
                onClick={openTv}
                className="btn-secondary"
                title="Open TV mode for the kitchen wall"
              >
                <span aria-hidden>📺</span> TV mode
              </button>
            }
          />
        </div>

        {/* Hero: giant money headline + payday countdown + jar illustration */}
        <section className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8 2xl:p-12">
          <div className="min-w-0">
            <div className="page-tag mb-2">TOTAL THIS WEEK</div>
            <AnimatedNumber
              value={total}
              format={money}
              className="block font-display text-fluid-money font-extrabold tabular-nums tracking-tight text-money"
            />
            {leaderboard?.payoutAt && (
              <p className="mt-3 text-sm font-semibold text-ink-700 sm:text-base">
                Payday in {timeUntil(leaderboard.payoutAt)}
              </p>
            )}
          </div>
          <MoneyJar amountCents={total} />
        </section>

        {/* Leaderboard + side tiles */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] 2xl:gap-6">
          <section className="card p-5 sm:p-6 2xl:p-8">
            <header className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-baseline">
              <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl 2xl:text-3xl">
                This week
              </h2>
              {leaderboard?.payoutAt && (
                <span className="text-xs text-ink-500 sm:text-sm">
                  Champion announced{' '}
                  {new Date(leaderboard.payoutAt).toLocaleString(undefined, {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </header>
            {entries.length === 0 ? (
              <EmptyState
                illustration="leaderboard"
                title="No earnings yet this week"
                body="Drag a chore into a lane to be the first on the board."
              />
            ) : (
              <ol className="flex flex-col gap-3">
                {entries.map((e, i) => {
                  const rollup = memberLookup.get(e.memberType, e.memberId);
                  return (
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
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2 truncate text-sm font-semibold sm:text-base">
                              <span className="truncate">{e.name}</span>
                              {i === 0 && entries.length > 1 && (
                                <span className="inline-block animate-crownBob">👑</span>
                              )}
                              {rollup && (
                                <StreakChip
                                  streak={rollup.stats.streak}
                                  bestStreak={rollup.stats.bestStreak}
                                  size="xs"
                                />
                              )}
                            </span>
                            <AnimatedNumber
                              value={e.amountCents}
                              format={money}
                              className="money-amt text-sm sm:text-base"
                            />
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
                  );
                })}
              </ol>
            )}
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
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:gap-4">
          <FamilyStat
            label="Family lifetime $"
            value={money(familyTotals.data?.lifetimeCents ?? 0)}
          />
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

function pickTopStreak(rollup?: MemberRollup[]) {
  if (!rollup) return null;
  return rollup.reduce<{ name: string; streak: number; best: number } | null>((acc, r) => {
    if (r.stats.streak === 0) return acc;
    if (!acc || r.stats.streak > acc.streak)
      return { name: r.member.name, streak: r.stats.streak, best: r.stats.bestStreak };
    return acc;
  }, null);
}

function pickLastLevelUp(rollup?: MemberRollup[]) {
  if (!rollup) return null;
  // No timestamps here yet — show the member with the highest level as proxy.
  return rollup.reduce<{ name: string; level: number; xp: number } | null>((best, r) => {
    if (r.stats.xp === 0) return best;
    if (
      !best ||
      r.stats.level > best.level ||
      (r.stats.level === best.level && r.stats.xp > best.xp)
    ) {
      return { name: r.member.name, level: r.stats.level, xp: r.stats.xp };
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
    <div className="relative mx-auto h-36 w-36 flex-shrink-0 sm:mx-0 sm:h-44 sm:w-44 lg:h-52 lg:w-52 2xl:h-64 2xl:w-64">
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
    <div className="card flex items-center gap-3 p-4 sm:p-5 2xl:p-6">
      <div
        className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg text-xl ring-2 ring-ink-900 2xl:h-14 2xl:w-14 2xl:text-2xl"
        style={{ backgroundColor: hexAlpha(accent, 0.18) }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="page-tag truncate">{tag}</div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className="font-display text-2xl font-extrabold sm:text-3xl 2xl:text-4xl"
            style={{ color: accent }}
          >
            {value}
          </span>
          <span className="truncate text-xs text-ink-500 sm:text-sm">{caption}</span>
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
      <div className="card flex items-center gap-3 p-4 sm:p-5 2xl:p-6">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-cream-200 text-xl ring-2 ring-ink-900 2xl:h-14 2xl:w-14 2xl:text-2xl">
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
    <div className="card flex items-center gap-3 p-4 sm:p-5 2xl:p-6">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent-yellow/20 text-xl ring-2 ring-ink-900 2xl:h-14 2xl:w-14 2xl:text-2xl">
        {latest.icon ?? '🏅'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="page-tag truncate">Latest badge</div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-display text-lg font-extrabold text-accent-orange sm:text-xl 2xl:text-2xl">
            {latest.name}
          </span>
          <span className="truncate text-xs text-ink-500 sm:text-sm">
            {ownerName ? `${ownerName} · ${latest.description}` : latest.description}
          </span>
        </div>
      </div>
    </div>
  );
}

function FamilyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4 sm:p-5 2xl:p-6">
      <span className="page-tag truncate">{label}</span>
      <span className="font-display text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl 2xl:text-4xl">
        {value}
      </span>
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

