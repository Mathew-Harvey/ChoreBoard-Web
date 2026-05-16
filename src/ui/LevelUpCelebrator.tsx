import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BoardResponse, MemberType } from '../lib/types';
import {
  portraitFor,
  tierForLevel,
} from '../lib/levelTier';
import { buildMemberLookup } from './primitives';
import { celebrate } from '../lib/celebrate';

type LevelUpEvt = {
  memberType: MemberType | null;
  memberId: string | null;
  level: number | null;
  receivedAt: number;
};

/**
 * Listens for `cb:level.up` window events (re-dispatched by useFamilyEvents
 * from the SSE channel) and pops a full-screen celebration when any member
 * in the family tiers up. Auto-dismisses after 9s, or on tap.
 *
 * Why a global, queue-style component instead of inline per-screen?
 *   1. Level-ups are rare and high-emotion — they deserve to take over the
 *      screen no matter what desktop is showing.
 *   2. The same `<MilestoneCelebrator />` + `<ChampionBanner />` already use
 *      this pattern, so the user's celebration UI feels consistent.
 *   3. If two members tier up in the same minute (e.g. weekly-approval
 *      avalanche) we still want both pops — the latest replaces the
 *      previous and the dismiss timer restarts.
 */
export function LevelUpCelebrator() {
  const [evt, setEvt] = useState<LevelUpEvt | null>(null);

  // Resolve memberId → name + color. The board query is already warm on
  // every dashboard so this rarely refetches.
  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardResponse>('/api/board'),
    enabled: !!evt,
  });

  useEffect(() => {
    function onLevelUp(e: Event) {
      const ce = e as CustomEvent<Omit<LevelUpEvt, 'receivedAt'>>;
      if (!ce.detail?.memberId || ce.detail.level == null) return;
      setEvt({ ...ce.detail, receivedAt: Date.now() });
    }
    window.addEventListener('cb:level.up', onLevelUp as EventListener);
    return () => {
      window.removeEventListener('cb:level.up', onLevelUp as EventListener);
    };
  }, []);

  // Auto-dismiss + a small confetti burst from the centre of the overlay
  // the moment it shows.
  useEffect(() => {
    if (!evt) return;
    const burst = setTimeout(() => {
      celebrate(
        { x: window.innerWidth / 2, y: window.innerHeight * 0.4 },
        { pieces: 60, spread: 320, durationMs: 2400 },
      );
    }, 220);
    const t = setTimeout(() => setEvt(null), 9_000);
    return () => {
      clearTimeout(t);
      clearTimeout(burst);
    };
  }, [evt]);

  const lookup = useMemo(
    () =>
      board.data
        ? buildMemberLookup(board.data.kids, board.data.parents)
        : { byKey: () => undefined },
    [board.data],
  );

  if (!evt || !evt.memberType || !evt.memberId || evt.level == null) return null;
  const member = lookup.byKey(evt.memberType, evt.memberId);
  if (!member) return null;

  const tier = tierForLevel(evt.level);
  // Use the resolved gender for this specific member — falls back to the
  // alternating m/f pick for `'unspecified'` ("rather not say") members.
  const portrait = portraitFor(evt.level, member.gender);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/55 p-4 backdrop-blur-md animate-floatIn"
      onClick={() => setEvt(null)}
      role="dialog"
      aria-label={`${member.name} reached level ${evt.level}`}
    >
      <div
        className="relative w-full max-w-md animate-levelUpBurst sm:max-w-lg lg:max-w-xl"
        style={
          {
            '--tier-glow': tier.color,
          } as React.CSSProperties
        }
      >
        {/* Rotating sunburst behind the card */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-40%] grid place-items-center"
        >
          <div
            className="h-full w-full animate-rayRotate opacity-50"
            style={{
              backgroundImage: `repeating-conic-gradient(from 0deg, ${tier.color}66 0deg 6deg, transparent 6deg 18deg)`,
              borderRadius: '50%',
              maskImage:
                'radial-gradient(circle, black 30%, transparent 75%)',
              WebkitMaskImage:
                'radial-gradient(circle, black 30%, transparent 75%)',
            }}
          />
        </div>

        <div className="card relative overflow-hidden p-7 text-center sm:p-10 2xl:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-tierGlow"
            style={{
              background: `radial-gradient(ellipse at 50% 30%, ${tier.color}55, transparent 65%)`,
            }}
          />
          <div className="relative">
            <div
              className="page-tag mb-2 text-center"
              style={{ color: tier.color }}
            >
              ✨ TIER UP ✨
            </div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              {member.name}
            </h2>
            <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-ink-500 sm:text-base">
              Reached Level {evt.level}
            </p>

            <div className="relative mx-auto mt-5 flex h-[260px] w-[200px] items-end justify-center sm:h-[320px] sm:w-[240px] lg:h-[360px] lg:w-[280px]">
              <span
                aria-hidden
                className="absolute inset-0 animate-tierGlow"
                style={{ background: tier.pedestal }}
              />
              <img
                src={portrait}
                alt=""
                draggable={false}
                className="relative h-full w-auto drop-shadow-[0_18px_30px_rgba(16,24,43,0.30)]"
              />
            </div>

            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-base font-extrabold uppercase tracking-[0.2em] text-white ring-2 ring-ink-900 shadow-paper-sm sm:text-lg"
              style={{ backgroundColor: tier.color }}
            >
              <span className="text-xs opacity-80">{tier.eyebrow}</span>
              <span>· {tier.name}</span>
            </div>

            <p className="mt-4 text-sm italic text-ink-600 sm:text-base">
              {tier.blurb}
            </p>

            <button
              type="button"
              className="btn-primary mt-6 w-full sm:mt-8"
              onClick={(e) => {
                e.stopPropagation();
                setEvt(null);
              }}
            >
              Onwards
            </button>
            <p className="mt-2 text-[11px] uppercase tracking-wider text-ink-400">
              Tap anywhere to dismiss
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
