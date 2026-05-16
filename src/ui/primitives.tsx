import type { CSSProperties, ReactNode } from 'react';
import type { BoardInstance, InstanceStatus, MemberType, StatedGender } from '../lib/types';
import { money, relativePast } from '../lib/format';
import { resolveDisplayGender, type Gender } from '../lib/levelTier';
import { TierAvatar } from './LevelAvatar';

/** The "ChoreBoard" wordmark + tile logo block from the guide. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const dims =
    size === 'xl'
      ? { box: 'h-11 w-11 text-lg', text: 'text-3xl' }
      : size === 'lg'
        ? { box: 'h-9 w-9 text-base', text: 'text-2xl' }
        : size === 'sm'
          ? { box: 'h-6 w-6 text-[10px]', text: 'text-base' }
          : { box: 'h-7 w-7 text-xs', text: 'text-lg' };
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${dims.box} grid place-items-center rounded-lg bg-accent-orange font-extrabold text-white shadow-paper-sm ring-2 ring-ink-900`}
        aria-hidden
      >
        <span className="-mt-px leading-none">C</span>
      </div>
      <span
        className={`${dims.text} font-display font-extrabold tracking-tight text-ink-900`}
      >
        ChoreBoard
      </span>
    </div>
  );
}

/**
 * Top-right page indicator like `01 — KANBAN / The board` in the style guide.
 * Hidden on small screens (chrome there is condensed).
 */
export function PageTag({
  index,
  label,
  title,
  className = '',
}: {
  index: number;
  label: string;
  title: string;
  className?: string;
}) {
  const idx = String(index).padStart(2, '0');
  return (
    <div className={`hidden text-right leading-tight md:block ${className}`}>
      <div className="page-tag">
        {idx} — {label}
      </div>
      <div className="page-tag-strong">{title}</div>
    </div>
  );
}

/**
 * Member avatar — defaults to the legacy colored-circle-with-initial look,
 * but if a `level` is provided it switches to the tier portrait system
 * (`TierAvatar`). This lets callers opt into the gamification art on a
 * per-call basis without churn for the contexts where the level isn't known
 * (admin lists, identity prompts, etc).
 */
