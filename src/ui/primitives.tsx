import type { CSSProperties, ReactNode } from 'react';
import type { BoardInstance, InstanceStatus, MemberType } from '../lib/types';
import { money, relativePast } from '../lib/format';

/** The "ChoreBoard" wordmark + tomato/peach logo block from the guide. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims =
    size === 'lg'
      ? { box: 'h-9 w-9 text-base', text: 'text-2xl' }
      : size === 'sm'
        ? { box: 'h-6 w-6 text-[10px]', text: 'text-base' }
        : { box: 'h-7 w-7 text-xs', text: 'text-lg' };
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${dims.box} grid place-items-center rounded-lg bg-accent-orange/85 font-bold text-white shadow-paper-sm ring-2 ring-ink-900`}
        aria-hidden
      >
        <span className="-mt-0.5">ⓒ</span>
      </div>
      <span className={`${dims.text} font-display font-bold tracking-tight text-ink-900`}>
        ChoreBoard
      </span>
    </div>
  );
}

/**
 * Top-right page indicator like `01 — KANBAN / The board` in the style guide.
 */
export function PageTag({ index, label, title }: { index: number; label: string; title: string }) {
  const idx = String(index).padStart(2, '0');
  return (
    <div className="text-right leading-tight">
      <div className="page-tag">
        {idx} — {label}
      </div>
      <div className="page-tag-strong">{title}</div>
    </div>
  );
}

/** Member avatar — colored circle with the member's initial. */
export function MemberAvatar({
  name,
  color,
  size = 'md',
  className = '',
  style,
}: {
  name: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: CSSProperties;
}) {
  const sz =
    size === 'xs'
      ? 'h-6 w-6 text-[10px]'
      : size === 'sm'
        ? 'h-8 w-8 text-xs'
        : size === 'lg'
          ? 'h-14 w-14 text-lg'
          : size === 'xl'
            ? 'h-20 w-20 text-3xl'
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
      return <span className="pill-pending">PENDING</span>;
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
 * with an emoji glyph; falls back to a "tools" glyph.
 */
export function ChoreIcon({ name }: { name: string }) {
  const glyph = chooseGlyph(name);
  return (
    <div
      aria-hidden
      className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-cream-200 text-base ring-1 ring-ink-900/15"
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

/** Layout helper: title row used on every desktop. */
export function DesktopTitle({
  date,
  title,
  subtitle,
  right,
}: {
  date?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {date && <div className="page-tag mb-1">{date}</div>}
        <h1 className="font-display text-3xl font-extrabold leading-none tracking-tight text-ink-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {right}
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
  height?: 'sm' | 'md' | 'lg';
}) {
  const h = height === 'sm' ? 'h-2' : height === 'lg' ? 'h-4' : 'h-3';
  return (
    <div
      className={`${h} w-full overflow-hidden rounded-full bg-cream-200 ring-2 ring-ink-900`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          backgroundColor: color ?? '#0F6E37',
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
  return <span className="text-xs text-ink-500">due {due.toLocaleDateString(undefined, { weekday: 'short' })} {clockShort(due)}</span>;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clockShort(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });
}

export type MemberLookup = {
  byKey: (type: MemberType, id: string) => { name: string; color?: string } | undefined;
};

export function buildMemberLookup(
  kids: Array<{ id: string; name: string; color?: string }>,
  parents: Array<{ id: string; name: string }>,
): MemberLookup {
  const map = new Map<string, { name: string; color?: string }>();
  kids.forEach((k) => map.set(`kid:${k.id}`, { name: k.name, color: k.color }));
  parents.forEach((u) => map.set(`user:${u.id}`, { name: u.name }));
  return {
    byKey: (type, id) => map.get(`${type}:${id}`),
  };
}

/** Big "$45.50" headline used on the Family dashboard. */
export function MoneyHeadline({ amountCents }: { amountCents: number }) {
  return (
    <div className="font-display text-7xl font-extrabold tracking-tight text-money sm:text-8xl">
      {money(amountCents)}
    </div>
  );
}
