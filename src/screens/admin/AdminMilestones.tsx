import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type {
  Kid,
  Milestone,
  MilestoneMetric,
  MilestonePeriod,
  MilestoneScope,
  Parent,
} from '../../lib/types';
import { money, relativePast } from '../../lib/format';
import { MemberAvatar, ProgressBar } from '../../ui/primitives';
import { toastError, toastSuccess } from '../../ui/Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

const COMMON_ICONS = ['🍕', '🍦', '🍩', '🍿', '🎬', '🎮', '🎁', '🌳', '🏖️', '🎢', '🦄', '⭐', '🏆', '🍔', '🛝'];

type MemberLite = { type: 'user' | 'kid'; id: string; name: string; color?: string };

export function AdminMilestones() {
  const qc = useQueryClient();
  const milestones = useQuery({
    queryKey: ['milestones'],
    queryFn: () =>
      api.get<{ milestones: Milestone[] }>('/api/milestones').then((r) => r.milestones),
  });
  const family = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ parents: Parent[]; kids: Kid[] }>('/api/family'),
  });

  const members: MemberLite[] = useMemo(() => {
    const out: MemberLite[] = [];
    for (const k of family.data?.kids ?? [])
      out.push({ type: 'kid', id: k.id, name: k.name, color: k.color });
    for (const u of family.data?.parents ?? [])
      out.push({ type: 'user', id: u.id, name: u.name });
    return out;
  }, [family.data]);

  const [editing, setEditing] = useState<Milestone | null>(null);
  const [creating, setCreating] = useState(false);

  const save = useMutation({
    mutationFn: async (body: any) => {
      if (body.id) {
        const { id, ...rest } = body;
        return api.patch(`/api/milestones/${id}`, rest);
      }
      return api.post('/api/milestones', body);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['milestones'] });
      setEditing(null);
      setCreating(false);
      toastSuccess(vars.id ? 'Milestone updated' : 'Milestone added', vars.name);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t save milestone', err.message);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/milestones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones'] });
      toastSuccess('Milestone archived');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t archive', err.message);
    },
  });
  const claim = useMutation({
    mutationFn: ({ hitId, claimed }: { hitId: string; claimed: boolean }) =>
      api.post(`/api/milestones/hits/${hitId}/${claimed ? 'unclaim' : 'claim'}`),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['milestones'] });
      qc.invalidateQueries({ queryKey: ['family-milestones'] });
      toastSuccess(vars.claimed ? 'Marked outstanding' : 'Reward delivered');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t update', err.message);
    },
  });

  const sorted = useMemo(
    () =>
      (milestones.data ?? []).slice().sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.archivedAt && !b.archivedAt) return 1;
        if (!a.archivedAt && b.archivedAt) return -1;
        return a.name.localeCompare(b.name);
      }),
    [milestones.data],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-tag mb-1">REWARDS</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Milestones &amp; rewards
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-500 sm:text-base">
            Set a target the family — or one kid — has to hit, and tell the app
            what reward you’re putting up. We’ll track progress and ping you the
            moment it’s earned. Repeating milestones reset every week or month.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + New milestone
        </button>
      </div>

      {milestones.isLoading && <p className="text-ink-500">Loading…</p>}
      {milestones.data && sorted.length === 0 && (
        <EmptyHint onCreate={() => setCreating(true)} />
      )}

      <ul className="flex flex-col gap-4">
        {sorted.map((m) => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            members={members}
            onEdit={() => setEditing(m)}
            onArchive={() => {
              if (
                confirm(
                  `Archive "${m.name}"? Past hits stay in the history but it stops counting going forward.`,
                )
              )
                del.mutate(m.id);
            }}
            onTogglePause={() => save.mutate({ id: m.id, active: !m.active })}
            onClaim={(hitId, claimed) => claim.mutate({ hitId, claimed })}
            isClaiming={claim.isPending}
          />
        ))}
      </ul>

      {(editing || creating) && (
        <MilestoneEditor
          milestone={editing}
          members={members}
          onSave={(payload) => save.mutate(payload)}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          isSaving={save.isPending}
          serverError={save.error instanceof ApiError ? save.error.message : null}
        />
      )}
    </div>
  );
}

