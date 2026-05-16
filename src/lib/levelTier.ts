// Visual tier system for member levels.
//
// The backend issues an unbounded 1-based `level` from `levelForXp` (see
// ChoreBoard-Api/src/domain/xp.ts). We map that to one of six visual tiers
// — each tier has its own portrait, palette, name, and aura intensity.
// Anything beyond level 6 is clamped to the top tier so the highest-rank
// art keeps showing while the numerical level continues to climb.
//
// The whole "fitness transformation" arc tells a clear story when the
// portraits are stacked side-by-side:
//   1. Apprentice  — soft, just starting out
//   2. Helper      — visibly fitter, smile of confidence
//   3. Champion    — toned, serious focus
//   4. Hero        — strong, jaw set
//   5. Legend      — battle-ready, pelt of the wolf earned
//   6. Titan       — peak form, sweat of a hundred chores
//
// Image variants are keyed by `gender` so that adding female (or any
// further) art later is just an asset drop + table entry — no consumer
// code changes.

import lvl1Male from '../assets/avatars/lvl1.png';
import lvl2Male from '../assets/avatars/lvl2.png';
import lvl3Male from '../assets/avatars/lvl3.png';
import lvl4Male from '../assets/avatars/lvl4.png';
import lvl5Male from '../assets/avatars/lvl5.png';
import lvl6Male from '../assets/avatars/lvl6.png';
import lvl1Female from '../assets/avatars/lvl1f.png';
import lvl2Female from '../assets/avatars/lvl2f.png';
import lvl3Female from '../assets/avatars/lvl3f.png';
import lvl4Female from '../assets/avatars/lvl4f.png';
import lvl5Female from '../assets/avatars/lvl5f.png';
import lvl6Female from '../assets/avatars/lvl6f.png';

/**
 * Render-layer gender — what the avatar component actually paints. Always
 * `'m'` or `'f'`; "rather not say" is resolved to one of those at render
 * time by `resolveDisplayGender`.
 */
export type Gender = 'm' | 'f';

/**
 * Member-stated gender as stored in the database. `'unspecified'` is the
 * default ("rather not say") and gets a deterministic alternating m/f
 * portrait so the member still feels personally represented.
 */
export type StatedGender = 'male' | 'female' | 'unspecified';

export type Tier = {
  /** 1-based, clamped to MAX_TIER. */
  tier: number;
  /** Friendly title shown on the dashboard. */
  name: string;
  /** Short eyebrow used over the portrait. */
  eyebrow: string;
  /** Hex colour used for the ring, glow, level chip. */
  color: string;
  /** Stronger accent for hover / progress fill. */
  accent: string;
  /** Background wash behind the hero portrait (CSS gradient). */
  pedestal: string;
  /** Aura intensity 0-1, used to scale glow blur + alpha. */
  aura: number;
  /** Whether to animate the aura with a slow pulse. */
  pulse: boolean;
  /** Tagline shown under the title on the dashboard hero. */
  blurb: string;
};

export const MAX_TIER = 6;

const TIERS: Tier[] = [
  {
    tier: 1,
    name: 'Apprentice',
    eyebrow: 'TIER I',
    color: '#7A7F8E',
    accent: '#5B6072',
    pedestal:
      'radial-gradient(ellipse at 50% 95%, rgba(122,127,142,0.35), transparent 60%)',
    aura: 0.25,
    pulse: false,
    blurb: 'Every legend started here. Tap a chore to begin.',
  },
  {
    tier: 2,
    name: 'Helper',
    eyebrow: 'TIER II',
    color: '#3CA163',
    accent: '#0F6E37',
    pedestal:
      'radial-gradient(ellipse at 50% 95%, rgba(60,161,99,0.40), transparent 60%)',
    aura: 0.4,
    pulse: false,
    blurb: 'Getting stronger every week.',
  },
  {
    tier: 3,
    name: 'Champion',
    eyebrow: 'TIER III',
    color: '#E07E2E',
    accent: '#B45A14',
    pedestal:
      'radial-gradient(ellipse at 50% 95%, rgba(224,126,46,0.45), transparent 60%)',
    aura: 0.55,
    pulse: false,
    blurb: 'Built different. The household notices.',
  },
  {
    tier: 4,
    name: 'Hero',
    eyebrow: 'TIER IV',
    color: '#3253D7',
    accent: '#1A33A8',
    pedestal:
      'radial-gradient(ellipse at 50% 95%, rgba(50,83,215,0.50), transparent 65%)',
    aura: 0.7,
    pulse: true,
    blurb: 'Carries the team. Eyes on the prize.',
  },
  {
    tier: 5,
    name: 'Legend',
    eyebrow: 'TIER V',
    color: '#E8B12A',
    accent: '#B5860A',
    pedestal:
      'radial-gradient(ellipse at 50% 95%, rgba(232,177,42,0.55), transparent 70%)',
    aura: 0.85,
    pulse: true,
    blurb: 'The pelt was earned, not given.',
  },
  {
    tier: 6,
    name: 'Titan',
    eyebrow: 'TIER VI',
    color: '#8B5BD9',
    accent: '#5B2EA8',
    pedestal:
      'radial-gradient(ellipse at 50% 95%, rgba(139,91,217,0.65), transparent 75%)',
    aura: 1,
    pulse: true,
    blurb: 'Peak form. Mythic territory.',
  },
];

