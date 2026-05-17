import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Cadence, Chore, Family, Kid, Parent } from '../../lib/types';
import { money, readableCadence } from '../../lib/format';
import { ChoreIcon } from '../../ui/primitives';
import { CadencePicker, isCadenceValid } from '../../ui/cadence/CadencePicker';
import { toastError, toastSuccess } from '../../ui/Toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function AdminChores() {
  const qc = useQueryClient();
  const chores = useQuery({
    queryKey: ['chores'],
    queryFn: () => api.get<{ chores: Chore[] }>('/api/chores').then((r) => r.chores),
  });
  // The family timezone drives the cadence picker's "Next 5 runs" preview
  // and the formatters underneath it. Loaded lazily — the picker degrades
  // to a browser-clock preview until it lands.
  const familyQ = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ family: Family; parents: Parent[]; kids: Kid[] }>('/api/family'),
    staleTime: 60_000,
  });
  const timezone = familyQ.data?.family.timezone ?? 'UTC';

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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chores'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      setEditing(null);
      setCreating(false);
      toastSuccess(vars.id ? 'Chore updated' : 'Chore added', vars.name);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t save chore', err.message);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/chores/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chores'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      toastSuccess('Chore archived');
    },
  });
  const spawn = useMutation({
    mutationFn: (id: string) => api.post(`/api/chores/${id}/spawn`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      toastSuccess('Added to the board');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t spawn', err.message);
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-tag mb-1">CATALOG</div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Chore catalog
          </h2>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + New chore
        </button>
      </div>

      {chores.isLoading && <p className="text-ink-500">Loading…</p>}

      <ul className="card divide-y-2 divide-cream-200 overflow-hidden">
        {sorted.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <ChoreIcon name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`truncate font-semibold ${
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
                  <span aria-hidden>·</span>
                  <span className="truncate">{readableCadence(c.cadenceJson)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
              <button
                className="btn-money"
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
          timezone={timezone}
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
  timezone,
  onSave,
  onCancel,
  isSaving,
  serverError,
}: {
  chore: Chore | null;
  timezone: string;
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
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-chunky">
        <header className="flex items-baseline justify-between border-b-2 border-cream-200 p-5 pb-4 sm:p-6 sm:pb-4">
          <div>
            <div className="page-tag mb-1">CHORE</div>
            <h3 className="font-display text-2xl font-extrabold tracking-tight">
              {chore ? 'Edit chore' : 'New chore'}
            </h3>
          </div>
          <button className="pill-tap" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 sm:p-6">
          <Labelled label="Name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
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
          <CadencePicker value={cadence} onChange={setCadence} timezone={timezone} />
          {!cadenceValid && (
            <p className="text-sm text-accent-red">
              Add at least one time / day for this cadence.
            </p>
          )}
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink-900"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink-900"
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
        </div>
        <footer className="safe-pb sticky bottom-0 flex gap-2 border-t-2 border-cream-200 bg-paper p-4 sm:p-5">
          <button className="btn-secondary flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
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
            {isSaving ? 'Saving…' : 'Save chore'}
          </button>
        </footer>
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
