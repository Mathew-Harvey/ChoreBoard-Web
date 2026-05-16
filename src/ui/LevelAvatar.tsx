import type { CSSProperties } from 'react';
import {
  allTiers,
  MAX_TIER,
  nextTier,
  portraitFor,
  tierForLevel,
  tierPercent,
  type Gender,
} from '../lib/levelTier';

// ---------------------------------------------------------------------------
//  TIER AVATAR (round)
// ---------------------------------------------------------------------------
//
// A circular avatar that swaps in the tier portrait — head & shoulders — with
// a tier-coloured ring + soft aura. This is the drop-in replacement for the
// boring initials-on-a-disc `MemberAvatar` everywhere a level is known.
//
// The PNGs are tall full-body portraits, so we crop to ~the top 60% with
// `object-position: top` so the face sits dead-centre in the circle.

const SIZE_CLASS: Record<NonNullable<TierAvatarProps['size']>, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-20 w-20',
  '2xl': 'h-28 w-28',
  '3xl': 'h-40 w-40',
};

const RING_WIDTH: Record<NonNullable<TierAvatarProps['size']>, number> = {
  xs: 2,
  sm: 2,
  md: 2,
  lg: 3,
  xl: 3,
  '2xl': 4,
  '3xl': 5,
};

type TierAvatarProps = {
  name: string;
  level?: number | null;
  gender?: Gender;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  /** Decorative outer glow that pulses with the tier accent. Default true for ≥ lg. */
  glow?: boolean;
  /** Show a tiny "L5" chip on the bottom-right. Default true for ≥ md. */
  showLevelChip?: boolean;
  style?: CSSProperties;
};

