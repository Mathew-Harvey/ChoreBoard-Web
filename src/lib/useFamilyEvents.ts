import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribe to /api/events while authenticated and translate server events
 * into TanStack Query invalidations.
 *
 * Each event invalidates the smallest sensible set of queries — but for
 * fan-out events like `week.closed` and `family.updated` we just bust most
 * of the dashboard. The cost is one extra fetch per minute.
 */
export function useFamilyEvents(enabled: boolean): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/events', { withCredentials: true });

    const inv = (...keys: string[][]) => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key });
    };

    const handlers: Record<string, (raw: any) => void> = {
      'instance.claimed': () => inv(['board']),
      'instance.submitted': () => inv(['board']),
      'instance.approved': () => inv(['board'], ['leaderboard'], ['member'], ['family-stats'], ['goals'], ['ledger']),
      'instance.rejected': () => inv(['board']),
      'instance.materialized': () => inv(['board']),
      'instance.missed': () => inv(['board']),
      'chore.updated': () => inv(['chores'], ['board']),
      'badge.awarded': () => inv(['member']),
      'goal.hit': () => inv(['goals'], ['member']),
      'goal.updated': () => inv(['goals']),
      'level.up': () => inv(['member']),
      'ledger.paid': () => inv(['ledger'], ['member'], ['leaderboard'], ['goals']),
      'family.updated': () =>
        inv(['family'], ['board'], ['leaderboard'], ['chores']),
      'week.closed': (data) => {
        inv(
          ['board'],
          ['leaderboard'],
          ['member'],
          ['family-stats'],
          ['ledger'],
          ['goals'],
        );
        // Re-dispatch as a window event so the Champion banner can render
        // without subscribing to SSE directly.
        window.dispatchEvent(
          new CustomEvent('cb:week.closed', {
            detail: {
              weekId: data?.weekId,
              championMemberType: data?.championMemberType ?? null,
              championMemberId: data?.championMemberId ?? null,
              championAmountCents: data?.championAmountCents ?? null,
            },
          }),
        );
      },
    };

    const wrap = (name: string) => (e: MessageEvent) => {
      let data: any = null;
      try {
        data = e.data ? JSON.parse(e.data) : null;
      } catch {
        /* ignore */
      }
      handlers[name]?.(data);
    };

    const eventNames = Object.keys(handlers);
    const listeners = new Map<string, (e: MessageEvent) => void>();
    for (const name of eventNames) {
      const fn = wrap(name);
      listeners.set(name, fn);
      es.addEventListener(name, fn as EventListener);
    }

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };

    return () => {
      for (const [name, fn] of listeners) {
        es.removeEventListener(name, fn as EventListener);
      }
      es.close();
    };
  }, [enabled, qc]);
}
