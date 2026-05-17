import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { toastError, toastSuccess } from '../../ui/Toast';

type NotificationPrefs = {
  pushApprovalsRequested: boolean;
  emailApprovalsRequested: boolean;
  pushGoalHit: boolean;
  emailGoalHit: boolean;
  pushChampion: boolean;
  emailChampion: boolean;
  pushWeeklySummary: boolean;
  emailWeeklySummary: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  quietTz: string;
  updatedAt: string;
};

type AllPrefsRow = {
  userId: string;
  userName: string;
  pushApprovalsRequested: boolean;
  emailApprovalsRequested: boolean;
  pushGoalHit: boolean;
  emailGoalHit: boolean;
  pushChampion: boolean;
  emailChampion: boolean;
  pushWeeklySummary: boolean;
  emailWeeklySummary: boolean;
};

const EVENTS: Array<{
  key: 'approvalsRequested' | 'goalHit' | 'champion' | 'weeklySummary';
  label: string;
  hint: string;
}> = [
  {
    key: 'approvalsRequested',
    label: 'A kid asks for approval',
    hint: 'High-frequency event — use quiet hours below if it gets noisy.',
  },
  {
    key: 'goalHit',
    label: 'A goal gets hit',
    hint: 'Rare — fires when a kid crosses a personal $ goal.',
  },
  {
    key: 'champion',
    label: 'Champion of the week',
    hint: 'Once a week, at payout time. Hard to miss.',
  },
  {
    key: 'weeklySummary',
    label: 'Weekly payout summary',
    hint: 'Email digest with the week’s ledger lines.',
  },
];

export function AdminNotifications() {
  const session = useSession();
  const qc = useQueryClient();

  const mine = useQuery({
    queryKey: ['notification-prefs', 'mine'],
    queryFn: () =>
      api.get<{ prefs: NotificationPrefs }>('/api/notifications/prefs').then((r) => r.prefs),
  });

  const all = useQuery({
    queryKey: ['notification-prefs', 'all'],
    queryFn: () =>
      api.get<{ prefs: AllPrefsRow[] }>('/api/notifications/prefs/all').then((r) => r.prefs),
  });

  const patch = useMutation({
    mutationFn: (body: Partial<NotificationPrefs>) =>
      api.patch<{ prefs: NotificationPrefs }>('/api/notifications/prefs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] });
      toastSuccess('Saved');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError("Couldn't save", err.message);
    },
  });

  if (mine.isLoading || !mine.data) {
    return <p className="text-ink-500">Loading…</p>;
  }

  const prefs = mine.data;
  const myUserId = session.data?.kind === 'parent' ? session.data.userId : null;
  const otherParents = (all.data ?? []).filter((p) => p.userId !== myUserId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <div className="page-tag mb-1">SETTINGS</div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Notifications
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-500 sm:text-base">
          Per-parent. Each of you decides which events ping which channel —
          there&apos;s no household-wide override.
        </p>
      </div>

      <section className="card p-5 sm:p-6">
        <h3 className="mb-4 font-display text-xl font-extrabold sm:text-2xl">
          Your notifications
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
                <th className="px-2 pb-3">Event</th>
                <th className="px-2 pb-3 text-center">Push</th>
                <th className="px-2 pb-3 text-center">Email</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((ev) => {
                const pushKey = `push${cap(ev.key)}` as keyof NotificationPrefs;
                const emailKey = `email${cap(ev.key)}` as keyof NotificationPrefs;
                return (
                  <tr key={ev.key} className="border-t border-ink-900/5">
                    <td className="px-2 py-3 align-top">
                      <div className="font-semibold text-ink-900">{ev.label}</div>
                      <div className="mt-0.5 text-xs text-ink-500">{ev.hint}</div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Toggle
                        checked={!!prefs[pushKey]}
                        onChange={(v) => patch.mutate({ [pushKey]: v } as Partial<NotificationPrefs>)}
                        ariaLabel={`${ev.label} · push`}
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Toggle
                        checked={!!prefs[emailKey]}
                        onChange={(v) => patch.mutate({ [emailKey]: v } as Partial<NotificationPrefs>)}
                        ariaLabel={`${ev.label} · email`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="page-tag mb-1.5">QUIET FROM</div>
            <input
              type="time"
              className="input"
              value={prefs.quietStart ?? ''}
              onChange={(e) =>
                patch.mutate({ quietStart: e.target.value || null })
              }
            />
          </div>
          <div>
            <div className="page-tag mb-1.5">UNTIL</div>
            <input
              type="time"
              className="input"
              value={prefs.quietEnd ?? ''}
              onChange={(e) =>
                patch.mutate({ quietEnd: e.target.value || null })
              }
            />
          </div>
          <div>
            <div className="page-tag mb-1.5">TIMEZONE</div>
            <input
              className="input"
              value={prefs.quietTz}
              onChange={(e) => patch.mutate({ quietTz: e.target.value })}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Quiet hours suppress push only — events still fire in-app and your
          email summary still lands. Set both ends; clearing either disables
          quiet hours.
        </p>
      </section>

      {otherParents.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h3 className="mb-1 font-display text-xl font-extrabold sm:text-2xl">
            Other parents
          </h3>
          <p className="mb-4 text-sm text-ink-500">
            Read-only view so you can see who&apos;s on the hook for what.
            Quiet hours are private — you can&apos;t see other parents&apos; quiet windows.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  <th className="px-2 pb-3">Parent</th>
                  {EVENTS.map((ev) => (
                    <th key={ev.key} className="px-2 pb-3 text-center">{shortLabel(ev.key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otherParents.map((row) => (
                  <tr key={row.userId} className="border-t border-ink-900/5">
                    <td className="px-2 py-3 font-semibold text-ink-900">{row.userName}</td>
                    {EVENTS.map((ev) => {
                      const pushKey = `push${cap(ev.key)}` as keyof AllPrefsRow;
                      const emailKey = `email${cap(ev.key)}` as keyof AllPrefsRow;
                      return (
                        <td key={ev.key} className="px-2 py-3 text-center">
                          <ChannelDots
                            push={!!row[pushKey]}
                            email={!!row[emailKey]}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function cap<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}

function shortLabel(key: 'approvalsRequested' | 'goalHit' | 'champion' | 'weeklySummary'): string {
  switch (key) {
    case 'approvalsRequested': return 'Approval';
    case 'goalHit': return 'Goal';
    case 'champion': return 'Champion';
    case 'weeklySummary': return 'Summary';
  }
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full ring-2 ring-ink-900 transition ${
        checked ? 'bg-money' : 'bg-cream-200'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-5 w-5 rounded-full bg-paper shadow-paper-sm transition ${
          checked ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function ChannelDots({ push, email }: { push: boolean; email: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title={push ? 'Push on' : 'Push off'}
        className={`inline-block h-2 w-2 rounded-full ${push ? 'bg-money' : 'bg-ink-300'}`}
      />
      <span
        title={email ? 'Email on' : 'Email off'}
        className={`inline-block h-2 w-2 rounded-full ${email ? 'bg-accent-blue' : 'bg-ink-300'}`}
      />
    </span>
  );
}
