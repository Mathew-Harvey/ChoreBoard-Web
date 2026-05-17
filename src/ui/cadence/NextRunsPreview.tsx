import { useMemo } from 'react';
import type { Cadence } from '../../lib/types';
import { cadenceLooksComplete, getUpcomingOccurrences } from '../../lib/cadence';
import { formatClock, formatShortDate, useFamilyClock } from '../../lib/time';

/**
 * Live "Next N runs" preview shown under the cadence picker. Reads the
 * server-anchored `board.now` from the family clock so the preview matches
 * what the scheduler will actually materialize, and formats every row in
 * the family timezone (not the viewer's browser TZ).
 */
export function NextRunsPreview({
  cadence,
  timezone,
  count = 5,
}: {
  cadence: Cadence;
  /** Family IANA timezone. */
  timezone: string;
  /** How many upcoming runs to render. */
  count?: number;
}) {
  const { now, ready } = useFamilyClock();
  const occurrences = useMemo(
    () => getUpcomingOccurrences(cadence, timezone, count, now),
    [cadence, timezone, count, now],
  );
  const complete = cadenceLooksComplete(cadence);

  return (
    <div className="rounded-xl bg-cream-100 p-3 ring-1 ring-ink-900/10 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Next {count} runs
        </span>
        {!ready && (
          <span
            className="text-[10px] text-ink-500"
            title="Using browser clock while the board loads — refresh after sign-in for server-anchored times."
          >
            (browser clock)
          </span>
        )}
      </div>
      {!complete ? (
        <p className="text-sm text-ink-500">
          Pick at least one day / time to see when this will run.
        </p>
      ) : occurrences.length === 0 ? (
        <p className="text-sm text-ink-500">
          No upcoming runs in the next few months — double-check the dates.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {occurrences.map((d) => (
            <li
              key={d.toISOString()}
              className="flex items-baseline justify-between gap-3 tabular-nums"
            >
              <span className="font-semibold text-ink-900">
                {formatShortDate(d, timezone)}
              </span>
              <span className="text-ink-700">{formatClock(d, timezone)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
