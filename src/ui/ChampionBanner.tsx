import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BoardResponse } from '../lib/types';
import { money } from '../lib/format';
import { MemberAvatar, buildMemberLookup } from './primitives';

type ChampionEvt = {
  weekId: string;
  championMemberType: 'user' | 'kid' | null;
  championMemberId: string | null;
  championAmountCents: number | null;
  receivedAt: number;
};

/**
 * Listens for `week.closed` events on the global SSE channel and pops a full
 * "Champion of the Week" celebration over the app with confetti + crown.
 * Auto-dismisses after 12s or on click.
 */
export function ChampionBanner() {
  const [evt, setEvt] = useState<ChampionEvt | null>(null);

  // Pull board to resolve memberId → name + color.
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardResponse>('/api/board'),
    enabled: !!evt,
  });

  useEffect(() => {
    function onWeekClosed(e: Event) {
      const ce = e as CustomEvent<ChampionEvt>;
      setEvt({ ...ce.detail, receivedAt: Date.now() });
    }
    window.addEventListener('cb:week.closed', onWeekClosed as EventListener);
    return () => {
      window.removeEventListener('cb:week.closed', onWeekClosed as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!evt) return;
    const t = setTimeout(() => setEvt(null), 12_000);
    return () => clearTimeout(t);
  }, [evt]);

  const lookup = useMemo(
    () =>
      board.data
        ? buildMemberLookup(board.data.kids, board.data.parents)
        : { byKey: () => undefined },
    [board.data],
  );

  if (!evt) return null;

  const champ =
    evt.championMemberId && evt.championMemberType
      ? lookup.byKey(evt.championMemberType, evt.championMemberId)
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 backdrop-blur-sm animate-floatIn"
      onClick={() => setEvt(null)}
    >
      <Confetti />
      <div className="card relative max-w-md p-8 text-center">
        <div className="page-tag mb-2">CHAMPION OF THE WEEK</div>
        {champ ? (
          <>
            <div className="relative mx-auto inline-block">
              <MemberAvatar name={champ.name} color={champ.color} size="xl" />
              <span
                aria-hidden
                className="absolute -top-5 left-1/2 -translate-x-1/2 text-3xl animate-crownBob"
              >
                👑
              </span>
            </div>
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink-900">
              {champ.name}
            </h2>
            {evt.championAmountCents !== null && (
              <p className="mt-1 text-lg font-semibold text-money">
                {money(evt.championAmountCents)} this week
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
              Week closed!
            </h2>
            <p className="mt-1 text-ink-500">No earnings this week — fresh start tomorrow.</p>
          </>
        )}
        <button className="btn-primary mt-6 w-full" onClick={() => setEvt(null)}>
          Onwards
        </button>
      </div>
    </div>
  );
}

function Confetti() {
  // Pre-compute pieces once so re-renders don't reshuffle the animation.
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        cx: `${(Math.random() - 0.5) * 600}px`,
        color: ['#3253D7', '#DB4646', '#E8B12A', '#3CA163', '#E07E2E', '#8B5BD9'][i % 6],
        size: 6 + Math.random() * 8,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 animate-confettiFall"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.4,
            background: p.color,
            animationDelay: `${p.delay}s`,
            // CSS variable consumed by the keyframes for horizontal drift.
            ['--cx' as any]: p.cx,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
