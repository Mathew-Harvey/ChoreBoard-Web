import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Family, Kid, PairingIssuance, StatedGender } from '../lib/types';
import { GenderPicker, MemberAvatar, Wordmark } from '../ui/primitives';
import { PinPad } from '../ui/PinPad';
import { toastError, toastSuccess } from '../ui/Toast';

type StepId = 1 | 2 | 3 | 4;

const STORAGE_KEY = 'cb_onboarding';
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

/**
 * Five-chore Starter Pack chosen against the rule from the Round-1 brief:
 *   (i) ≥1 daily anchor for day-one approval,
 *   (ii) ≥1 chore a 6-year-old can do unsupervised,
 *   (iii) ≥1 chore a parent will sometimes claim,
 *   (iv) realistic week-one take ≤ AUD 15 for one keen kid,
 *   (v) zero adult-judgement chores.
 *
 * The pack mirrors `defaultCatalog.ts` rows; the wizard inserts each as a
 * fresh chore via POST /api/chores. Parents can later add the rest of the
 * starter library from AdminChores → "Load more chores".
 */
type StarterChore = {
  name: string;
  amountCents: number;
  cadence:
    | { kind: 'daily'; times: string[] }
    | { kind: 'weekly'; days: number[]; time: string };
  reasonShort: string;
};
const STARTER_PACK: StarterChore[] = [
  {
    name: 'Empty the dishwasher',
    amountCents: 100,
    cadence: { kind: 'daily', times: ['07:00'] },
    reasonShort: 'Daily anchor — fires on day one.',
  },
  {
    name: 'Make your bed',
    amountCents: 50,
    cadence: { kind: 'daily', times: ['09:00'] },
    reasonShort: 'A 6-year-old can do this unsupervised.',
  },
  {
    name: 'Take out kitchen bin',
    amountCents: 50,
    cadence: { kind: 'daily', times: ['19:00'] },
    reasonShort: 'A second daily anchor in the evening.',
  },
  {
    name: 'Tidy the living room',
    amountCents: 150,
    cadence: { kind: 'daily', times: ['17:00'] },
    reasonShort: 'Whole-family — a parent will sometimes claim this.',
  },
  {
    name: 'Sort & start a load of laundry',
    amountCents: 200,
    cadence: { kind: 'weekly', days: [1, 3, 5], time: '08:00' },
    reasonShort: 'Weekly cadence; usually a parent claims this.',
  },
];

type WizardKid = {
  tempId: string;
  name: string;
  pin: string;
  color: string;
  gender: StatedGender;
};

type WizardState = {
  step: StepId;
  // Step 1 — Payout day. Defaults match the family record's existing values
  // so the wizard "confirms" rather than re-asks if the parent already
  // signed up with the right family timezone.
  payoutDay: number;
  payoutTime: string;
  timezone: string;
  // Step 2 — Kids.
  kids: WizardKid[];
  // Step 3 — Starter pack picks; default all five on.
  pickedChores: Record<string, boolean>;
  // Step 4 — Pairing code state.
  pairingIssued: PairingIssuance | null;
};

function defaultState(family: Family): WizardState {
  return {
    step: 1,
    payoutDay: family.payoutDay,
    payoutTime: family.payoutTime,
    timezone: family.timezone,
    kids: [],
    pickedChores: Object.fromEntries(STARTER_PACK.map((c) => [c.name, true])),
    pairingIssued: null,
  };
}

function loadPersisted(): Partial<WizardState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<WizardState>;
  } catch {
    return null;
  }
}

