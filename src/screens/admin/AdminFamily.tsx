import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useEntitlements, useSession } from '../../lib/session';
import type {
  DevicePairing,
  Family,
  FamilyInvite,
  Kid,
  Parent,
  StatedGender,
} from '../../lib/types';
import { GenderPicker, MemberAvatar } from '../../ui/primitives';
import { PairingCodeModal } from '../../ui/PairingCodeModal';
import { requestUpsell } from '../../ui/PlanUpsellSheet';
import { toastError, toastSuccess } from '../../ui/Toast';

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
  const navigate = useNavigate();
  const session = useSession();
  const entitlements = useEntitlements();
  const fam = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ family: Family; parents: Parent[]; kids: Kid[] }>('/api/family'),
  });

  const update = useMutation({
    mutationFn: (body: any) => api.patch('/api/family', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toastSuccess('Family settings saved');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t save', err.message);
    },
  });
  const createKid = useMutation({
    mutationFn: (body: any) => api.post('/api/family/kids', body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['family'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      toastSuccess('Kid added', vars.name);
    },
    onError: (err) => {
      // Server-side 402 is the fallback path when the SPA's entitlements
      // cache was stale (e.g. another parent in another tab just added a
      // kid). Surface the same upsell sheet rather than a raw error toast.
      if (err instanceof ApiError && err.status === 402) {
        const blockedBy =
          (err.payload as { blockedBy?: 'kids_max' | 'parents_max' })?.blockedBy ??
          'kids_max';
        requestUpsell(blockedBy);
        return;
      }
      if (err instanceof ApiError) toastError('Couldn’t add kid', err.message);
    },
  });
  const patchKid = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.patch(`/api/family/kids/${id}`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['family'] });
      if (vars.body?.pin) toastSuccess('PIN reset');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t update kid', err.message);
    },
  });
  const patchParent = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.patch(`/api/family/parents/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      qc.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t update parent', err.message);
    },
  });
  const delKid = useMutation({
    mutationFn: (id: string) => api.delete(`/api/family/kids/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toastSuccess('Kid removed');
    },
  });
  const invite = useQuery({
    queryKey: ['family-invite'],
    queryFn: () =>
      api.get<{ invite: FamilyInvite | null }>('/api/family/invites'),
  });
  const createInvite = useMutation({
    mutationFn: () => api.post<{ invite: FamilyInvite }>('/api/family/invites'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family-invite'] });
      toastSuccess('Invite link ready', 'Share it with your co-parent.');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t create invite', err.message);
    },
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.delete(`/api/family/invites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family-invite'] });
      toastSuccess('Invite revoked');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t revoke invite', err.message);
    },
  });
  const removeParent = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/family/parents/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toastSuccess('Co-parent removed');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toastError('Couldn’t remove co-parent', err.message);
      }
    },
  });
  const promoteParent = useMutation({
    mutationFn: (userId: string) => api.post(`/api/family/parents/${userId}/promote`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toastSuccess('Promoted to co-owner', 'They now have full admin access.');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toastError('Couldn’t promote co-parent', err.message);
      }
    },
  });
  const delMe = useMutation({
    mutationFn: () => api.delete('/api/auth/me'),
    onSuccess: () => {
      qc.clear();
      toastSuccess('Account deleted');
      navigate('/', { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.message === 'owner_cannot_self_delete') {
          toastError(
            'Owners can’t self-delete',
            'Use “Delete family” below to wind down the whole household.',
          );
          return;
        }
        toastError('Couldn’t delete account', err.message);
      }
    },
  });

  // Owner-only: delete the entire family. This is the App Store / Play Store
  // mandated account-deletion path for the owner role, since v1 has no way to
  // transfer ownership to another parent.
  const delFamily = useMutation({
    mutationFn: (confirmFamilyName: string) =>
      api.delete('/api/auth/family', { confirmFamilyName }),
    onSuccess: () => {
      qc.clear();
      toastSuccess('Family deleted');
      navigate('/', { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.status === 400 && err.message === 'confirmation_mismatch') {
          toastError(
            'Family name didn’t match',
            'Type the family name exactly as it appears in Settings.',
          );
          return;
        }
        toastError('Couldn’t delete family', err.message);
      }
    },
  });

  const [newKid, setNewKid] = useState<{
    name: string;
    pin: string;
    color: string;
    gender: StatedGender;
  }>({
    name: '',
    pin: '',
    color: COLORS[0]!,
    gender: 'unspecified',
  });

  if (fam.isLoading || !fam.data) return <p className="text-ink-500">Loading…</p>;
  const family = fam.data.family;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <div className="page-tag mb-1">SETTINGS</div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Family &amp; members
        </h2>
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-4 font-display text-xl font-extrabold sm:text-2xl">
          Family settings
        </h2>
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

        {/* TV-mode champion-of-the-week chime toggle (PR 11). Default true.
            The same value is read by the ceremony in ChampionBanner.tsx; a
            change here propagates via the family.updated SSE event. */}
        <div className="mt-5 flex items-start justify-between gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900/10">
          <div>
            <div className="font-semibold text-ink-900">
              Champion celebration sound
            </div>
            <div className="text-xs text-ink-500">
              On Sunday payout, the kitchen-wall TV plays a short chime when
              the champion is announced. Turn it off if your kitchen runs on
              quiet hours.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={family.tvCelebrationSound}
            aria-label="Champion celebration sound"
            onClick={() =>
              update.mutate({ tvCelebrationSound: !family.tvCelebrationSound })
            }
            className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full ring-2 ring-ink-900 transition ${
              family.tvCelebrationSound ? 'bg-money' : 'bg-cream-200'
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-5 w-5 rounded-full bg-paper shadow-paper-sm transition ${
                family.tvCelebrationSound ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-4 font-display text-xl font-extrabold sm:text-2xl">Kids</h2>
        <ul className="flex flex-col gap-3">
          {fam.data.kids.map((k) => (
            <li
              key={k.id}
              className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900 sm:p-4"
            >
              <div className="row-span-2 flex items-start sm:row-span-1 sm:items-center">
                <MemberAvatar name={k.name} color={k.color} size="md" />
              </div>
              <input
                className="input col-span-1 sm:max-w-xs"
                defaultValue={k.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== k.name)
                    patchKid.mutate({ id: k.id, body: { name: e.target.value } });
                }}
                aria-label={`${k.name}'s name`}
              />
              <button
                className="btn-danger col-start-3 row-start-1 self-start sm:self-center"
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
              <div className="col-span-2 col-start-2 row-start-2 flex flex-col gap-3 sm:col-span-3 sm:col-start-1 sm:row-start-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => patchKid.mutate({ id: k.id, body: { color: c } })}
                      className={`h-8 w-8 rounded-full ring-2 ring-ink-900 transition ${
                        k.color === c ? 'scale-110 shadow-paper-sm' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                      aria-pressed={k.color === c}
                    />
                  ))}
                </div>
                <input
                  className="input sm:max-w-[140px]"
                  placeholder="Reset PIN"
                  maxLength={4}
                  inputMode="numeric"
                  onBlur={(e) => {
                    if (/^\d{4}$/.test(e.target.value)) {
                      patchKid.mutate({ id: k.id, body: { pin: e.target.value } });
                      e.target.value = '';
                    }
                  }}
                  aria-label={`Reset ${k.name}'s PIN`}
                />
              </div>
              <div className="col-span-2 col-start-2 row-start-3 flex items-center gap-3 sm:col-span-3 sm:col-start-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                  Avatar
                </span>
                <GenderPicker
                  size="sm"
                  value={k.gender}
                  onChange={(next) =>
                    patchKid.mutate({ id: k.id, body: { gender: next } })
                  }
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-xl bg-cream-50 p-4 ring-2 ring-ink-900 sm:p-5">
          <h3 className="mb-3 font-display text-base font-extrabold sm:text-lg">
            Add a kid
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Field label="Colour" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewKid({ ...newKid, color: c })}
                    className={`h-8 w-8 rounded-full ring-2 ring-ink-900 transition ${
                      newKid.color === c ? 'scale-110 shadow-paper-sm' : 'opacity-80'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </Field>
            <Field label="Gender (for the avatar art)" className="sm:col-span-2">
              <GenderPicker
                value={newKid.gender}
                onChange={(next) => setNewKid({ ...newKid, gender: next })}
              />
            </Field>
          </div>
          <button
            className="btn-primary mt-4 w-full sm:w-auto"
            disabled={
              !newKid.name.trim() ||
              !/^\d{4}$/.test(newKid.pin) ||
              createKid.isPending
            }
            onClick={() => {
              // Pre-empt the 402: if the family is at the free-tier kid
              // ceiling already, open the upsell sheet instead of letting
              // the parent submit a form they can't get through.
              if (entitlements.data && entitlements.data.remaining.kids <= 0) {
                requestUpsell('kids_max');
                return;
              }
              createKid.mutate(newKid, {
                onSuccess: () =>
                  setNewKid({
                    name: '',
                    pin: '',
                    color: COLORS[0]!,
                    gender: 'unspecified',
                  }),
              });
            }}
          >
            {createKid.isPending ? 'Adding…' : 'Add kid'}
          </button>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-1 font-display text-xl font-extrabold sm:text-2xl">Parents</h2>
        <p className="mb-4 text-sm text-ink-500">
          Co-parents share full access to chores, kids, and the ledger. Promote
          a co-parent to <strong>co-owner</strong> to grant them billing,
          invites, and family-deletion rights too.
        </p>
        <ul className="flex flex-col gap-3">
          {fam.data.parents.map((u) => {
            const isSelf = session.data?.kind === 'parent' && session.data.userId === u.id;
            const viewerIsOwner =
              session.data?.kind === 'parent' && session.data.role === 'owner';
            const canPromote = viewerIsOwner && u.role !== 'owner' && !isSelf;
            const canRemove = viewerIsOwner && u.role !== 'owner' && !isSelf;
            return (
              <li
                key={u.id}
                className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-xl bg-cream-50 p-3 ring-2 ring-ink-900 sm:p-4"
              >
                <div className="row-span-2 flex items-start sm:row-span-1 sm:items-center">
                  <MemberAvatar name={u.name} color={u.color} size="md" />
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <input
                    className="input sm:max-w-xs"
                    defaultValue={u.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== u.name)
                        patchParent.mutate({ id: u.id, body: { name: e.target.value } });
                    }}
                    aria-label={`${u.name}'s name`}
                  />
                  {isSelf && <span className="text-sm text-ink-500">(you)</span>}
                  <span className="pill capitalize">{u.role}</span>
                </div>
                <div className="col-start-3 row-start-1 flex flex-wrap items-start justify-end gap-2 self-start sm:items-center sm:self-center">
                  {canPromote && (
                    <button
                      className="btn-secondary"
                      disabled={promoteParent.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Promote ${u.name} to co-owner? They’ll get full admin access — billing, invites, removing parents, and deleting the family. There’s no demote button in v1.`,
                          )
                        ) {
                          promoteParent.mutate(u.id);
                        }
                      }}
                    >
                      {promoteParent.isPending && promoteParent.variables === u.id
                        ? 'Promoting…'
                        : 'Promote to co-owner'}
                    </button>
                  )}
                  {canRemove && (
                    <button
                      className="btn-danger"
                      disabled={removeParent.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${u.name} from the family? They’ll be signed out immediately and lose access.`,
                          )
                        ) {
                          removeParent.mutate(u.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap gap-1.5 sm:col-span-3 sm:col-start-1 sm:row-start-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => patchParent.mutate({ id: u.id, body: { color: c } })}
                      className={`h-8 w-8 rounded-full ring-2 ring-ink-900 transition ${
                        u.color === c ? 'scale-110 shadow-paper-sm' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                      aria-pressed={u.color === c}
                    />
                  ))}
                </div>
                <div className="col-span-2 col-start-2 row-start-3 flex items-center gap-3 sm:col-span-3 sm:col-start-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    Avatar
                  </span>
                  <GenderPicker
                    size="sm"
                    value={u.gender}
                    onChange={(next) =>
                      patchParent.mutate({ id: u.id, body: { gender: next } })
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {session.data?.kind === 'parent' && session.data.role === 'owner' && (
          <CoParentInviter
            invite={invite.data?.invite ?? null}
            isLoading={invite.isLoading}
            onCreate={() => {
              // The invite link itself is fine to mint — the gate is on
              // *acceptance* server-side — but if the family already has
              // its one allowed parent on the free plan, we surface the
              // upsell here so the joiner doesn't run into a 402 they can't
              // explain. This keeps the upsell story honest at every door.
              if (entitlements.data && entitlements.data.remaining.parents <= 0) {
                requestUpsell('parents_max');
                return;
              }
              createInvite.mutate();
            }}
            onRevoke={(id) => revokeInvite.mutate(id)}
            isCreating={createInvite.isPending}
            isRevoking={revokeInvite.isPending}
          />
        )}
      </section>

      <PairedDevicesPanel />

      {session.data?.kind === 'parent' && (
        <DangerZone
          isOwner={session.data.role === 'owner'}
          familyName={family.name}
          isDeletingMe={delMe.isPending}
          isDeletingFamily={delFamily.isPending}
          onDeleteMe={() => {
            if (
              confirm(
                'Delete your ChoreBoard account? You will be signed out immediately. Your family and chore history stay intact, but you will no longer have access.',
              )
            ) {
              delMe.mutate();
            }
          }}
          onDeleteFamily={(confirmName) => {
            if (
              confirm(
                `Delete the entire ${family.name} family? This is permanent and removes every kid, every chore, and the whole ledger history. There is no undo.`,
              )
            ) {
              delFamily.mutate(confirmName);
            }
          }}
        />
      )}
    </div>
  );
}

function DangerZone({
  isOwner,
  familyName,
  isDeletingMe,
  isDeletingFamily,
  onDeleteMe,
  onDeleteFamily,
}: {
  isOwner: boolean;
  familyName: string;
  isDeletingMe: boolean;
  isDeletingFamily: boolean;
  onDeleteMe: () => void;
  onDeleteFamily: (confirmName: string) => void;
}) {
  const [familyConfirm, setFamilyConfirm] = useState('');
  const familyMatches = familyConfirm.trim() === familyName;

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 font-display text-xl font-extrabold sm:text-2xl">
        Danger zone
      </h2>

      {/* Self-delete: visible to non-owner parents. Owners use the
          delete-family flow below instead. */}
      {!isOwner && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink-900">Delete my account</p>
            <p className="text-sm text-ink-500">
              Removes your sign-in. Your family and ledger history are kept.
            </p>
          </div>
          <button
            className="btn-danger sm:self-center"
            disabled={isDeletingMe}
            onClick={onDeleteMe}
          >
            {isDeletingMe ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      )}

      {/* Delete-family: owner-only. This is the App Store and Play Store
          required account-deletion path for owners. */}
      {isOwner && (
        <div className="flex flex-col gap-3 rounded-xl bg-accent-red/10 p-4 ring-2 ring-accent-red/30 sm:p-5">
          <div>
            <p className="font-semibold text-ink-900">Delete this family</p>
            <p className="text-sm text-ink-500">
              You’re the owner of <strong>{familyName}</strong>. To delete your
              account we have to delete the whole family. This removes every
              kid, every chore, every ledger entry, and any active subscription.
              There is no undo.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="input sm:max-w-xs"
              placeholder={`Type "${familyName}" to confirm`}
              value={familyConfirm}
              onChange={(e) => setFamilyConfirm(e.target.value)}
              aria-label="Type family name to confirm deletion"
            />
            <button
              className="btn-danger"
              disabled={!familyMatches || isDeletingFamily}
              onClick={() => onDeleteFamily(familyConfirm.trim())}
            >
              {isDeletingFamily ? 'Deleting…' : 'Delete family permanently'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-[120px] flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-semibold text-ink-900">{label}</span>
      {children}
    </label>
  );
}

function CoParentInviter({
  invite,
  isLoading,
  onCreate,
  onRevoke,
  isCreating,
  isRevoking,
}: {
  invite: FamilyInvite | null;
  isLoading: boolean;
  onCreate: () => void;
  onRevoke: (id: string) => void;
  isCreating: boolean;
  isRevoking: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return <p className="mt-4 text-sm text-ink-500">Loading invite…</p>;
  }

  return (
    <div className="mt-6 rounded-xl bg-cream-50 p-4 ring-2 ring-ink-900 sm:p-5">
      <h3 className="font-display text-base font-extrabold sm:text-lg">
        Invite a co-parent
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        Generate a single-use join link and share it with your partner over
        text or chat. Anyone with the link can claim a parent seat, so don’t
        post it publicly.
      </p>

      {invite ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              className="input grow font-mono text-xs"
              value={invite.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Co-parent invite URL"
            />
            <button
              className="btn-secondary sm:w-auto"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite.url);
                  setCopied(true);
                  toastSuccess('Invite link copied');
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  toastError(
                    'Couldn’t copy',
                    'Long-press the URL above to copy it manually.',
                  );
                }
              }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
            <span>
              Expires{' '}
              {new Date(invite.expiresAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
            <button
              className="btn-ghost"
              disabled={isRevoking}
              onClick={() => {
                if (
                  confirm(
                    'Revoke this invite? The current link will stop working immediately.',
                  )
                ) {
                  onRevoke(invite.id);
                }
              }}
            >
              {isRevoking ? 'Revoking…' : 'Revoke link'}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn-primary mt-4 w-full sm:w-auto"
          disabled={isCreating}
          onClick={onCreate}
        >
          {isCreating ? 'Generating…' : 'Create invite link'}
        </button>
      )}
    </div>
  );
}

/**
 * "Paired devices" panel — lists every kitchen tablet (or other shared
 * family device) that consumed a pairing code. Lets any parent generate a
 * fresh code, rename a device label, or revoke a pairing (which deletes
 * the device session and forces the device back to the unpaired state).
 *
 * This is the only place a parent can dismiss the sticky "Pair a kitchen
 * tablet" reminder banner that lives above the Kanban (PR 9). The dismiss
 * link only appears when zero devices are paired so far.
 */
function PairedDevicesPanel() {
  const qc = useQueryClient();
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const list = useQuery({
    queryKey: ['device-pairings'],
    queryFn: () =>
      api.get<{ pairings: DevicePairing[] }>('/api/family/pairings').then((r) => r.pairings),
  });

  const rename = useMutation({
    mutationFn: ({ id, deviceLabel }: { id: string; deviceLabel: string }) =>
      api.patch(`/api/family/pairings/${id}`, { deviceLabel }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-pairings'] });
      setEditingId(null);
      toastSuccess('Renamed');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError("Couldn't rename", err.message);
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/family/pairings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-pairings'] });
      toastSuccess('Pairing revoked');
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError("Couldn't revoke", err.message);
    },
  });

  const dismissBanner = useMutation({
    mutationFn: () =>
      api.patch('/api/family', {
        // Server stamps this column with `now()` when it sees the value
        // arrive (route accepts a sentinel — see PR 9 wiring).
        pairingReminderDismissed: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toastSuccess('Reminder hidden');
    },
  });

  const all = list.data ?? [];
  // Only "active" pairings — the ones currently signed in on a device — are
  // worth showing as standing rows. Pending/expired/revoked are bookkeeping
  // and would just clutter the panel.
  const active = all.filter((p) => p.status === 'active');
  const hasAny = active.length > 0;

  return (
    <section id="paired-devices" className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold sm:text-2xl">
            Paired devices
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Pair a kitchen tablet so kids can sign in with their PIN. The code
            is one-time use and expires after 10 minutes.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowCodeModal(true)}>
          Pair a new device
        </button>
      </div>

      {list.isLoading && <p className="text-ink-500">Loading…</p>}

      {!list.isLoading && !hasAny && (
        <div className="rounded-xl bg-cream-100 p-4 text-sm text-ink-500 ring-1 ring-ink-900/10">
          No devices paired yet. Open <strong>app.choreboard.io/kid</strong>{' '}
          on the kitchen tablet, then tap <em>Pair a new device</em> above to
          show a 6-digit code.
        </div>
      )}

      {hasAny && (
        <ul className="flex flex-col gap-3">
          {active.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-3 rounded-xl bg-paper p-3 ring-2 ring-ink-900/15 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                {editingId === d.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = editingLabel.trim();
                      if (trimmed) rename.mutate({ id: d.id, deviceLabel: trimmed });
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      autoFocus
                      className="input"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      maxLength={64}
                    />
                    <button type="submit" className="btn-primary" disabled={rename.isPending}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="font-display text-lg font-extrabold text-ink-900">
                      {d.deviceLabel ?? 'Tablet'}
                    </div>
                    <div className="text-xs text-ink-500">
                      Paired {formatRelative(d.consumedAt ?? d.issuedAt)}
                      {d.lastSeenAt
                        ? ` · last seen ${formatRelative(d.lastSeenAt)}`
                        : ''}
                    </div>
                  </>
                )}
              </div>
              {editingId !== d.id && (
                <div className="flex gap-2">
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setEditingId(d.id);
                      setEditingLabel(d.deviceLabel ?? '');
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn-danger"
                    disabled={revoke.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Revoke "${d.deviceLabel ?? 'this device'}"? Kids will need a new pairing code to sign in on it again.`,
                        )
                      ) {
                        revoke.mutate(d.id);
                      }
                    }}
                  >
                    Revoke
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The "hide the Kanban reminder" link only shows when the Kanban
          banner is actually possible (no device paired). Once a device is
          paired the banner self-clears regardless of dismissal flag, so
          showing this option there would just be confusing. */}
      {!hasAny && (
        <button
          type="button"
          onClick={() => dismissBanner.mutate()}
          disabled={dismissBanner.isPending}
          className="mt-4 text-xs text-ink-400 hover:text-ink-700 hover:underline"
        >
          Hide the &quot;Pair a kitchen tablet&quot; reminder above the board
        </button>
      )}

      <PairingCodeModal
        open={showCodeModal}
        onClose={() => {
          setShowCodeModal(false);
          qc.invalidateQueries({ queryKey: ['device-pairings'] });
        }}
      />
    </section>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))}h ago`;
  const d = Math.floor(ms / (24 * 60 * 60_000));
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
