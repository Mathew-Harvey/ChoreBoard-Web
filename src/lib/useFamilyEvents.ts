import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setSseStatus } from './sseStatus';
import { isNative, resolveApiUrl } from './runtime';
import { getCachedToken } from './sessionToken';

/**
 * Subscribe to /api/events while authenticated and translate server events
 * into TanStack Query invalidations.
 *
 * Each event invalidates the smallest sensible set of queries — but for
 * fan-out events like `week.closed` and `family.updated` we just bust most
 * of the dashboard. The cost is one extra fetch per minute.
 *
 * Transport:
 *   - **Web**: relative URL + `withCredentials` so the cookie is sent.
 *   - **Native**: absolute URL pointing at api.choreboard.io with the
 *     session token passed as `?session=` (EventSource has no API for
 *     custom headers, so Bearer-in-header isn't an option). The server's
 *     auth plugin honours `?session=` only on /api/events.
 */
export function useFamilyEvents(enabled: boolean): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      setSseStatus('closed');
      return;
    }
    const url = buildEventsUrl();
    if (!url) {
      // Native, signed in, but token not yet hydrated. The next render
      // (after `loadStoredToken` resolves) will try again.
      setSseStatus('closed');
      return;
    }
    setSseStatus('connecting');
    const es = new EventSource(url, { withCredentials: !isNative() });

    const inv = (...keys: string[][]) => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key });
    };

    // Track live status. readyState transitions:
    //   0 connecting → 1 open → (server closes or net drops) → 0 connecting again
    //   any unrecoverable error → 2 closed (EventSource never tries again).
    // We poll alongside the native handlers so transient drops are caught.
    es.onopen = () => setSseStatus('open');
    const poll = setInterval(() => {
      if (es.readyState === EventSource.OPEN) setSseStatus('open');
      else if (es.readyState === EventSource.CONNECTING) setSseStatus('connecting');
      else setSseStatus('closed');
    }, 5_000);

    const handlers: Record<string, (raw: any) => void> = {
      'instance.claimed': () => inv(['board']),
      'instance.submitted': () => inv(['board']),
      'instance.approved': () =>
        inv(
          ['board'],
          ['leaderboard'],
          ['member'],
          ['family-stats'],
          ['goals'],
          ['ledger'],
          ['history'],
        ),
      'instance.rejected': () => inv(['board'], ['history']),
      'instance.materialized': () => inv(['board']),
      'instance.missed': () => inv(['board'], ['history']),
      'chore.updated': () => inv(['chores'], ['board']),
      'badge.awarded': () => inv(['member']),
      'goal.hit': () => inv(['goals'], ['member']),
      'goal.updated': () => inv(['goals']),
      'level.up': (data) => {
        inv(['member']);
        // Re-broadcast so <LevelUpCelebrator /> can render a celebration
        // overlay regardless of which desktop is currently visible.
        window.dispatchEvent(
          new CustomEvent('cb:level.up', {
            detail: {
              memberType: data?.memberType ?? null,
              memberId: data?.memberId ?? null,
              level: typeof data?.level === 'number' ? data.level : null,
            },
          }),
        );
      },
      'ledger.paid': () =>
        inv(['ledger'], ['member'], ['leaderboard'], ['goals'], ['history']),
      'family.updated': () =>
        inv(['family'], ['board'], ['leaderboard'], ['chores'], ['history']),
      'milestone.hit': (data) => {
        inv(['milestones']);
        // Re-broadcast for the celebrate-on-hit toast banner; the listener
        // lives in <MilestoneCelebrator /> on Desktops.tsx so it can render
        // confetti regardless of which desktop is currently visible.
        window.dispatchEvent(
          new CustomEvent('cb:milestone.hit', {
            detail: {
              milestoneId: data?.milestoneId ?? null,
              hitId: data?.hitId ?? null,
              scope: data?.scope ?? null,
              memberType: data?.memberType ?? null,
              memberId: data?.memberId ?? null,
            },
          }),
        );
      },
      'milestone.updated': () => inv(['milestones']),
      'milestone.claimed': () => inv(['milestones']),
      'week.closed': (data) => {
        inv(
          ['board'],
          ['leaderboard'],
          ['member'],
          ['family-stats'],
          ['ledger'],
          ['goals'],
          ['history'],
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
      // EventSource auto-reconnects; the readyState poll above will catch
      // the transition.
      if (es.readyState === EventSource.CLOSED) setSseStatus('closed');
      else setSseStatus('connecting');
    };

    return () => {
      clearInterval(poll);
      for (const [name, fn] of listeners) {
        es.removeEventListener(name, fn as EventListener);
      }
      es.close();
      setSseStatus('closed');
    };
  }, [enabled, qc]);
}

function buildEventsUrl(): string | null {
  if (isNative()) {
    const token = getCachedToken();
    if (!token) return null;
    return `${resolveApiUrl('/api/events')}?session=${encodeURIComponent(token)}`;
  }
  return resolveApiUrl('/api/events');
}
