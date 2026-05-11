import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Cadence, Chore } from '../../lib/types';
import { money, readableCadence } from '../../lib/format';
import { ChoreIcon } from '../../ui/primitives';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* eslint-disable @typescript-eslint/no-explicit-any */

export function AdminChores() {
  const qc = useQueryClient();
  const chores = useQuery({
    queryKey: ['chores'],
    queryFn: () => api.get<{ chores: Chore[] }>('/api/chores').then((r) => r.chores),
  });

  const [editing, setEditing] = useState<Chore | null>(null);
  const [creating, setCreating] = useState(false);

  const save = useMutation({
    mutationFn: async (body: any) => {
      if (body.id) {
        const { id, ...rest } = body;
        return api.patch(`/api/chores/${id}`, rest);
      }
      return api.post('/api/chores', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      setEditing(null);
      setCreating(false);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/chores/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] });
      qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
  const spawn = useMutation({
    mutationFn: (id: string) => api.post(`/api/chores/${id}/spawn`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
    },
  });

  const sorted = useMemo(
    () =>
      (chores.data ?? []).slice().sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [chores.data],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="page-tag">CATALOG</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            Chore catalog
          </h2>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + New chore
        </button>
      </div>

      {chores.isLoading && <p className="text-ink-500">Loading…</p>}

      <ul className="card divide-y-2 divide-cream-200">
        {sorted.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
            <ChoreIcon name={c.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`font-semibold ${
                    c.active ? '' : 'text-ink-400 line-through'
                  }`}
                >
                  {c.name}
                </span>
                {!c.active && <span className="pill">archived</span>}
                {c.photoRequired && (
                  <span className="pill bg-accent-blue text-white">📸 photo</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs text-ink-500">
                <span className="money-amt text-sm">{money(c.amountCents)}</span>
                <span>·</span>
                <span>{readableCadence(c.cadenceJson)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-money !py-1.5"
                disabled={!c.active || spawn.isPending}
                title={c.active ? 'Drop one onto the board now' : 'Resume this chore first'}
                onClick={() => spawn.mutate(c.id)}
              >
                + To board
              </button>
              <button className="btn-secondary" onClick={() => setEditing(c)}>
                Edit
              </button>
              <button
                className="btn-ghost"
                onClick={() => save.mutate({ id: c.id, active: !c.active })}
              >
                {c.active ? 'Pause' : 'Resume'}
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm(`Archive "${c.name}"? Past history is preserved.`))
                    del.mutate(c.id);
                }}
              >
                Archive
              </button>
            </div>
          </li>
        ))}
      </ul>

      {(editing || creating) && (
        <ChoreEditor
          chore={editing}
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

function ChoreEditor({
  chore,
  onSave,
  onCancel,
  isSaving,
  serverError,
}: {
  chore: Chore | null;
  onSave: (body: any) => void;
  onCancel: () => void;
  isSaving: boolean;
  serverError: string | null;
}) {
  const [name, setName] = useState(chore?.name ?? '');
  const [amountInput, setAmountInput] = useState(
    ((chore?.amountCents ?? 100) / 100).toFixed(2),
  );
  const [cadence, setCadence] = useState<Cadence>(
    (chore?.cadenceJson as Cadence) ?? { kind: 'daily', times: ['09:00'] },
  );
  const [active, setActive] = useState(chore?.active ?? true);
  const [photoRequired, setPhotoRequired] = useState(chore?.photoRequired ?? false);

  const parsed = parseAmount(amountInput);
  const cadenceValid = isCadenceValid(cadence);
  const nameValid = name.trim().length > 0;
  const formValid = nameValid && parsed.ok && cadenceValid;

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <div className="page-tag">CHORE</div>
            <h3 className="font-display text-2xl font-extrabold tracking-tight">
              {chore ? 'Edit chore' : 'New chore'}
            </h3>
          </div>
          <button className="pill" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <Labelled label="Name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Labelled>
          <Labelled
            label="Amount (AUD)"
            error={!parsed.ok && amountInput !== '' ? 'Enter a valid amount, e.g. 2.50' : null}
          >
            <input
              className="input"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
          </Labelled>
          <CadenceEditor cadence={cadence} onChange={setCadence} />
          {!cadenceValid && (
            <p className="text-sm text-accent-red">
              Add at least one time / day for this cadence.
            </p>
          )}
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={photoRequired}
                onChange={(e) => setPhotoRequired(e.target.checked)}
              />
              Photo evidence required
            </label>
          </div>
          {serverError && (
            <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
              {serverError === 'photo_required'
                ? 'This chore requires a photo before submission.'
                : serverError === 'no_fields'
                  ? 'Nothing to save.'
                  : serverError}
            </p>
          )}
          <button
            className="btn-primary mt-2"
            disabled={!formValid || isSaving}
            onClick={() => {
              if (!formValid) return;
              onSave({
                id: chore?.id,
                name: name.trim(),
                amountCents: parsed.cents,
                cadence,
                active,
                photoRequired,
              });
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseAmount(s: string): { ok: true; cents: number } | { ok: false } {
  const trimmed = s.trim();
  if (!trimmed) return { ok: false };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false };
  const cents = Math.round(parseFloat(trimmed) * 100);
  if (!Number.isFinite(cents) || cents < 0) return { ok: false };
  return { ok: true, cents };
}

function isCadenceValid(c: Cadence): boolean {
  switch (c.kind) {
    case 'daily':
      return c.times.length > 0 && c.times.every((t) => /^\d{2}:\d{2}$/.test(t));
    case 'weekly':
    case 'every_n_weeks':
      return c.days.length > 0 && /^\d{2}:\d{2}$/.test(c.time);
    case 'every_n_days':
      return c.n >= 1 && /^\d{2}:\d{2}$/.test(c.time);
    case 'monthly_dom':
      return c.day >= 1 && c.day <= 31 && /^\d{2}:\d{2}$/.test(c.time);
    case 'monthly_nth':
      return (
        c.nth >= 1 && c.nth <= 5 && c.weekday >= 0 && c.weekday <= 6 && /^\d{2}:\d{2}$/.test(c.time)
      );
  }
}

function CadenceEditor({
  cadence,
  onChange,
}: {
  cadence: Cadence;
  onChange: (c: Cadence) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900">
      <label className="page-tag">CADENCE</label>
      <select
        className="input"
        value={cadence.kind}
        onChange={(e) => onChange(defaultFor(e.target.value as Cadence['kind']))}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly (specific days)</option>
        <option value="every_n_days">Every N days</option>
        <option value="every_n_weeks">Every N weeks (specific days)</option>
        <option value="monthly_dom">Monthly on day-of-month</option>
        <option value="monthly_nth">Monthly on Nth weekday</option>
      </select>

      {cadence.kind === 'daily' && (
        <div>
          <label className="text-xs text-ink-500">Time(s) of day</label>
          <input
            className="input"
            value={cadence.times.join(', ')}
            onChange={(e) =>
              onChange({
                kind: 'daily',
                times: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g. 07:00, 17:00"
          />
        </div>
      )}
      {cadence.kind === 'weekly' && (
        <>
          <DayPicker
            value={cadence.days}
            onChange={(days) => onChange({ kind: 'weekly', days, time: cadence.time })}
          />
          <TimeField
            value={cadence.time}
            onChange={(time) => onChange({ kind: 'weekly', days: cadence.days, time })}
          />
        </>
      )}
      {cadence.kind === 'every_n_days' && (
        <>
          <NField
            label="Every N days"
            value={cadence.n}
            onChange={(n) => onChange({ kind: 'every_n_days', n, time: cadence.time })}
          />
          <TimeField
            value={cadence.time}
            onChange={(time) => onChange({ kind: 'every_n_days', n: cadence.n, time })}
          />
        </>
      )}
      {cadence.kind === 'every_n_weeks' && (
        <>
          <NField
            label="Every N weeks"
            value={cadence.n}
            onChange={(n) =>
              onChange({ kind: 'every_n_weeks', n, days: cadence.days, time: cadence.time })
            }
          />
          <DayPicker
            value={cadence.days}
            onChange={(days) =>
              onChange({ kind: 'every_n_weeks', n: cadence.n, days, time: cadence.time })
            }
          />
          <TimeField
            value={cadence.time}
            onChange={(time) =>
              onChange({ kind: 'every_n_weeks', n: cadence.n, days: cadence.days, time })
            }
          />
        </>
      )}
      {cadence.kind === 'monthly_dom' && (
        <>
          <NField
            label="Day of month"
            value={cadence.day}
            onChange={(day) => onChange({ kind: 'monthly_dom', day, time: cadence.time })}
          />
          <TimeField
            value={cadence.time}
            onChange={(time) => onChange({ kind: 'monthly_dom', day: cadence.day, time })}
          />
        </>
      )}
      {cadence.kind === 'monthly_nth' && (
        <>
          <NField
            label="Nth"
            value={cadence.nth}
            onChange={(nth) =>
              onChange({ kind: 'monthly_nth', nth, weekday: cadence.weekday, time: cadence.time })
            }
          />
          <DayPicker
            single
            value={[cadence.weekday]}
            onChange={(days) => {
              const wd = days[0] ?? 0;
              onChange({ kind: 'monthly_nth', nth: cadence.nth, weekday: wd, time: cadence.time });
            }}
          />
          <TimeField
            value={cadence.time}
            onChange={(time) =>
              onChange({ kind: 'monthly_nth', nth: cadence.nth, weekday: cadence.weekday, time })
            }
          />
        </>
      )}

      <p className="text-xs text-ink-500">{readableCadence(cadence)}</p>
    </div>
  );
}

function defaultFor(k: Cadence['kind']): Cadence {
  switch (k) {
    case 'daily':
      return { kind: 'daily', times: ['09:00'] };
    case 'weekly':
      return { kind: 'weekly', days: [1, 3, 5], time: '09:00' };
    case 'every_n_days':
      return { kind: 'every_n_days', n: 2, time: '09:00' };
    case 'every_n_weeks':
      return { kind: 'every_n_weeks', n: 2, days: [6], time: '10:00' };
    case 'monthly_dom':
      return { kind: 'monthly_dom', day: 1, time: '10:00' };
    case 'monthly_nth':
      return { kind: 'monthly_nth', nth: 1, weekday: 6, time: '10:00' };
  }
}

function DayPicker({
  value,
  onChange,
  single = false,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAYS.map((d, i) => {
        const selected = value.includes(i);
        return (
          <button
            type="button"
            key={d}
            onClick={() => {
              if (single) return onChange([i]);
              onChange(selected ? value.filter((x) => x !== i) : [...value, i].sort());
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-2 ring-ink-900 ${
              selected ? 'bg-ink-900 text-cream-50' : 'bg-paper text-ink-700'
            }`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function TimeField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <input
      type="time"
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Labelled label={label}>
      <input
        className="input"
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
      />
    </Labelled>
  );
}

function Labelled({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {children}
      {error && <span className="text-xs text-accent-red">{error}</span>}
    </label>
  );
}
