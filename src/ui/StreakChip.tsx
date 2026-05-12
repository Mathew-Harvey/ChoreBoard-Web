/**
 * Streak chip — the universal "🔥 X" badge that lives wherever a member's
 * name appears in the app. Adapts to the surrounding theme (light vs dark
 * background) and grows on lg displays.
 *
 * Visual rules:
 *   - 0          → renders nothing (component returns null).
 *   - 1..6       → muted flame, 'getting started' feel.
 *   - 7+         → full saturation, the streak feels "real".
 *   - At best    → crown halo on top.
 */
export function StreakChip({
  streak,
  bestStreak,
  size = 'sm',
  tone = 'light',
  className = '',
}: {
  streak: number;
  bestStreak?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark';
  className?: string;
}) {
  if (!streak || streak <= 0) return null;
  const atBest = bestStreak !== undefined && streak >= bestStreak && streak >= 3;
  const hot = streak >= 7;

  const sizing =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-0.5'
      : size === 'sm'
        ? 'px-2 py-0.5 text-xs gap-1'
        : size === 'md'
          ? 'px-2.5 py-1 text-sm gap-1'
          : size === 'lg'
            ? 'px-3 py-1.5 text-base gap-1.5'
            : 'px-4 py-2 text-xl gap-2';

  const baseColor =
    tone === 'dark'
      ? hot
        ? 'bg-accent-orange/30 text-accent-orange ring-accent-orange/50'
        : 'bg-cream-50/10 text-cream-50/75 ring-cream-50/20'
      : hot
        ? 'bg-accent-orange/15 text-accent-orange ring-accent-orange/35'
        : 'bg-ink-900/8 text-ink-700 ring-ink-900/15';

  return (
    <span
      className={`inline-flex items-center rounded-full font-display font-extrabold tabular-nums ring-1 ${sizing} ${baseColor} ${className}`}
      title={atBest ? 'Personal best streak' : `${streak}-day streak`}
      aria-label={`Daily streak ${streak}${atBest ? ' — personal best' : ''}`}
    >
      <span aria-hidden>🔥</span>
      <span>{streak}</span>
      {atBest && (
        <span aria-hidden className="ml-0.5 text-[1.05em] leading-none">
          👑
        </span>
      )}
    </span>
  );
}