const PORTRAITS: Record<Gender, string[]> = {
  m: [lvl1Male, lvl2Male, lvl3Male, lvl4Male, lvl5Male, lvl6Male],
  f: [lvl1Female, lvl2Female, lvl3Female, lvl4Female, lvl5Female, lvl6Female],
};

/**
 * Resolve the visual tier for a backend level. Levels ≥ MAX_TIER all share
 * the top portrait but the returned `.tier` is clamped so consumers don't
 * need to repeat the `min(level, 6)` dance.
 */
export function tierForLevel(level: number | undefined | null): Tier {
  const lv = Math.max(1, Math.min(MAX_TIER, level ?? 1));
  return TIERS[lv - 1]!;
}

/** Portrait image URL for a given level + gender. */
export function portraitFor(
  level: number | undefined | null,
  gender: Gender = 'm',
): string {
  const lv = Math.max(1, Math.min(MAX_TIER, level ?? 1));
  const set = PORTRAITS[gender] ?? PORTRAITS.m;
  return set[lv - 1]!;
}

/**
 * The *next* tier, if the user can still progress. Returns null if they're
 * already at MAX_TIER (we keep them happy at the top — no carrot).
 */
export function nextTier(level: number | undefined | null): Tier | null {
  const lv = Math.max(1, Math.min(MAX_TIER, level ?? 1));
  if (lv >= MAX_TIER) return null;
  return TIERS[lv]!;
}

/**
 * Convenience: percent (0-100) of the way through the current level.
 * Accepts the raw fields returned by `/stats/member/...`.
 */
export function tierPercent(intoLevel: number, nextLevelAt: number): number {
  if (!nextLevelAt || nextLevelAt <= 0) return 0;
  return Math.max(0, Math.min(100, (intoLevel / nextLevelAt) * 100));
}

/** Returns true once the member is ≥80% of the way to the next tier. */
export function isCloseToNextTier(intoLevel: number, nextLevelAt: number): boolean {
  return tierPercent(intoLevel, nextLevelAt) >= 80;
}

/** All tiers, ordered ascending. Used by the tier ladder strip. */
export function allTiers(): Tier[] {
  return TIERS.slice();
}

/**
 * Resolve the render-layer gender (`'m'` | `'f'`) for a member.
 *
 * - `'male'` / `'female'` map straight through.
 * - `'unspecified'` (the "rather not say" default) is resolved to a
 *   deterministic m/f pick using a stable hash of the member's id, so a
 *   family of unspecified members ends up with a roughly even mix of male
 *   and female portraits ("then male, then female, then male etc.")
 *   instead of every avatar being identical.
 *
 * The pick is stable per member, so an individual member's portrait
 * doesn't flip on each render — they get the same alternation forever.
 */
export function resolveDisplayGender(
  stated: StatedGender | null | undefined,
  seed: string,
): Gender {
  if (stated === 'male') return 'm';
  if (stated === 'female') return 'f';
  // FNV-1a-ish: cheap, stable, no crypto. Good enough for a 50/50 pick.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0 ? 'm' : 'f';
}