function EmptyHint({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6 sm:p-8">
      <span className="text-4xl" aria-hidden>
        🍕
      </span>
      <h3 className="font-display text-xl font-extrabold sm:text-2xl">
        No milestones yet
      </h3>
      <p className="max-w-prose text-sm text-ink-700 sm:text-base">
        Try “Family hits $50 this week → pizza night out”, or “Skye does 20
        chores in March → pick the weekend movie”. The kids will see the
        progress bar tick up on the family dashboard, and we’ll ping you the
        moment a reward is unlocked.
      </p>
      <button className="btn-primary" onClick={onCreate}>
        + Set your first milestone
      </button>
    </div>
  );
}

function MilestoneCard({
  milestone,
  members,
  onEdit,
  onArchive,
  onTogglePause,
  onClaim,
  isClaiming,
}: {
  milestone: Milestone;
  members: MemberLite[];
  onEdit: () => void;
  onArchive: () => void;
  onTogglePause: () => void;
  onClaim: (hitId: string, claimed: boolean) => void;
  isClaiming: boolean;
}) {
  const member =
    milestone.scope === 'member'
      ? members.find(
          (m) => m.type === milestone.memberType && m.id === milestone.memberId,
        ) ?? null
      : null;
  const accent = member?.color ?? '#3253D7';
  const archived = !!milestone.archivedAt;

  return (
    <li
      className={`card overflow-hidden p-5 sm:p-6 ${
        archived ? 'opacity-60' : ''
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl text-2xl ring-2 ring-ink-900 sm:h-14 sm:w-14"
            style={{ backgroundColor: hexAlpha(accent, 0.18) }}
            aria-hidden
          >
            {milestone.icon ?? '🎁'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
                {milestone.name}
              </h3>
              {!milestone.active && !archived && <span className="pill">paused</span>}
              {archived && <span className="pill">archived</span>}
              {milestone.unclaimedHitCount > 0 && (
                <span className="pill bg-accent-orange text-white">
                  {milestone.unclaimedHitCount} unclaimed
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-700 sm:text-base">
              <span className="font-semibold">Reward:</span> {milestone.reward}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 sm:text-sm">
              <span>{describeMilestone(milestone)}</span>
              {member && (
                <span className="inline-flex items-center gap-1.5">
                  <MemberAvatar
                    name={member.name}
                    color={member.color}
                    size="xs"
                    className="!h-5 !w-5 !text-[10px] !ring-1"
                  />
                  for {member.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2 sm:flex-nowrap">
          <button className="btn-secondary" onClick={onEdit}>
            Edit
          </button>
          <button className="btn-ghost" onClick={onTogglePause}>
            {milestone.active ? 'Pause' : 'Resume'}
          </button>
          <button className="btn-danger" onClick={onArchive}>
            Archive
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between text-xs text-ink-500 sm:text-sm">
          <span>
            {periodLabel(milestone.period, milestone.periodStart)} progress
          </span>
          <span className="tabular-nums">
            {formatMetric(milestone.metric, milestone.progress)} /{' '}
            <span className="text-ink-700">
              {formatMetric(milestone.metric, milestone.targetValue)}
            </span>
          </span>
        </div>
        <ProgressBar
          percent={milestone.percent}
          color={milestone.hitThisPeriod ? '#0F6E37' : accent}
          height="lg"
        />
        {milestone.hitThisPeriod && milestone.currentHit && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-money/10 p-3 ring-2 ring-money/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-bold text-money">🎉 Reward unlocked!</span>
              <span className="text-ink-700">
                {' '}
                · hit {relativePast(milestone.currentHit.hitAt)}
              </span>
            </div>
            <button
              className={
                milestone.currentHit.claimedAt ? 'btn-secondary' : 'btn-money'
              }
              disabled={isClaiming}
              onClick={() =>
                onClaim(milestone.currentHit!.id, !!milestone.currentHit!.claimedAt)
              }
            >
              {milestone.currentHit.claimedAt
                ? 'Mark outstanding'
                : 'Mark reward delivered'}
            </button>
          </div>
        )}
      </div>

      {milestone.recentHits.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer select-none font-semibold text-ink-700">
            Reward history ({milestone.recentHits.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y-2 divide-cream-200 rounded-xl bg-cream-50 px-3 py-1 ring-2 ring-ink-900">
            {milestone.recentHits.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {new Date(h.periodStart).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    <span className="ml-1.5 text-ink-500">
                      · {formatMetric(milestone.metric, h.amount)}
                    </span>
                  </div>
                  <div className="text-xs text-ink-500">
                    {h.claimedAt
                      ? `Delivered ${relativePast(h.claimedAt)}`
                      : 'Outstanding · reward not yet given'}
                  </div>
                </div>
                <button
                  className={h.claimedAt ? 'btn-ghost' : 'btn-money'}
                  disabled={isClaiming}
                  onClick={() => onClaim(h.id, !!h.claimedAt)}
                >
                  {h.claimedAt ? 'Undo' : 'Mark delivered'}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function MilestoneEditor({
  milestone,
  members,
  onSave,
  onCancel,
  isSaving,
  serverError,
}: {
  milestone: Milestone | null;
  members: MemberLite[];
  onSave: (body: any) => void;
  onCancel: () => void;
  isSaving: boolean;
  serverError: string | null;
}) {
  const [name, setName] = useState(milestone?.name ?? '');
  const [reward, setReward] = useState(milestone?.reward ?? '');
  const [icon, setIcon] = useState<string | null>(milestone?.icon ?? '🍕');
  const [scope, setScope] = useState<MilestoneScope>(milestone?.scope ?? 'family');
  const [memberKey, setMemberKey] = useState<string>(
    milestone && milestone.memberType && milestone.memberId
      ? `${milestone.memberType}:${milestone.memberId}`
      : members[0]
        ? `${members[0].type}:${members[0].id}`
        : '',
  );
  const [metric, setMetric] = useState<MilestoneMetric>(
    milestone?.metric ?? 'cents_earned',
  );
  const [period, setPeriod] = useState<MilestonePeriod>(milestone?.period ?? 'week');
  const [targetInput, setTargetInput] = useState(() => {
    if (!milestone) return metric === 'cents_earned' ? '50.00' : '20';
    return milestone.metric === 'cents_earned'
      ? (milestone.targetValue / 100).toFixed(2)
      : String(milestone.targetValue);
  });
  const [repeats, setRepeats] = useState(milestone?.repeats ?? true);
  const [active, setActive] = useState(milestone?.active ?? true);

  const targetValue = parseTarget(targetInput, metric);
  const nameValid = name.trim().length > 0;
  const rewardValid = reward.trim().length > 0;
  const memberValid =
    scope !== 'member' ||
    (memberKey && members.some((m) => `${m.type}:${m.id}` === memberKey));
  const formValid =
    nameValid && rewardValid && targetValue !== null && targetValue > 0 && memberValid;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-chunky">
        <header className="flex items-baseline justify-between border-b-2 border-cream-200 p-5 pb-4 sm:p-6 sm:pb-4">
          <div>
            <div className="page-tag mb-1">MILESTONE</div>
            <h3 className="font-display text-2xl font-extrabold tracking-tight">
              {milestone ? 'Edit milestone' : 'New milestone'}
            </h3>
          </div>
          <button className="pill-tap" onClick={onCancel}>
            Cancel
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
          <Field label="Name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pizza night week"
              autoFocus
            />
          </Field>

          <Field
            label="Reward"
            hint="What does the family / kid actually get?"
          >
            <textarea
              className="input min-h-[72px]"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. Pizza night out as a family"
              maxLength={280}
            />
          </Field>

          <Field label="Icon">
            <div className="flex flex-wrap items-center gap-2">
              {COMMON_ICONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setIcon(g)}
                  className={`grid h-10 w-10 place-items-center rounded-lg text-xl ring-2 ring-ink-900 transition ${
                    icon === g
                      ? 'bg-accent-yellow/30 shadow-paper-sm'
                      : 'bg-paper hover:bg-cream-50'
                  }`}
                  aria-pressed={icon === g}
                  aria-label={`Icon ${g}`}
                >
                  {g}
                </button>
              ))}
              <input
                className="input w-24"
                value={icon ?? ''}
                onChange={(e) => setIcon(e.target.value.slice(0, 4) || null)}
                placeholder="other"
                aria-label="Custom emoji"
              />
            </div>
          </Field>

          <Field label="Who has to hit it?">
            <div className="flex gap-2">
              <ChoiceButton
                active={scope === 'family'}
                onClick={() => setScope('family')}
              >
                👪 Whole family
              </ChoiceButton>
              <ChoiceButton
                active={scope === 'member'}
                onClick={() => setScope('member')}
                disabled={members.length === 0}
              >
                👤 One member
              </ChoiceButton>
            </div>
            {scope === 'member' && members.length > 0 && (
              <select
                className="input mt-2"
                value={memberKey}
                onChange={(e) => setMemberKey(e.target.value)}
              >
                {members.map((m) => (
                  <option key={`${m.type}:${m.id}`} value={`${m.type}:${m.id}`}>
                    {m.name} ({m.type === 'kid' ? 'kid' : 'parent'})
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Measure">
              <select
                className="input"
                value={metric}
                onChange={(e) => {
                  const next = e.target.value as MilestoneMetric;
                  setMetric(next);
                  setTargetInput(next === 'cents_earned' ? '50.00' : '20');
                }}
              >
                <option value="cents_earned">$ earned</option>
                <option value="chores_completed">Chores completed</option>
              </select>
            </Field>
            <Field label="Window">
              <select
                className="input"
                value={period}
                onChange={(e) => setPeriod(e.target.value as MilestonePeriod)}
              >
                <option value="week">This week (resets each payout)</option>
                <option value="month">This month (resets on the 1st)</option>
                <option value="lifetime">Lifetime (one-shot)</option>
              </select>
            </Field>
          </div>

          <Field
            label={metric === 'cents_earned' ? 'Target (AUD)' : 'Target chores'}
            error={
              targetValue === null && targetInput !== ''
                ? metric === 'cents_earned'
                  ? 'Enter an amount like 50.00'
                  : 'Enter a whole number, e.g. 20'
                : null
            }
          >
            <input
              className="input"
              inputMode={metric === 'cents_earned' ? 'decimal' : 'numeric'}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink-900"
                checked={repeats}
                onChange={(e) => setRepeats(e.target.checked)}
                disabled={period === 'lifetime'}
                title={
                  period === 'lifetime'
                    ? 'Lifetime milestones can only fire once.'
                    : ''
                }
              />
              Resets &amp; can be earned again next {period === 'month' ? 'month' : 'week'}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink-900"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          {serverError && (
            <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
              {serverError === 'member_not_found'
                ? 'That member is no longer in the family.'
                : serverError === 'member_required'
                  ? 'Pick a family member for member-scope milestones.'
                  : serverError}
            </p>
          )}
        </div>

        <footer className="safe-pb sticky bottom-0 flex gap-2 border-t-2 border-cream-200 bg-paper p-4 sm:p-5">
          <button className="btn-secondary flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            disabled={!formValid || isSaving}
            onClick={() => {
              if (!formValid || targetValue === null) return;
              const member = scope === 'member' ? splitMemberKey(memberKey) : null;
              onSave({
                id: milestone?.id,
                name: name.trim(),
                reward: reward.trim(),
                icon: icon || null,
                scope,
                memberType: member?.type ?? null,
                memberId: member?.id ?? null,
                metric,
                period,
                targetValue,
                repeats: period === 'lifetime' ? false : repeats,
                active,
              });
            }}
          >
            {isSaving ? 'Saving…' : milestone ? 'Save changes' : 'Add milestone'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold ring-2 ring-ink-900 transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
          : 'bg-paper text-ink-700 hover:bg-cream-50'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {hint && <span className="-mt-1 text-xs text-ink-500">{hint}</span>}
      {children}
      {error && <span className="text-xs text-accent-red">{error}</span>}
    </label>
  );
}

function parseTarget(input: string, metric: MilestoneMetric): number | null {
  const t = input.trim();
  if (!t) return null;
  if (metric === 'cents_earned') {
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    const cents = Math.round(parseFloat(t) * 100);
    return Number.isFinite(cents) && cents > 0 ? cents : null;
  }
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function splitMemberKey(key: string): { type: 'user' | 'kid'; id: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const type = key.slice(0, idx);
  const id = key.slice(idx + 1);
  if (type !== 'user' && type !== 'kid') return null;
  if (!id) return null;
  return { type, id };
}

export function describeMilestone(m: Milestone): string {
  const target = formatMetric(m.metric, m.targetValue);
  const periodPhrase =
    m.period === 'week'
      ? m.repeats
        ? 'each week'
        : 'in a single week'
      : m.period === 'month'
        ? m.repeats
          ? 'each month'
          : 'in a single month'
        : 'lifetime';
  const metricPhrase =
    m.metric === 'cents_earned' ? 'earned' : 'chores completed';
  return `${target} ${metricPhrase} · ${periodPhrase}`;
}

export function formatMetric(metric: MilestoneMetric, value: number): string {
  if (metric === 'cents_earned') return money(value);
  return `${value} ${value === 1 ? 'chore' : 'chores'}`;
}

export function periodLabel(period: MilestonePeriod, periodStartIso: string): string {
  if (period === 'lifetime') return 'Lifetime';
  const d = new Date(periodStartIso);
  if (period === 'week') return 'This week';
  return d.toLocaleDateString(undefined, { month: 'long' });
}

function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(91,96,114,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