export function MemberAvatar({
  name,
  color,
  size = 'md',
  className = '',
  style,
  level,
  gender,
  showLevelChip,
  glow,
}: {
  name: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  style?: CSSProperties;
  /** When provided, render the tier portrait instead of the initial disc. */
  level?: number | null;
  gender?: Gender;
  showLevelChip?: boolean;
  glow?: boolean;
}) {
  if (level != null) {
    return (
      <TierAvatar
        name={name}
        level={level}
        gender={gender}
        size={size}
        className={className}
        style={style}
        glow={glow}
        showLevelChip={showLevelChip}
      />
    );
  }
  const sz =
    size === 'xs'
      ? 'h-6 w-6 text-[10px]'
      : size === 'sm'
        ? 'h-8 w-8 text-xs'
        : size === 'lg'
          ? 'h-14 w-14 text-lg'
          : size === 'xl'
            ? 'h-20 w-20 text-3xl'
            : size === '2xl'
              ? 'h-28 w-28 text-5xl'
              : size === '3xl'
                ? 'h-40 w-40 text-7xl'
                : 'h-10 w-10 text-sm';
  return (
    <div
      className={`grid place-items-center rounded-full font-bold text-white ring-2 ring-ink-900 shadow-paper-sm ${sz} ${className}`}
      style={{ backgroundColor: color ?? '#5B6072', ...style }}
      aria-label={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Status pill (e.g. AVAILABLE, CLAIMED · SKYE, ✓ APPROVED). */
export function StatusPill({
  status,
  memberName,
  overdue,
  overdueSince,
}: {
  status: InstanceStatus;
  memberName?: string | null;
  overdue?: boolean;
  overdueSince?: string | null;
}) {
  if (overdue) {
    return (
      <span className="pill-overdue">
        OVERDUE{overdueSince ? ` · ${relativePast(overdueSince).replace(' ago', '')}` : ''}
      </span>
    );
  }
  switch (status) {
    case 'available':
      return <span className="pill-available">AVAILABLE</span>;
    case 'claimed':
      return (
        <span className="pill-claimed">
          CLAIMED{memberName ? ` · ${memberName.toUpperCase()}` : ''}
        </span>
      );
    case 'pending':
      return (
        <span className="pill-pending">
          PENDING{memberName ? ` · ${memberName.toUpperCase()}` : ''}
        </span>
      );
    case 'approved':
      return <span className="pill-approved">✓ APPROVED</span>;
    case 'missed':
      return <span className="pill bg-ink-500 text-white">MISSED</span>;
    case 'rejected':
      return <span className="pill bg-accent-red text-white">REJECTED</span>;
  }
}

/**
 * The little leading icon block on each chore card. Color-tinted background
 * with an emoji glyph; falls back to a "tools" glyph. Scales on big screens.
 */
export function ChoreIcon({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const glyph = chooseGlyph(name);
  const sz =
    size === 'sm'
      ? 'h-8 w-8 text-sm'
      : size === 'lg'
        ? 'h-11 w-11 text-lg'
        : 'h-9 w-9 text-base 2xl:h-10 2xl:w-10 2xl:text-lg';
  return (
    <div
      aria-hidden
      data-chore-icon=""
      className={`grid flex-shrink-0 place-items-center rounded-lg bg-cream-200 ring-1 ring-ink-900/15 ${sz}`}
    >
      <span className="leading-none">{glyph}</span>
    </div>
  );
}

function chooseGlyph(n: string): string {
  const k = n.toLowerCase();
  if (k.includes('dish')) return '🍽️';
  if (k.includes('bin') || k.includes('trash') || k.includes('rubbish')) return '🗑️';
  if (k.includes('vacuum')) return '🧹';
  if (k.includes('mop')) return '🪣';
  if (k.includes('bathroom') || k.includes('toilet')) return '🚽';
  if (k.includes('bench') || k.includes('kitchen')) return '🧽';
  if (k.includes('pet')) return '🐾';
  if (k.includes('bed')) return '🛏️';
  if (k.includes('laundry') || k.includes('load')) return '🧺';
  if (k.includes('fridge')) return '🧊';
  if (k.includes('oven')) return '🔥';
  if (k.includes('window')) return '🪟';
  if (k.includes('car')) return '🚗';
  if (k.includes('garage')) return '🧰';
  if (k.includes('sheet')) return '🛌';
  if (k.includes('fan') || k.includes('light')) return '💡';
  return '🧼';
}

/** Layout helper: title row used on every desktop. Responsive on phones.
 *
 * `compact` collapses the title into a single inline row (date · title ·
 * subtitle) so a fit-to-screen desktop (e.g. the Kanban on a kitchen-wall
 * iPad in landscape) doesn't burn 80-100px on a header. The standard
 * stacked layout is unchanged for taller dashboards. */
export function DesktopTitle({
  date,
  title,
  subtitle,
  right,
  compact = false,
}: {
  date?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          {date && (
            <span className="page-tag truncate text-[10px] sm:text-[11px]">
              {date}
            </span>
          )}
          <h1 className="truncate font-display text-xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-2xl 2xl:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <span className="hidden truncate text-xs text-ink-500 sm:inline-block sm:text-sm">
              {subtitle}
            </span>
          )}
        </div>
        {right && (
          <div className="flex flex-shrink-0 items-center justify-end">{right}</div>
        )}
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-col items-stretch gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {date && <div className="page-tag mb-1.5">{date}</div>}
        <h1 className="font-display text-fluid-title font-extrabold text-ink-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm text-ink-500 sm:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex flex-shrink-0 items-end justify-end">{right}</div>}
    </div>
  );
}

/** Chunky progress bar with optional accent color (defaults to money green). */
export function ProgressBar({
  percent,
  color,
  height = 'md',
}: {
  percent: number;
  color?: string;
  height?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const h =
    height === 'sm'
      ? 'h-2'
      : height === 'lg'
        ? 'h-4'
        : height === 'xl'
          ? 'h-5 lg:h-6'
          : 'h-3';
  return (
    <div
      className={`${h} w-full overflow-hidden rounded-full bg-cream-200 ring-2 ring-ink-900`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          backgroundColor: color ?? '#0F6E37',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      />
    </div>
  );
}

/** Money cell on the right of a card. */
export function MoneyCell({ amountCents, dim }: { amountCents: number; dim?: boolean }) {
  return (
    <span className={`money-amt text-base ${dim ? 'opacity-60' : ''}`}>
      {money(amountCents)}
    </span>
  );
}

/**
 * Compact "Due 7am" or "Due tomorrow" hint. We accept either a Date or an
 * ISO string and fall back gracefully if dueAt is null.
 */
export function DueHint({ instance }: { instance: BoardInstance }) {
  const due = instance.dueAt ? new Date(instance.dueAt) : null;
  if (!due) return null;
  const now = new Date();
  const sameDay = sameLocalDay(due, now);
  if (sameDay) {
    return <span className="text-xs text-ink-500">due {clockShort(due)}</span>;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameLocalDay(due, tomorrow)) {
    return <span className="text-xs text-ink-500">due tomorrow {clockShort(due)}</span>;
  }
  return (
    <span className="text-xs text-ink-500">
      due {due.toLocaleDateString(undefined, { weekday: 'short' })} {clockShort(due)}
    </span>
  );
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clockShort(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: d.getMinutes() ? '2-digit' : undefined,
  });
}

export type MemberLookupRow = {
  name: string;
  color?: string;
  /**
   * Render-layer gender, already resolved from the member's stated gender
   * (or deterministically picked for `'unspecified'`/"rather not say"
   * members). Pass straight to `<MemberAvatar gender={…} />`.
   */
  gender: Gender;
};

export type MemberLookup = {
  byKey: (type: MemberType, id: string) => MemberLookupRow | undefined;
};

export function buildMemberLookup(
  kids: Array<{ id: string; name: string; color?: string; gender?: StatedGender | null }>,
  parents: Array<{ id: string; name: string; color?: string; gender?: StatedGender | null }>,
): MemberLookup {
  const map = new Map<string, MemberLookupRow>();
  kids.forEach((k) =>
    map.set(`kid:${k.id}`, {
      name: k.name,
      color: k.color,
      gender: resolveDisplayGender(k.gender, `kid:${k.id}`),
    }),
  );
  parents.forEach((u) =>
    map.set(`user:${u.id}`, {
      name: u.name,
      color: u.color,
      gender: resolveDisplayGender(u.gender, `user:${u.id}`),
    }),
  );
  return {
    byKey: (type, id) => map.get(`${type}:${id}`),
  };
}

/**
 * Three-way gender picker shared by signup / co-parent join / kid + parent
 * admin forms. Backed by `StatedGender`. The "Rather not say" option resolves
 * at render time to a stable alternating m/f portrait via
 * `resolveDisplayGender`, so a member who doesn't state a gender still gets a
 * personal-feeling avatar instead of the same male portrait every time.
 *
 * Renders as a 3-up segmented pill row so it fits comfortably alongside the
 * other text inputs on a sign-up form.
 */
export function GenderPicker({
  value,
  onChange,
  className = '',
  size = 'md',
}: {
  value: StatedGender;
  onChange: (next: StatedGender) => void;
  className?: string;
  /** `'sm'` matches the 32-pixel buttons used inline on kid/parent admin
   *  cards; `'md'` matches the standard auth form inputs. */
  size?: 'sm' | 'md';
}) {
  const options: Array<{ value: StatedGender; label: string }> = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'unspecified', label: 'Rather not say' },
  ];
  const cell =
    size === 'sm'
      ? 'min-h-[32px] px-2.5 py-1 text-[11px]'
      : 'min-h-[40px] px-3 py-2 text-sm';
  return (
    <div
      role="radiogroup"
      aria-label="Gender"
      className={`grid grid-cols-3 gap-1.5 rounded-xl bg-cream-200 p-1 ring-2 ring-ink-900 ${className}`}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`${cell} truncate rounded-lg font-semibold transition ${
              selected
                ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
                : 'text-ink-700 hover:bg-cream-100'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Big "$45.50" headline used on the Family dashboard. Fluid clamp scaling. */
export function MoneyHeadline({ amountCents }: { amountCents: number }) {
  return (
    <div className="font-display text-fluid-money font-extrabold tabular-nums tracking-tight text-money">
      {money(amountCents)}
    </div>
  );
}

/** Section heading used inside cards. */
export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-base font-extrabold tracking-tight text-ink-900 sm:text-lg lg:text-xl">
        {children}
      </h2>
      {right && <div className="text-xs text-ink-500">{right}</div>}
    </header>
  );
}