export function TierAvatar({
  name,
  level,
  gender = 'm',
  size = 'md',
  className = '',
  glow,
  showLevelChip,
  style,
}: TierAvatarProps) {
  const tier = tierForLevel(level);
  const portrait = portraitFor(level, gender);
  const sz = SIZE_CLASS[size];
  const ringPx = RING_WIDTH[size];
  // Default chip + glow visibility scales with size — tiny circles get the
  // minimal treatment, hero-sized ones get the full effect.
  const wantsChip =
    showLevelChip ?? (size !== 'xs' && size !== 'sm' && level != null);
  const wantsGlow =
    glow ?? (size === 'lg' || size === 'xl' || size === '2xl' || size === '3xl');

  return (
    <div
      className={`relative inline-grid place-items-center ${sz} ${className}`}
      style={style}
      aria-label={`${name} · ${tier.name}`}
    >
      {wantsGlow && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-[-18%] rounded-full ${
            tier.pulse ? 'animate-tierGlow' : ''
          }`}
          style={{
            background: `radial-gradient(circle, ${tier.color}${alphaHex(
              0.45 + tier.aura * 0.35,
            )} 0%, ${tier.color}00 65%)`,
            filter: `blur(${6 + tier.aura * 14}px)`,
          }}
        />
      )}
      <div
        className="relative h-full w-full overflow-hidden rounded-full shadow-paper-sm"
        style={{
          // Background image is the portrait, sized so the head fills the
          // circle. `background-size: auto 220%` makes the image 2.2x taller
          // than the container, which (combined with `background-position:
          // 50% 8%`) puts the face dead-centre regardless of size. Using
          // a background instead of an <img> avoids `object-cover` quirks
          // around oversized children inside overflow-hidden parents.
          backgroundImage: `radial-gradient(circle at 50% 115%, ${tier.color}${alphaHex(
            0.55,
          )}, ${tier.color}${alphaHex(0.08)} 55%, transparent 85%), url(${portrait})`,
          backgroundSize: 'auto 100%, auto 220%',
          backgroundPosition: 'center, 50% 8%',
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundColor: '#FBF6E6',
          boxShadow: `inset 0 0 0 ${ringPx}px ${tier.color}, 2px 2px 0 0 rgba(16,24,43,0.9)`,
        }}
      />
      {/* Hidden img keeps the asset in the preload pipeline + provides an
          accessible label for screen readers that strip background images. */}
      <img
        src={portrait}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="sr-only"
      />
      {wantsChip && (
        <span
          className="absolute -bottom-1 -right-1 grid min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-extrabold text-white ring-2 ring-paper sm:text-[11px]"
          style={{
            backgroundColor: tier.color,
            // Make the chip a touch larger at hero sizes so it doesn't
            // get lost against a 160px avatar.
            transform:
              size === '3xl' || size === '2xl' ? 'scale(1.4)' : undefined,
            transformOrigin: 'bottom right',
          }}
        >
          L{Math.max(1, level ?? 1)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  TIER PORTRAIT (hero)
// ---------------------------------------------------------------------------
//
// The big "look at me" full-body portrait used on the member dashboard hero
// card. Includes pedestal glow, optional XP progress arc, next-tier teaser,
// and a static badge with the tier name. Designed to feel like the cover
// of a trading card.

type TierPortraitProps = {
  name: string;
  level: number;
  xp: number;
  intoLevel: number;
  nextLevelAt: number;
  gender?: Gender;
  className?: string;
  /** Render the silhouette of the next tier behind the portrait once they're
   *  ≥80% of the way to the next level. */
  showNextHint?: boolean;
};

export function TierPortrait({
  name,
  level,
  xp,
  intoLevel,
  nextLevelAt,
  gender = 'm',
  className = '',
  showNextHint = true,
}: TierPortraitProps) {
  const tier = tierForLevel(level);
  const portrait = portraitFor(level, gender);
  const next = nextTier(level);
  const next_portrait = next ? portraitFor(level + 1, gender) : null;
  const percent = tierPercent(intoLevel, nextLevelAt);
  const closeToTierUp = percent >= 80 && !!next;

  return (
    <div
      className={`relative ${className}`}
      style={
        {
          '--tier-glow': tier.color,
        } as CSSProperties
      }
    >
      {/* Sunburst rays — only at higher tiers, where it stops feeling cheesy. */}
      {tier.tier >= 3 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <div
            className="h-[140%] w-[140%] animate-rayRotate opacity-30"
            style={{
              backgroundImage: `repeating-conic-gradient(from 0deg, ${tier.color}${alphaHex(
                0.32,
              )} 0deg 6deg, transparent 6deg 18deg)`,
              borderRadius: '50%',
              maskImage:
                'radial-gradient(circle, black 30%, transparent 75%)',
              WebkitMaskImage:
                'radial-gradient(circle, black 30%, transparent 75%)',
            }}
          />
        </div>
      )}

      {/* The portrait itself — sitting on a soft tier pedestal. */}
      <div className="relative flex flex-col items-center">
        <div
          className="relative flex h-[260px] w-[200px] items-end justify-center sm:h-[320px] sm:w-[240px] lg:h-[380px] lg:w-[280px]"
        >
          {/* Pedestal glow under the feet */}
          <span
            aria-hidden
            className={`absolute inset-0 ${tier.pulse ? 'animate-tierGlow' : ''}`}
            style={{ background: tier.pedestal }}
          />
          {/* Ghost of next tier, lurking behind the current portrait once
              we're close. Softens to a silhouette so it teases what's coming
              without spoiling the art. */}
          {closeToTierUp && next_portrait && showNextHint && (
            <img
              src={next_portrait}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute bottom-0 h-full w-auto translate-x-2 opacity-25 grayscale animate-portraitBreath"
              style={{
                filter: `brightness(0.25) drop-shadow(0 0 12px ${tier.color})`,
              }}
            />
          )}
          {/* Main portrait. Subtle breathing motion. */}
          <img
            src={portrait}
            alt={`${name} as a ${tier.name}`}
            draggable={false}
            className="relative h-full w-auto animate-portraitBreath drop-shadow-[0_18px_24px_rgba(16,24,43,0.18)]"
          />
        </div>

        {/* Tier ribbon */}
        <div
          className="relative -mt-2 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-extrabold uppercase tracking-[0.18em] text-white ring-2 ring-ink-900 shadow-paper-sm"
          style={{ backgroundColor: tier.color }}
        >
          <span className="text-[10px] opacity-80">{tier.eyebrow}</span>
          <span>· {tier.name}</span>
        </div>

        {/* XP progress to next tier */}
        <div className="mt-4 w-full max-w-sm">
          <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wider text-ink-500">
            <span>
              {next ? `${tier.name} → ${next.name}` : 'Max tier reached'}
            </span>
            <span className="tabular-nums text-ink-700">
              {next
                ? `${intoLevel.toLocaleString()} / ${nextLevelAt.toLocaleString()} XP`
                : `${xp.toLocaleString()} XP`}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-cream-200 ring-2 ring-ink-900">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${next ? percent : 100}%`,
                background: next
                  ? `linear-gradient(90deg, ${tier.color}, ${tier.accent})`
                  : 'linear-gradient(90deg, #E8B12A, #E07E2E, #DB4646)',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 12px ${tier.color}${alphaHex(
                  0.4,
                )}`,
              }}
            />
          </div>
          <p className="mt-2 text-center text-xs italic text-ink-500">
            {next && closeToTierUp
              ? `Almost there — ${(nextLevelAt - intoLevel).toLocaleString()} XP to ${next.name}`
              : tier.blurb}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  TIER LADDER STRIP
// ---------------------------------------------------------------------------
//
// Six little portraits in a row, with the current one highlighted. Gives the
// player a forward-looking sense of "where am I in the journey". Each tier
// they've already passed reads as "unlocked" (full colour); the current one
// pulses with its aura; future ones are dim silhouettes.

export function TierLadder({
  level,
  gender = 'm',
  className = '',
}: {
  level: number;
  gender?: Gender;
  className?: string;
}) {
  const current = Math.max(1, Math.min(MAX_TIER, level));
  return (
    <ol
      className={`flex items-end justify-between gap-2 ${className}`}
      aria-label="Tier progression"
    >
      {allTiers().map((t) => {
        const reached = t.tier <= current;
        const isCurrent = t.tier === current;
        const portrait = portraitFor(t.tier, gender);
        return (
          <li
            key={t.tier}
            className="flex flex-1 flex-col items-center gap-1.5"
            title={`${t.eyebrow} · ${t.name}`}
          >
            <div
              className={`relative aspect-square w-full max-w-[64px] overflow-hidden rounded-2xl ring-2 transition ${
                isCurrent ? 'animate-tierGlow' : ''
              }`}
              style={{
                boxShadow: isCurrent
                  ? `0 0 18px ${t.color}${alphaHex(0.6)}`
                  : undefined,
                backgroundImage: `linear-gradient(180deg, ${t.color}${alphaHex(
                  reached ? 0.18 : 0.04,
                )}, ${t.color}${alphaHex(reached ? 0.05 : 0.02)}), url(${portrait})`,
                backgroundSize: 'auto 100%, auto 200%',
                backgroundPosition: 'center, 50% 6%',
                backgroundRepeat: 'no-repeat, no-repeat',
                backgroundColor: reached ? undefined : '#F0E5C0',
                borderColor: reached ? t.color : 'rgba(16,24,43,0.18)',
                opacity: reached ? 1 : 0.55,
                filter: reached ? 'none' : 'grayscale(0.85)',
              }}
            />
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isCurrent ? 'text-ink-900' : 'text-ink-500'
              }`}
            >
              {t.name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Pads a 0..1 alpha into the two-hex suffix used by #RRGGBBAA literals. */
function alphaHex(alpha: number): string {
  const v = Math.max(0, Math.min(1, alpha));
  const n = Math.round(v * 255)
    .toString(16)
    .padStart(2, '0');
  return n;
}
