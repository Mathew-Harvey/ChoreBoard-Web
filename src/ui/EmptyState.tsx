import type { ReactNode } from 'react';

type Illustration =
  | 'available'
  | 'pending'
  | 'completed'
  | 'leaderboard'
  | 'activity'
  | 'budget'
  | 'ledger'
  | 'kids';

/**
 * Friendly empty state with a tiny inline-SVG illustration. Designed to feel
 * like a stamped paper note, not a stock-photo zero-state.
 */
export function EmptyState({
  illustration = 'available',
  title,
  body,
  action,
  tone = 'light',
  compact = false,
}: {
  illustration?: Illustration;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  tone?: 'light' | 'dark';
  compact?: boolean;
}) {
  const txt =
    tone === 'dark'
      ? { strong: 'text-cream-50', soft: 'text-cream-50/60' }
      : { strong: 'text-ink-900', soft: 'text-ink-500' };
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-3 text-center ${
        compact ? 'py-6' : 'py-10'
      }`}
    >
      <EmptyIllustration name={illustration} tone={tone} />
      <div className={`font-display text-base font-extrabold ${txt.strong}`}>{title}</div>
      {body && <div className={`max-w-[280px] text-xs ${txt.soft}`}>{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function EmptyIllustration({ name, tone }: { name: Illustration; tone: 'light' | 'dark' }) {
  const stroke = tone === 'dark' ? '#FBF6E6' : '#10182B';
  const fill = tone === 'dark' ? 'rgba(251,246,230,0.10)' : '#FBFAF4';
  const accent =
    name === 'completed'
      ? '#0F6E37'
      : name === 'pending'
        ? '#E07E2E'
        : name === 'leaderboard'
          ? '#E8B12A'
          : name === 'budget'
            ? '#3253D7'
            : name === 'kids'
              ? '#E25CA6'
              : name === 'ledger'
                ? '#22A8A8'
                : name === 'activity'
                  ? '#8B5BD9'
                  : '#3CA163';
  return (
    <svg
      width="68"
      height="56"
      viewBox="0 0 80 64"
      aria-hidden
      className="drop-shadow-[2px_2px_0_rgba(16,24,43,0.9)]"
    >
      {/* Paper card backing — same chunky border treatment used everywhere. */}
      <rect
        x="4"
        y="6"
        width="64"
        height="48"
        rx="8"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.5"
      />
      <rect
        x="10"
        y="2"
        width="60"
        height="48"
        rx="8"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.5"
        transform="rotate(-3 40 26)"
      />
      {/* Glyph specific to the empty state. */}
      <g transform="translate(40 28)">
        {name === 'available' && (
          <g>
            <circle cx="0" cy="0" r="11" fill={accent} stroke={stroke} strokeWidth="2" />
            <path
              d="M-5 0 L-1 4 L6 -4"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        )}
        {name === 'pending' && (
          <g>
            <circle cx="0" cy="0" r="11" fill={accent} stroke={stroke} strokeWidth="2" />
            <path
              d="M0 -6 V1 L4 4"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        )}
        {name === 'completed' && (
          <g>
            <rect
              x="-12"
              y="-9"
              width="24"
              height="18"
              rx="3"
              fill={accent}
              stroke={stroke}
              strokeWidth="2"
            />
            <path
              d="M-7 0 L-2 5 L8 -5"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        )}
        {name === 'leaderboard' && (
          <g>
            <rect x="-12" y="-2" width="6" height="10" fill={accent} stroke={stroke} strokeWidth="2" />
            <rect x="-3" y="-7" width="6" height="15" fill={accent} stroke={stroke} strokeWidth="2" />
            <rect x="6" y="0" width="6" height="8" fill={accent} stroke={stroke} strokeWidth="2" />
          </g>
        )}
        {name === 'activity' && (
          <g fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-12 4 L-4 -2 L2 2 L12 -6" />
            <circle cx="12" cy="-6" r="2" fill={accent} />
          </g>
        )}
        {name === 'budget' && (
          <g>
            <circle cx="0" cy="0" r="11" fill={accent} stroke={stroke} strokeWidth="2" />
            <text
              x="0"
              y="4"
              textAnchor="middle"
              fontSize="14"
              fontWeight="800"
              fill="#fff"
              fontFamily="system-ui, sans-serif"
            >
              $
            </text>
          </g>
        )}
        {name === 'ledger' && (
          <g>
            <rect x="-12" y="-8" width="24" height="16" rx="2" fill={accent} stroke={stroke} strokeWidth="2" />
            <line x1="-8" y1="-3" x2="8" y2="-3" stroke="#fff" strokeWidth="1.5" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#fff" strokeWidth="1.5" />
            <line x1="-8" y1="3" x2="2" y2="3" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
        {name === 'kids' && (
          <g>
            <circle cx="-6" cy="-2" r="6" fill={accent} stroke={stroke} strokeWidth="2" />
            <circle cx="7" cy="2" r="5" fill="#fff" stroke={stroke} strokeWidth="2" />
          </g>
        )}
      </g>
    </svg>
  );
}
