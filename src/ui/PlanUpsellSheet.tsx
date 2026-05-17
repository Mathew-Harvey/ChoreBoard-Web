import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { money } from '../lib/format';

/**
 * The only paywall surface in ChoreBoard.
 *
 * Triggered two ways:
 *   1. A pre-emptive `dispatch('cb:upsell', { detail: { blockedBy } })` from
 *      AdminFamily (PR 8) when the parent taps "Add a kid" / "Add a parent"
 *      while already at the free-tier cap. The sheet opens BEFORE the
 *      create form, so a parent at the ceiling never fills 30 seconds of
 *      form they can't submit.
 *   2. A 402 `plan_upgrade_required` payload from the server's create
 *      endpoints when the SPA's entitlement cache was stale. Callers
 *      catch the error and re-emit the same `cb:upsell` event with the
 *      `blockedBy` field from the payload.
 *
 * The sheet is mounted globally (App.tsx, next to ChampionBanner) so it can
 * fire from anywhere without local plumbing. Bottom sheet on phone, centered
 * modal on tablet/desktop, same shape and timing as the rest of the family
 * of modals (240ms ease-out, dismiss-on-backdrop). Every animation respects
 * the global prefers-reduced-motion override in index.css.
 */
export type UpsellTrigger = 'kids_max' | 'parents_max';

type Quote = { headlinePriceCents: number; currency: string };

const COPY: Record<UpsellTrigger, { title: string; body: string }> = {
  kids_max: {
    title: 'Add a third kid',
    body: 'Free families have up to two kids. The Family plan opens the rest — and adds the bits that make day-to-day easier.',
  },
  parents_max: {
    title: 'Add a second parent',
    body: 'Free families have one parent. The Family plan lets you share approvals — and adds the bits that make day-to-day easier.',
  },
};

const BULLETS = [
  'Push notifications to your phone',
  'Full activity history (not just the last 30 days)',
  'Every badge, every level, every streak',
  'CSV export of the ledger',
];

/** Convenience for callers — emit the global event with a typed payload. */
export function requestUpsell(blockedBy: UpsellTrigger): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('cb:upsell', { detail: { blockedBy } }),
  );
}

export function PlanUpsellSheet() {
  const [trigger, setTrigger] = useState<UpsellTrigger | null>(null);

  useEffect(() => {
    const onUpsell = (e: Event) => {
      const ce = e as CustomEvent<{ blockedBy: UpsellTrigger }>;
      if (ce.detail?.blockedBy) setTrigger(ce.detail.blockedBy);
    };
    window.addEventListener('cb:upsell', onUpsell as EventListener);
    return () => window.removeEventListener('cb:upsell', onUpsell as EventListener);
  }, []);

  // Quote loaded eagerly while the sheet is open so the price is the very
  // last thing to swap in (avoids a content-shift flash where the button
  // resizes when the dollars arrive).
  const quote = useQuery({
    queryKey: ['billing-quote'],
    queryFn: () => api.get<Quote>('/api/billing/quote'),
    enabled: trigger !== null,
    staleTime: 5 * 60_000,
  });

  if (!trigger) return null;
  const copy = COPY[trigger];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-ink-900/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={() => setTrigger(null)}
      role="dialog"
      aria-label={copy.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-chunky bg-paper p-6 ring-2 ring-ink-900 shadow-paper sm:rounded-chunky sm:p-7 animate-floatIn"
      >
        <div className="page-tag mb-2">FAMILY PLAN</div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-ink-500 sm:text-base">{copy.body}</p>

        <ul className="mt-5 flex flex-col gap-2">
          {BULLETS.map((b) => (
            <li
              key={b}
              className="flex items-center gap-2 text-sm text-ink-700"
            >
              <span
                aria-hidden
                className="grid h-5 w-5 place-items-center rounded-full bg-money/15 text-xs font-bold text-money"
              >
                ✓
              </span>
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setTrigger(null)}
          >
            Maybe later
          </button>
          <button
            type="button"
            className="btn-money"
            onClick={() => {
              setTrigger(null);
              window.location.href = '/admin/billing';
            }}
            disabled={quote.isLoading}
          >
            {quote.data
              ? `Upgrade — ${money(quote.data.headlinePriceCents)} / mo`
              : 'Upgrade'}
          </button>
        </div>

        <button
          type="button"
          aria-label="Close"
          onClick={() => setTrigger(null)}
          className="absolute right-4 top-4 rounded-full p-1 text-ink-400 hover:bg-ink-900/5 hover:text-ink-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
