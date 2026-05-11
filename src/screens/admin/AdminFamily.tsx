import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Family, Kid, Parent } from '../../lib/types';
import { MemberAvatar } from '../../ui/primitives';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLORS = [
  '#DB4646',
  '#E07E2E',
  '#E8B12A',
  '#84cc16',
  '#3CA163',
  '#22A8A8',
  '#3253D7',
  '#8B5BD9',
  '#E25CA6',
];

/* eslint-disable @typescript-eslint/no-explicit-any */

export function AdminFamily() {
  const qc = useQueryClient();
  const fam = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ family: Family; parents: Parent[]; kids: Kid[] }>('/api/family'),
  });

  const update = useMutation({
    mutationFn: (body: any) => api.patch('/api/family', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family'] }),
  });
  const createKid = useMutation({
    mutationFn: (body: any) => api.post('/api/family/kids', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family'] }),
  });
  const patchKid = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.patch(`/api/family/kids/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family'] }),
  });
  const delKid = useMutation({
    mutationFn: (id: string) => api.delete(`/api/family/kids/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family'] }),
  });

  const [newKid, setNewKid] = useState({
    name: '',
    pin: '',
    color: COLORS[0]!,
  });

  if (fam.isLoading || !fam.data) return <p className="text-ink-500">Loading…</p>;
  const family = fam.data.family;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <div className="page-tag">SETTINGS</div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight">
          Family & members
        </h2>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-xl font-extrabold">Family settings</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Family name">
            <input
              className="input"
              defaultValue={family.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== family.name)
                  update.mutate({ name: e.target.value });
              }}
            />
          </Field>
          <Field label="Timezone (IANA)">
            <input
              className="input"
              defaultValue={family.timezone}
              onBlur={(e) => {
                if (e.target.value && e.target.value !== family.timezone)
                  update.mutate({ timezone: e.target.value });
              }}
            />
          </Field>
          <Field label="Payout day">
            <select
              className="input"
              value={family.payoutDay}
              onChange={(e) => update.mutate({ payoutDay: Number(e.target.value) })}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Payout time">
            <input
              type="time"
              className="input"
              defaultValue={family.payoutTime}
              onBlur={(e) => {
                if (e.target.value && e.target.value !== family.payoutTime)
                  update.mutate({ payoutTime: e.target.value });
              }}
            />
          </Field>
        </div>
        {update.error instanceof ApiError && (
          <p className="mt-3 text-sm text-accent-red">{update.error.message}</p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-xl font-extrabold">Kids</h2>
        <ul className="flex flex-col gap-2">
          {fam.data.kids.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900"
            >
              <MemberAvatar name={k.name} color={k.color} size="md" />
              <input
                className="input max-w-[200px]"
                defaultValue={k.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== k.name)
                    patchKid.mutate({ id: k.id, body: { name: e.target.value } });
                }}
              />
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => patchKid.mutate({ id: k.id, body: { color: c } })}
                    className={`h-7 w-7 rounded-full ring-2 ring-ink-900 transition ${
                      k.color === c ? 'scale-110' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <input
                className="input max-w-[110px]"
                placeholder="Reset PIN"
                maxLength={4}
                onBlur={(e) => {
                  if (/^\d{4}$/.test(e.target.value)) {
                    patchKid.mutate({ id: k.id, body: { pin: e.target.value } });
                    e.target.value = '';
                  }
                }}
              />
              <button
                className="btn-danger ml-auto"
                onClick={() => {
                  if (
                    confirm(
                      `Remove ${k.name}? Their history is preserved but they can no longer sign in.`,
                    )
                  )
                    delKid.mutate(k.id);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-xl bg-cream-50 p-4 ring-2 ring-ink-900">
          <h3 className="mb-3 font-semibold">Add a kid</h3>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Name">
              <input
                className="input"
                value={newKid.name}
                onChange={(e) => setNewKid({ ...newKid, name: e.target.value })}
              />
            </Field>
            <Field label="4-digit PIN">
              <input
                className="input"
                inputMode="numeric"
                maxLength={4}
                value={newKid.pin}
                onChange={(e) =>
                  setNewKid({
                    ...newKid,
                    pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                  })
                }
              />
            </Field>
            <Field label="Colour">
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewKid({ ...newKid, color: c })}
                    className={`h-7 w-7 rounded-full ring-2 ring-ink-900 transition ${
                      newKid.color === c ? 'scale-110' : 'opacity-80'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>
            <button
              className="btn-primary"
              disabled={
                !newKid.name.trim() ||
                !/^\d{4}$/.test(newKid.pin) ||
                createKid.isPending
              }
              onClick={() => {
                createKid.mutate(newKid, {
                  onSuccess: () => setNewKid({ name: '', pin: '', color: COLORS[0]! }),
                });
              }}
            >
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-xl font-extrabold">Parents</h2>
        <ul className="flex flex-col gap-2">
          {fam.data.parents.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900"
            >
              <MemberAvatar name={u.name} color="#3253D7" size="md" />
              <span className="font-semibold">{u.name}</span>
              <span className="pill ml-auto">{u.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-500">
          Inviting additional parents is a v1.1 feature.
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[120px] flex-col gap-1 text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {children}
    </label>
  );
}
