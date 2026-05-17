import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { money } from '../lib/format';
import { resolveCountry, SUPPORTED_COUNTRIES } from '../lib/locale';
import type {
  ChoreSuggestion,
  ChoreSuggestionsResponse,
  Family,
  Kid,
  PairingIssuance,
  StatedGender,
} from '../lib/types';
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

type WizardKid = {
  tempId: string;
  name: string;
  pin: string;
  color: string;
  gender: StatedGender;
  /**
   * Whole-year age. Drives both the chore catalog filter and the
   * pricing engine's age multiplier on `GET /api/chores/suggest`.
   * Parents must pick before continuing past the kids step.
   */
  age: number | null;
};

type WizardState = {
  step: StepId;
  // Step 1 — Payout day + country/currency. Defaults match the family
  // record's existing values so the wizard "confirms" rather than
  // re-asks if the parent already signed up with the right family
  // timezone, country, and currency.
  payoutDay: number;
  payoutTime: string;
  timezone: string;
  country: string | null;
  currency: string | null;
  // Step 2 — Kids.
  kids: WizardKid[];
  // Step 3 — Suggested-chore picks keyed by catalog `slug`. Default-on
  // for every suggestion the API returns; the parent can deselect any
  // they don't want before we POST them.
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
    country: family.country,
    currency: family.currency,
    kids: [],
    pickedChores: {},
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
                      ...(state.country ? { country: state.country } : {}),
                      ...(state.currency ? { currency: state.currency } : {}),
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
                        // Age is required to step past this screen, so
                        // it's safe to assert; the validator will
                        // 400 if a TypeScript-savvy attacker sends null
                        // anyway.
                        age: k.age,
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
                onContinue={async (suggestions) => {
                  try {
                    for (const c of suggestions) {
                      if (!state.pickedChores[c.slug]) continue;
                      await api.post('/api/chores', {
                        name: c.name,
                        description: c.description,
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
  const [refining, setRefining] = useState(false);

  // First mount only: if the family record doesn't have a country
  // already, fall back to the locale guess so the dropdown shows
  // something sensible (e.g. AU for an `en-AU` browser). We DON'T
  // call resolveCountry({ requestGeolocation: true }) here — the
  // refine button does that on demand.
  useEffect(() => {
    if (state.country && state.currency) return;
    let cancelled = false;
    void resolveCountry({ requestGeolocation: false }).then((g) => {
      if (cancelled) return;
      onChange({
        country: state.country ?? g.country,
        currency: state.currency ?? g.currency,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refineLocation = async () => {
    setRefining(true);
    try {
      const g = await resolveCountry({ requestGeolocation: true });
      if (g.country) {
        onChange({ country: g.country, currency: g.currency });
        toastSuccess(
          'Location refined',
          g.source === 'geolocation'
            ? 'We used your device location to pick the local currency.'
            : 'Falling back to your browser language.',
        );
      } else {
        toastError(
          "Couldn't read your location",
          'Pick the country manually below — we use it to suggest fair chore prices.',
        );
      }
    } finally {
      setRefining(false);
    }
  };

  const country = state.country ?? '';

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Payout day &amp; location
      </h1>
      <p className="mt-2 text-sm text-ink-500 sm:text-base">
        We&apos;ll close the week, name a Champion, and snapshot the ledger
        at this time. The country tells us how to suggest fair chore
        prices — anchored to allowance survey data for where you live.
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="page-tag mb-2">COUNTRY</div>
            <select
              className="input"
              value={country}
              onChange={(e) => {
                const code = e.target.value || null;
                const match = SUPPORTED_COUNTRIES.find((c) => c.code === code);
                onChange({
                  country: code,
                  currency: match ? match.currency : state.currency,
                });
              }}
            >
              <option value="">Choose your country…</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="page-tag mb-2">CURRENCY</div>
            <input
              className="input"
              value={state.currency ?? ''}
              onChange={(e) =>
                onChange({ currency: e.target.value.toUpperCase() || null })
              }
              placeholder="AUD"
              maxLength={3}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost self-start text-xs"
          onClick={refineLocation}
          disabled={refining}
        >
          {refining ? 'Asking your device…' : 'Use my device location'}
        </button>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={onContinue}
          disabled={!state.country}
        >
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
      age: null,
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
        Their age tells us which chores to suggest — a 6-year-old won&apos;t
        be asked to mow the lawn.
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
                <div className="text-xs text-ink-500">
                  PIN •••• · {k.gender}
                  {k.age != null ? ` · age ${k.age}` : ''}
                </div>
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
          disabled={
            state.kids.length === 0 ||
            !!editing ||
            // Every kid must have an age before we move on — without
            // it the suggestions step has nothing to filter on.
            state.kids.some((k) => k.age == null)
          }
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
  const [age, setAge] = useState<number | null>(initial.age);

  const dupe = existingPins.includes(pin) && pin.length === 4;
  const ready =
    name.trim().length > 0 &&
    pin.length === 4 &&
    !dupe &&
    age !== null &&
    age >= 4 &&
    age <= 18;

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

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink-900">Age</span>
          <input
            type="number"
            inputMode="numeric"
            className="input"
            min={4}
            max={18}
            value={age ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setAge(null);
              } else {
                const n = Number.parseInt(v, 10);
                setAge(Number.isFinite(n) ? n : null);
              }
            }}
            placeholder="e.g. 8"
          />
          <span className="text-xs text-ink-500">
            We use this to suggest chores they can actually do.
          </span>
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
          onClick={() =>
            onSave({ ...initial, name: name.trim(), pin, color, gender, age })
          }
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
  onContinue: (suggestions: ChoreSuggestion[]) => Promise<void>;
}) {
  // Suggestions are fetched server-side based on the kids' ages (just
  // POSTed in step 2) and the family's country (saved in step 1). The
  // pricing engine on the API anchors each amount to published
  // allowance survey data — see `domain/chorePricing.ts` for sources.
  const ages = useMemo(
    () => state.kids.map((k) => k.age).filter((a): a is number => typeof a === 'number'),
    [state.kids],
  );
  const ageKey = ages.join(',');

  const suggestQuery = useQuery({
    queryKey: ['chore-suggestions', ageKey, state.country, state.currency],
    queryFn: () =>
      api.get<ChoreSuggestionsResponse>(
        `/api/chores/suggest?ages=${encodeURIComponent(ageKey)}` +
          (state.country ? `&country=${encodeURIComponent(state.country)}` : '') +
          (state.currency ? `&currency=${encodeURIComponent(state.currency)}` : '') +
          `&total=10`,
      ),
    enabled: ages.length > 0,
    // The wizard's StorageKey persists state.kids across reloads, but
    // the suggestions are cheap to refetch and tied to those ages.
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = suggestQuery.data?.suggestions ?? [];
  const currency = suggestQuery.data?.currency ?? state.currency ?? 'USD';

  // Default-on every suggestion the first time we get them, but only
  // for slugs we haven't seen before — we don't want re-fetches to
  // stomp the parent's deselections.
  useEffect(() => {
    if (suggestions.length === 0) return;
    const next: Record<string, boolean> = { ...state.pickedChores };
    let changed = false;
    for (const s of suggestions) {
      if (!(s.slug in next)) {
        next[s.slug] = true;
        changed = true;
      }
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.length]);

  const toggle = (slug: string) => {
    onChange({ ...state.pickedChores, [slug]: !state.pickedChores[slug] });
  };

  const chosen = suggestions.filter((c) => state.pickedChores[c.slug]);
  const totalWeeklyEstimateCents = chosen.reduce((acc, c) => {
    return acc + estimateWeeklyCents(c);
  }, 0);

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Age-appropriate starter pack
      </h1>
      <p className="mt-2 text-sm text-ink-500 sm:text-base">
        Hand-picked for{' '}
        <strong>
          {ages.length === 1
            ? `your ${ages[0]}-year-old`
            : `ages ${[...new Set(ages)].sort((a, b) => a - b).join(' & ')}`}
        </strong>{' '}
        from paediatric and parenting bodies (AAP, AACAP, CHOP). Prices
        are tuned to your country&apos;s allowance norms — uncheck any
        you don&apos;t want.
      </p>

      {suggestQuery.isLoading && (
        <p className="mt-6 text-ink-500">Picking the right chores…</p>
      )}

      {suggestQuery.isError && (
        <p className="mt-6 rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
          Couldn&apos;t load suggestions. Click <em>Back</em> and check
          each kid has an age, or skip to{' '}
          <strong>Admin → Chores</strong> after onboarding.
        </p>
      )}

      {!suggestQuery.isLoading && suggestions.length > 0 && (
        <>
          <ul className="mt-6 flex flex-col gap-2">
            {suggestions.map((c) => {
              const on = !!state.pickedChores[c.slug];
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => toggle(c.slug)}
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
                      <div className="text-xs text-ink-500">
                        {c.description}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-400">
                        ages {c.minAge}-{c.maxAge} · {c.difficulty} ·{' '}
                        {readableCadenceShort(c.cadence)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="money-amt text-base">
                        {money(c.amountCents, c.currency)}
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
            {chosen.length} of {suggestions.length} picked · est.{' '}
            <strong>{money(totalWeeklyEstimateCents, currency)}</strong>{' '}
            per week if every chore is completed.
          </p>
        </>
      )}

      <div className="mt-8 flex justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={chosen.length === 0}
          onClick={() => onContinue(suggestions)}
        >
          Continue
        </button>
      </div>
    </>
  );
}

/**
 * Cadence-aware "weekly take if completed every time" estimate. Used
 * only in the wizard summary line so a parent eyeballing the starter
 * pack can sanity-check the total spend.
 */
function estimateWeeklyCents(c: ChoreSuggestion): number {
  switch (c.cadence.kind) {
    case 'daily':
      return c.amountCents * 7 * c.cadence.times.length;
    case 'weekly':
      return c.amountCents * c.cadence.days.length;
    case 'every_n_days':
      return Math.round((c.amountCents * 7) / Math.max(1, c.cadence.n));
    case 'every_n_weeks':
      return Math.round(
        (c.amountCents * c.cadence.days.length) / Math.max(1, c.cadence.n),
      );
    case 'monthly_dom':
    case 'monthly_nth':
      return Math.round(c.amountCents / 4);
    default:
      return c.amountCents;
  }
}

function readableCadenceShort(c: ChoreSuggestion['cadence']): string {
  switch (c.kind) {
    case 'daily':
      return c.times.length === 1 ? 'daily' : `${c.times.length}× daily`;
    case 'weekly':
      return c.days.length === 7 ? 'every day' : `${c.days.length}× per week`;
    case 'every_n_days':
      return `every ${c.n} days`;
    case 'every_n_weeks':
      return c.n === 2 ? 'fortnightly' : `every ${c.n} weeks`;
    case 'monthly_dom':
    case 'monthly_nth':
      return 'monthly';
    default:
      return '';
  }
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
