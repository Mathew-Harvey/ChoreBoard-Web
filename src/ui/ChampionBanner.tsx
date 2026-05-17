import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BoardResponse, MemberStats } from '../lib/types';
import { money } from '../lib/format';
import { resolveDisplayGender } from '../lib/levelTier';
import { MemberAvatar, buildMemberLookup } from './primitives';
import { TierDancer } from './TierDancer';

/**
 * How long the Champion-of-the-Week ceremony stays on screen before it
 * auto-dismisses. Single source of truth for the in-app banner timeout
 * AND for the TV-mode slide-rotation pause window — `TVMode.tsx` imports
 * this constant so both numbers can never drift apart.
 */
export const TV_CHAMPION_CEREMONY_MS = 12_000;

type ChampionEvt = {
  weekId: string;
  championMemberType: 'user' | 'kid' | null;
  championMemberId: string | null;
  championAmountCents: number | null;
  receivedAt: number;
};

/**
 * Listens for `week.closed` events on the global SSE channel and renders
 * a "Champion of the Week" celebration. Two variants:
 *
 *   • Default (every signed-in surface — phone, tablet, web): a centered
 *     modal-card with confetti + crown bob, dismiss-on-tap. The original
 *     v1 behaviour, untouched.
 *   • TV (when `body[data-tv='1']`): a beat-staged full-screen takeover
 *     that gives the level dance art a moment to enter before drowning it
 *     in confetti. Timeline (PR 11):
 *
 *       0ms     stage fade-in (400ms)
 *               confetti burst starts (240 pieces, ~4.8s)
 *               chime fades 0 → 0.4 over 600ms (gated by family setting
 *               + body[data-silent='1'])
 *       600ms   tier portrait scales 0.6 → 1.0 with overshoot (1000ms)
 *       800ms   crown 👑 drops in from above (480ms), then bobs
 *       1400ms  champion name reveals (translate-y-3 → 0, 380ms)
 *       2000ms  weekly amount reveals (200ms after the name)
 *       2400ms  dance video starts looping under the still portrait
 *       12000ms auto-dismiss; TVMode resumes slide rotation
 *
 *     Reduced-motion: skip the scale, crown bob, confetti, and dance video
 *     — the still portrait + name + amount + chime still play. Silent
 *     mode (`body[data-silent='1']` or `family.tvCelebrationSound = false`)
 *     skips the chime regardless.
 */
