import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Milestone } from '../lib/types';
import { money, relativePast } from '../lib/format';
import { useSession } from '../lib/session';
import { celebrate } from '../lib/celebrate';
import { toastError, toastSuccess } from './Toast';

type HitEvt = {
  milestoneId: string | null;
  hitId: string | null;
  scope: 'family' | 'member' | null;
  memberType: 'user' | 'kid' | null;
  memberId: string | null;
  receivedAt: number;
};

/**
 * Listens for `cb:milestone.hit` events on the global SSE channel and pops
 * a celebration overlay with confetti, the reward description, and (for
 * parents) a one-tap "mark delivered" button.
 *
 * Auto-dismisses after 14s or on click. Rendered globally from
 * Desktops.tsx so it fires regardless of which desktop is in view.
 */
export function MilestoneBanner() {
  const [evt, setEvt] = useState<HitEvt | null>(null);
  const session = useSession();
  const isParent = session.data?.kind === 'parent';
  const qc = useQueryClient();
  const [claiming, setClaiming] = useState(false);

  const milestonesQ = useQuery({
    queryKey: ['milestones'],
    queryFn: () =>
      api.get<{ milestones: Milestone[] }>('/api/milestones').then((r) => r.milestones),
    enabled: !!evt,
  });

  useEffect(() => {
    function onHit(e: Event) {
      const ce = e as CustomEvent<Omit<HitEvt, 'receivedAt'>>;
      setEvt({ ...ce.detail, receivedAt: Date.now() });
      // Wide, screen-centred confetti burst regardless of whether the
      // family dashboard is currently the visible desktop.
      celebrate(null, { pieces: 120, spread: 460, durationMs: 2400 });
    }
    window.addEventListener('cb:milestone.hit', onHit as EventListener);
    return () => {
      window.removeEventListener('cb:milestone.hit', onHit as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!evt) return;
    const t = setTimeout(() => setEvt(null), 14_000);
    return () => clearTimeout(t);
  }, [evt]);

  const milestone = useMemo(() => {
    if (!evt || !milestonesQ.data) return null;
    return milestonesQ.data.find((m) => m.id === evt.milestoneId) ?? null;
  }, [evt, milestonesQ.data]);

  if (!evt) return null;

  const handleClaim = async () => {
    if (!evt.hitId) return;
    setClaiming(true);
    try {
      await api.post(`/api/milestones/hits/${evt.hitId}/claim`);
      qc.invalidateQueries({ queryKey: ['milestones'] });
      toastSuccess('Reward delivered ✨');
      setEvt(null);
    } catch (err) {
      if (err instanceof ApiError) toastError('Couldn’t mark delivered', err.message);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm animate-floatIn"
      onClick={() => setEvt(null)}
      role="dialog"
      aria-label="Milestone reached"
    >
      <div
        className="card relative w-full max-w-md p-7 text-center sm:max-w-lg sm:p-9 lg:max-w-xl 2xl:max-w-2xl 2xl:p-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-tag mb-3">REWARD UNLOCKED</div>
        <div
          className="mx-auto grid h-24 w-24 place-items-center rounded-2xl text-6xl ring-2 ring-ink-900 sm:h-28 sm:w-28 sm:text-7xl 2xl:h-36 2xl:w-36 2xl:text-8xl"
          style={{ backgroundColor: 'rgba(15,110,55,0.12)' }}
          aria-hidden
        >
          {milestone?.icon ?? '🎁'}
        </div>
        <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl lg:text-5xl 2xl:text-6xl">
          {milestone?.name ?? 'Milestone reached!'}
        </h2>
        {milestone && (
          <p className="mt-3 text-lg font-extrabold text-money sm:text-xl 2xl:text-2xl">
            🎉 {milestone.reward}
          </p>
        )}
        {milestone && (
          <p className="mt-2 text-sm text-ink-500 sm:text-base">
            {formatHit(milestone)} · just now
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:mt-8 sm:flex-row">
          {isParent && evt.hitId && (
            <button
              className="btn-money flex-1"
              disabled={claiming || !!milestone?.currentHit?.claimedAt}
              onClick={handleClaim}
            >
              {milestone?.currentHit?.claimedAt
                ? '✓ Already delivered'
                : claiming
                  ? 'Marking…'
                  : 'Mark reward delivered'}
            </button>
          )}
          <button className="btn-primary flex-1" onClick={() => setEvt(null)}>
            Onwards
          </button>
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-wider text-ink-400">
          Tap outside to dismiss
        </p>
      </div>
    </div>
  );
}

function formatHit(m: Milestone): string {
  const amount =
    m.metric === 'cents_earned'
      ? money(m.currentHit?.amount ?? m.progress)
      : `${m.currentHit?.amount ?? m.progress} chores`;
  const period =
    m.period === 'lifetime'
      ? 'all-time'
      : m.period === 'month'
        ? new Date(m.periodStart).toLocaleDateString(undefined, { month: 'long' })
        : 'this week';
  const ts = m.currentHit ? relativePast(m.currentHit.hitAt) : '';
  return `${amount} · ${period}${ts ? ` · hit ${ts}` : ''}`;
}