function persist(state: WizardState) {
  try {
    // Drop the pairingIssued field on disk — pairing codes are sensitive
    // and single-use, no point caching them across reloads.
    const { pairingIssued: _, ...rest } = state;
    void _;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // localStorage failures are non-fatal — the in-memory state still works.
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function OnboardWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fam = useQuery({
    queryKey: ['family'],
    queryFn: () =>
      api.get<{ family: Family }>('/api/family').then((r) => r.family),
  });

  const [state, setState] = useState<WizardState | null>(null);

  // Hydrate state once the family record is in hand. We merge any persisted
  // partial state on top, so a parent who closed the tab after step 2 lands
  // back on step 2 with their kids preserved.
  useEffect(() => {
    if (!fam.data || state) return;
    const base = defaultState(fam.data);
    const persisted = loadPersisted();
    setState({ ...base, ...(persisted ?? {}) });
  }, [fam.data, state]);

  // Persist on every change to surviving fields.
  useEffect(() => {
    if (state) persist(state);
  }, [state]);

  if (fam.isLoading || !fam.data || !state) {
    return (
      <div className="grid h-full place-items-center text-ink-500">Loading…</div>
    );
  }

  const setStep = (step: StepId) => setState((s) => (s ? { ...s, step } : s));

  const completeMut = async () => {
    await api.post('/api/auth/onboarding/complete');
    clearPersisted();
    qc.invalidateQueries({ queryKey: ['session'] });
    qc.invalidateQueries({ queryKey: ['family'] });
    navigate('/', { replace: true });
  };

  return (
    <div className="safe-pt safe-pb relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-[60%] bg-accent-orange/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] right-[-100px] h-[420px] w-[420px] rounded-full bg-money/15 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8 sm:py-12">
        <header className="mb-6 flex items-center justify-between gap-3 sm:mb-10">
          <Wordmark size="lg" />
          <button
            type="button"
            className="text-xs text-ink-400 underline-offset-4 hover:text-ink-700 hover:underline"
            onClick={() => navigate('/', { replace: true })}
            title="Save what you have so far and finish later. We'll bring you back here on next sign-in."
          >
            Save & exit
          </button>
        </header>

        <ProgressBar step={state.step} />

        <main className="mt-6 flex-1">
          <div
            key={state.step}
            className="card animate-floatIn p-6 sm:p-8"
          >
            {state.step === 1 && (
              <Step1Payout
                state={state}
                onChange={(patch) => setState((s) => (s ? { ...s, ...patch } : s))}
                onContinue={async () => {
                  try {
                    await api.patch('/api/family', {
                      payoutDay: state.payoutDay,
                      payoutTime: state.payoutTime,
                      timezone: state.timezone,
                    });
                    qc.invalidateQueries({ queryKey: ['family'] });
                    setStep(2);
                  } catch (err) {
                    if (err instanceof ApiError) toastError("Couldn't save", err.message);
                  }
                }}
              />
            )}

            {state.step === 2 && (
              <Step2Kids
                state={state}
                onChange={(kids) =>
                  setState((s) => (s ? { ...s, kids } : s))
                }
                onBack={() => setStep(1)}
                onContinue={async () => {
                  // Create kids server-side. We POST sequentially so an
                  // error on kid #2 leaves kid #1 in the DB rather than
                  // tearing the whole batch down.
                  try {
                    for (const k of state.kids) {
                      await api.post('/api/family/kids', {
                        name: k.name,
                        pin: k.pin,
                        color: k.color,
                        gender: k.gender,
                      });
                    }
                    qc.invalidateQueries({ queryKey: ['family'] });
                    qc.invalidateQueries({ queryKey: ['board'] });
                    setStep(3);
                  } catch (err) {
                    if (err instanceof ApiError) toastError("Couldn't add kid", err.message);
                  }
                }}
              />
            )}

            {state.step === 3 && (
              <Step3Starter
                state={state}
                onChange={(pickedChores) =>
                  setState((s) => (s ? { ...s, pickedChores } : s))
                }
                onBack={() => setStep(2)}
                onContinue={async () => {
                  try {
                    for (const c of STARTER_PACK) {
                      if (!state.pickedChores[c.name]) continue;
                      await api.post('/api/chores', {
                        name: c.name,
                        amountCents: c.amountCents,
                        cadence: c.cadence,
                      });
                    }
                    qc.invalidateQueries({ queryKey: ['chores'] });
                    qc.invalidateQueries({ queryKey: ['board'] });
                    setStep(4);
                  } catch (err) {
                    if (err instanceof ApiError) toastError("Couldn't save chores", err.message);
                  }
                }}
              />
            )}

            {state.step === 4 && (
              <Step4Pair
                state={state}
                onChange={(pairingIssued) =>
                  setState((s) => (s ? { ...s, pairingIssued } : s))
                }
                onBack={() => setStep(3)}
                onDone={completeMut}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: StepId }) {
  const segments: Array<{ idx: StepId; label: string }> = [
    { idx: 1, label: 'PAYOUT DAY' },
    { idx: 2, label: 'KIDS' },
    { idx: 3, label: 'STARTER PACK' },
    { idx: 4, label: 'PAIR THE TABLET' },
  ];
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {segments.map((s) => (
          <div
            key={s.idx}
            className={`h-1.5 rounded-full transition-colors ${
              s.idx <= step ? 'bg-money' : 'bg-cream-200'
            }`}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] font-bold uppercase tracking-wider sm:text-[11px]">
        {segments.map((s) => (
          <span
            key={s.idx}
            className={`truncate ${s.idx === step ? 'text-ink-900' : 'text-ink-400'}`}
          >
            0{s.idx} — {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Step1Payout({
  state,
  onChange,
  onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        When does the week pay out?
      </h1>
      <p className="mt-2 text-sm text-ink-500 sm:text-base">
        We&apos;ll close the week, name a Champion, and snapshot the ledger
        every week at this time. You can change it later in Admin → Family.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <div>
          <div className="page-tag mb-2">DAY</div>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, idx) => {
              const selected = state.payoutDay === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onChange({ payoutDay: idx })}
                  className={`min-w-[56px] rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    selected
                      ? 'bg-ink-900 text-cream-50 shadow-paper-sm ring-2 ring-ink-900'
                      : 'bg-cream-200 text-ink-700 ring-2 ring-ink-900/10 hover:bg-cream-100'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="page-tag mb-2">TIME</div>
            <input
              type="time"
              className="input"
              value={state.payoutTime}
              onChange={(e) => onChange({ payoutTime: e.target.value })}
            />
          </div>
          <div>
            <div className="page-tag mb-2">TIMEZONE</div>
            <input
              className="input"
              value={state.timezone}
              onChange={(e) => onChange({ timezone: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button type="button" className="btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </>
  );
}

function Step2Kids({
  state,
  onChange,
  onBack,
  onContinue,
}: {
  state: WizardState;
  onChange: (kids: WizardKid[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [editing, setEditing] = useState<WizardKid | null>(null);

  const startNew = () => {
    setEditing({
      tempId: `tmp-${Date.now()}`,
      name: '',
      pin: '',
      color: COLORS[state.kids.length % COLORS.length] ?? '#3253D7',
      gender: 'unspecified',
    });
  };

  const save = (next: WizardKid) => {
    const exists = state.kids.find((k) => k.tempId === next.tempId);
    onChange(exists
      ? state.kids.map((k) => (k.tempId === next.tempId ? next : k))
      : [...state.kids, next],
    );
    setEditing(null);
  };

  const remove = (tempId: string) => {
    onChange(state.kids.filter((k) => k.tempId !== tempId));
  };

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Add the kids
      </h1>
      <p className="mt-2 text-sm text-ink-500 sm:text-base">
        Each kid gets a 4-digit PIN they&apos;ll use on the kitchen tablet.
        Add at least one to continue.
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {state.kids.map((k) => (
          <li
            key={k.tempId}
            className="flex items-center justify-between gap-3 rounded-xl bg-paper p-3 ring-2 ring-ink-900/15"
          >
            <div className="flex items-center gap-3">
              <MemberAvatar name={k.name || '·'} color={k.color} size="md" />
              <div>
                <div className="font-display text-base font-extrabold">
                  {k.name || 'Untitled'}
                </div>
                <div className="text-xs text-ink-500">PIN •••• · {k.gender}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setEditing(k)}>
                Edit
              </button>
              <button className="btn-ghost text-accent-red" onClick={() => remove(k.tempId)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <KidForm
          initial={editing}
          existingPins={state.kids.filter((k) => k.tempId !== editing.tempId).map((k) => k.pin)}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {!editing && (
        <button type="button" className="btn-secondary mt-4 w-full" onClick={startNew}>
          {state.kids.length === 0 ? 'Add your first kid' : 'Add another kid'}
        </button>
      )}

      <div className="mt-8 flex justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={state.kids.length === 0 || !!editing}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </>
  );
}

function KidForm({
  initial,
  existingPins,
  onCancel,
  onSave,
}: {
  initial: WizardKid;
  existingPins: string[];
  onCancel: () => void;
  onSave: (kid: WizardKid) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [pin, setPin] = useState(initial.pin);
  const [color, setColor] = useState(initial.color);
  const [gender, setGender] = useState<StatedGender>(initial.gender);

  const dupe = existingPins.includes(pin) && pin.length === 4;
  const ready = name.trim().length > 0 && pin.length === 4 && !dupe;

  return (
    <div className="mt-4 rounded-xl bg-cream-100 p-4 ring-1 ring-ink-900/10">
      <div className="grid gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink-900">Name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Skye"
          />
        </label>

        <div>
          <div className="page-tag mb-2">COLOR</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full ring-2 ring-ink-900 ${
                  c === color ? 'scale-110 shadow-paper-sm' : 'opacity-80'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="page-tag mb-2">AVATAR</div>
          <GenderPicker size="sm" value={gender} onChange={setGender} />
        </div>

        <div>
          <div className="page-tag mb-2">PIN</div>
          <PinPad value={pin} onChange={setPin} />
          {dupe && (
            <p className="mt-2 rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
              That PIN is already used by another kid. Pick a different one.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!ready}
          onClick={() => onSave({ ...initial, name: name.trim(), pin, color, gender })}
        >
          Save kid
        </button>
      </div>
    </div>
  );
}

function Step3Starter({
  state,
  onChange,
  onBack,
  onContinue,
}: {
  state: WizardState;
  onChange: (next: Record<string, boolean>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const toggle = (name: string) => {
    onChange({ ...state.pickedChores, [name]: !state.pickedChores[name] });
  };

  const chosen = STARTER_PACK.filter((c) => state.pickedChores[c.name]);

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Pick a starter pack
      </h1>
      <p className="mt-2 text-sm text-ink-500 sm:text-base">
        Five chores to start with. You can add more from{' '}
        <strong>Admin → Chores</strong> later.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {STARTER_PACK.map((c) => {
          const on = !!state.pickedChores[c.name];
          return (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => toggle(c.name)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left ring-2 transition ${
                  on
                    ? 'bg-paper ring-ink-900 shadow-paper-sm'
                    : 'bg-cream-100 ring-ink-900/10 hover:bg-cream-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-display text-base font-extrabold text-ink-900">
                    {c.name}
                  </div>
                  <div className="text-xs text-ink-500">{c.reasonShort}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="money-amt text-base">
                    ${(c.amountCents / 100).toFixed(2)}
                  </span>
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full ring-2 ring-ink-900 ${
                      on ? 'bg-money text-white' : 'bg-paper text-ink-300'
                    }`}
                    aria-hidden
                  >
                    {on ? '✓' : ''}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-ink-400">
        {chosen.length} of {STARTER_PACK.length} picked.
      </p>

      <div className="mt-8 flex justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={chosen.length === 0}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </>
  );
}

function Step4Pair({
  state,
  onChange,
  onBack,
  onDone,
}: {
  state: WizardState;
  onChange: (issuance: PairingIssuance | null) => void;
  onBack: () => void;
  onDone: () => Promise<void>;
}) {
  const issuanceQuery = useMutation({
    mutationFn: () => api.post<PairingIssuance>('/api/family/pairings', {}),
    onSuccess: (data) => {
      onChange(data);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError("Couldn't generate code", err.message);
    },
  });

  // Issue a code the first time this step is mounted (or on retry if the
  // previous code expired). State.pairingIssued is intentionally not
  // persisted to localStorage — codes are sensitive and single-use.
  useEffect(() => {
    if (!state.pairingIssued && !issuanceQuery.isPending) {
      issuanceQuery.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issuance = state.pairingIssued;
  const expiresAt = useMemo(
    () => (issuance ? new Date(issuance.pairing.expiresAt).getTime() : 0),
    [issuance],
  );

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Pair the kitchen tablet
      </h1>
      <p className="mt-2 text-sm text-ink-500 sm:text-base">
        Open <strong>app.choreboard.io/kid</strong> on your kitchen tablet and
        enter this code. It only works once and expires in 10 minutes.
      </p>

      <div className="mt-6 grid place-items-center rounded-xl bg-cream-100 p-6 ring-2 ring-ink-900/10">
        {issuanceQuery.isPending && !issuance && (
          <div className="text-ink-500">Generating…</div>
        )}
        {issuance && (
          <div className="font-display text-[44px] font-extrabold tabular-nums tracking-[0.18em] text-money sm:text-[56px]">
            {issuance.code}
          </div>
        )}
        {issuance && expiresAt > 0 && expiresAt < Date.now() && (
          <button
            type="button"
            className="btn-ghost mt-3 text-xs"
            onClick={() => issuanceQuery.mutate()}
          >
            Code expired · regenerate
          </button>
        )}
      </div>

      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={!issuance}
        onClick={async () => {
          if (!issuance) return;
          try {
            await navigator.clipboard.writeText(issuance.code);
            toastSuccess('Code copied');
          } catch {
            toastError("Couldn't copy", 'Read the code aloud instead.');
          }
        }}
      >
        Copy code
      </button>

      <div className="mt-8 flex flex-col items-stretch gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await onDone();
          }}
        >
          Done
        </button>
        <button
          type="button"
          className="text-xs text-ink-400 underline-offset-4 hover:text-ink-700 hover:underline"
          onClick={async () => {
            await onDone();
          }}
        >
          I&apos;ll pair later
        </button>
        <button
          type="button"
          className="btn-ghost mt-1 self-start"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </>
  );
}

// Avoid a stale Kid import warning when developing the wizard standalone.
void (null as unknown as Kid);