export function ChampionBanner() {
  const [evt, setEvt] = useState<(ChampionEvt & { tvMode: boolean }) | null>(null);

  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardResponse>('/api/board'),
    enabled: !!evt,
  });

  const championStats = useQuery({
    queryKey: [
      'member',
      evt?.championMemberType ?? '',
      evt?.championMemberId ?? '',
    ],
    queryFn: () =>
      api.get<MemberStats>(
        `/api/stats/member/${evt!.championMemberType}/${evt!.championMemberId}`,
      ),
    enabled: !!evt && !!evt.championMemberType && !!evt.championMemberId,
  });
  const championLevel = championStats.data?.stats.level ?? null;

  useEffect(() => {
    function onWeekClosed(e: Event) {
      const ce = e as CustomEvent<ChampionEvt>;
      const tvMode =
        typeof document !== 'undefined' &&
        document.body.dataset.tv === '1';
      setEvt({ ...ce.detail, receivedAt: Date.now(), tvMode });
    }
    window.addEventListener('cb:week.closed', onWeekClosed as EventListener);
    return () => {
      window.removeEventListener('cb:week.closed', onWeekClosed as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!evt) return;
    const t = setTimeout(() => setEvt(null), TV_CHAMPION_CEREMONY_MS);
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

  if (evt.tvMode) {
    return (
      <TVCeremony
        evt={evt}
        champ={champ}
        championLevel={championLevel}
        familySoundOn={board.data?.family.tvCelebrationSound ?? true}
        onDismiss={() => setEvt(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm animate-floatIn"
      onClick={() => setEvt(null)}
      role="dialog"
      aria-label="Champion of the week"
    >
      <Confetti pieces={90} spread={600} />
      <div className="card relative w-full max-w-md p-8 text-center sm:max-w-lg sm:p-10 lg:max-w-xl 2xl:max-w-2xl 2xl:p-14">
        <div className="page-tag mb-3">CHAMPION OF THE WEEK</div>
        {champ ? (
          <>
            <div className="relative mx-auto inline-block">
              <div className="hidden 2xl:block">
                <MemberAvatar
                  name={champ.name}
                  color={champ.color}
                  size="3xl"
                  level={championLevel}
                  gender={champ.gender}
                  glow
                />
              </div>
              <div className="hidden lg:block 2xl:hidden">
                <MemberAvatar
                  name={champ.name}
                  color={champ.color}
                  size="2xl"
                  level={championLevel}
                  gender={champ.gender}
                  glow
                />
              </div>
              <div className="lg:hidden">
                <MemberAvatar
                  name={champ.name}
                  color={champ.color}
                  size="xl"
                  level={championLevel}
                  gender={champ.gender}
                  glow
                />
              </div>
              <span
                aria-hidden
                className="absolute -top-6 left-1/2 -translate-x-1/2 animate-crownBob text-4xl lg:-top-8 lg:text-5xl 2xl:-top-10 2xl:text-6xl"
              >
                👑
              </span>
            </div>
            <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl 2xl:text-7xl">
              {champ.name}
            </h2>
            {evt.championAmountCents !== null && (
              <p className="mt-2 text-lg font-extrabold text-money sm:text-xl lg:text-2xl 2xl:text-3xl">
                {money(evt.championAmountCents)} this week
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
              Week closed!
            </h2>
            <p className="mt-2 text-ink-500">
              No earnings this week — fresh start tomorrow.
            </p>
          </>
        )}
        <button className="btn-primary mt-6 w-full sm:mt-8" onClick={() => setEvt(null)}>
          Onwards
        </button>
        <p className="mt-3 text-[11px] uppercase tracking-wider text-ink-400">
          Tap anywhere to dismiss
        </p>
      </div>
    </div>
  );
}

function TVCeremony({
  evt,
  champ,
  championLevel,
  familySoundOn,
  onDismiss,
}: {
  evt: ChampionEvt;
  champ: { name: string; color?: string; gender: ReturnType<typeof resolveDisplayGender> } | undefined;
  championLevel: number | null;
  familySoundOn: boolean;
  onDismiss: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Honour reduced-motion + silent-mode at render time. Reduced-motion
  // skips the scale/crown/confetti/dance entirely; silent suppresses the
  // chime. Both are first-class per Round-2 brief.
  const reduceMotion = useReducedMotion();
  const silent =
    typeof document !== 'undefined' &&
    (document.body.dataset.silent === '1' || !familySoundOn);

  // Fade chime in 0 → 0.4 over 600ms so the attack isn't startling on a
  // kitchen wall. The asset itself lives in /public/champion-chime.mp3
  // (drop a ~1.6s, ~-12 LUFS, ≤80kB file there). If the file is missing
  // the play() promise rejects silently; nothing else degrades.
  useEffect(() => {
    if (silent || reduceMotion) return;
    const a = audioRef.current;
    if (!a) return;
    a.volume = 0;
    a.currentTime = 0;
    const playPromise = a.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Auto-play might be blocked, or the asset isn't there yet.
        // The ceremony is still readable visually — we don't escalate.
      });
    }
    let raf: number | null = null;
    const start = performance.now();
    const ramp = (t: number) => {
      const elapsed = t - start;
      const v = Math.min(0.4, (elapsed / 600) * 0.4);
      a.volume = v;
      if (elapsed < 600) raf = requestAnimationFrame(ramp);
    };
    raf = requestAnimationFrame(ramp);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      a.pause();
    };
  }, [silent, reduceMotion]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900 animate-floatIn"
      onClick={onDismiss}
      role="dialog"
      aria-label="Champion of the week"
    >
      {/* Subtle warm radial behind the avatar so the ink-900 stage
          doesn't read as a void. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(700px 500px at 50% 45%, rgba(224, 126, 46, 0.18), transparent 70%)',
        }}
      />
      {!reduceMotion && <Confetti pieces={240} spread={1100} delayMs={0} durationMs={4800} />}

      <audio
        ref={audioRef}
        src="/champion-chime.mp3"
        preload="auto"
        aria-hidden
      />

      <div className="relative flex flex-col items-center text-center">
        <div className="page-tag mb-2 text-cream-50/70">CHAMPION OF THE WEEK</div>

        {champ ? (
          <>
            {/* Avatar block. Scale-in starts at 600ms; reduced-motion
                renders it static. */}
            <div
              className="relative"
              style={
                reduceMotion
                  ? undefined
                  : ({
                      animation:
                        'tvChampScale 1000ms cubic-bezier(0.34, 1.56, 0.64, 1) 600ms both',
                    } as React.CSSProperties)
              }
            >
              {championLevel != null ? (
                <TierDancer
                  level={championLevel}
                  gender={
                    champ.gender === 'f' ? 'f' : 'm'
                  }
                  alt={champ.name}
                  mode={reduceMotion ? 'interactive' : 'celebration'}
                  className="h-[44dvh] w-[44dvh] sm:h-[48dvh] sm:w-[48dvh]"
                  style={{
                    // Dance video itself starts at 2400ms (the TierDancer
                    // begins eagerly when mode='celebration'; that's fine —
                    // the static portrait carries the first 2.4s).
                    animationDelay: '2400ms',
                  }}
                />
              ) : (
                <MemberAvatar
                  name={champ.name}
                  color={champ.color}
                  size="3xl"
                  glow
                />
              )}

              {/* Crown drops in at 800ms then bobs. Reduced-motion: render
                  static at final position. */}
              <span
                aria-hidden
                className="absolute -top-[8%] left-1/2 -translate-x-1/2 text-[12dvh]"
                style={
                  reduceMotion
                    ? undefined
                    : ({
                        animation:
                          'tvCrownDrop 480ms ease-out 800ms both, crownBob 1.6s ease-in-out 1280ms infinite',
                      } as React.CSSProperties)
                }
              >
                👑
              </span>
            </div>

            <h2
              className="mt-6 font-display font-extrabold tracking-tight text-cream-50"
              style={{
                fontSize: 'clamp(48px, 9dvh, 120px)',
                ...(reduceMotion
                  ? {}
                  : ({
                      animation: 'tvLineReveal 380ms ease-out 1400ms both',
                    } as React.CSSProperties)),
              }}
            >
              {champ.name}
            </h2>
            {evt.championAmountCents !== null && (
              <p
                className="mt-2 font-extrabold text-money"
                style={{
                  fontSize: 'clamp(22px, 5dvh, 64px)',
                  ...(reduceMotion
                    ? {}
                    : ({
                        animation: 'tvLineReveal 380ms ease-out 2000ms both',
                      } as React.CSSProperties)),
                }}
              >
                {money(evt.championAmountCents)} this week
              </p>
            )}
          </>
        ) : (
          <h2 className="font-display text-5xl font-extrabold tracking-tight text-cream-50 sm:text-6xl">
            Week closed!
          </h2>
        )}

        <p className="mt-8 text-[11px] uppercase tracking-wider text-cream-50/40">
          Tap anywhere to dismiss
        </p>
      </div>
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduce;
}

function Confetti({
  pieces = 90,
  spread = 600,
  delayMs = 0,
  durationMs = 2400,
}: {
  pieces?: number;
  spread?: number;
  delayMs?: number;
  durationMs?: number;
}) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * (durationMs / 4000),
        cx: `${(Math.random() - 0.5) * spread * 2}px`,
        color: ['#3253D7', '#DB4646', '#E8B12A', '#3CA163', '#E07E2E', '#8B5BD9'][i % 6],
        size: 6 + Math.random() * 8,
      })),
    [pieces, spread, durationMs],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((p) => (
        <span
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.4,
            background: p.color,
            animation: `confettiFall ${durationMs / 1000}s ease-in ${delayMs / 1000 + p.delay}s forwards`,
            ['--cx' as 'top']: p.cx as unknown as string,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
