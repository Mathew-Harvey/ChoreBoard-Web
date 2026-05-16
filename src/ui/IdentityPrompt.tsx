import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Kid, MemberType, Parent, Principal } from '../lib/types';
import { MemberAvatar } from './primitives';
import { StreakChip } from './StreakChip';
import { rollupByKey } from '../lib/useFamilyMemberStats';

/**
 * Identity confirmation prompt for the kitchen-wall touchscreen.
 *
 * The wall iPad is a shared device — at any given moment a parent could be
 * signed in, or a kid could be, or nobody important. Every interactive action
 * on TV mode therefore re-asks "who's this?" up front so kids and siblings
 * can't claim each other's chores by accident.
 *
 * Resolution model:
 *   - If a parent is currently signed in, they can resolve as themselves
 *     instantly OR pick a kid to "claim for". The current parent session is
 *     kept; the API endpoints already accept member-target body params.
 *   - If a kid is currently signed in and they're picked, instant resolve.
 *   - Otherwise we PIN-login the target kid via `/api/auth/kid-login` and
 *     hand the new principal back so the caller's mutation runs as them.
 */
export type IdentityScope =
  | 'any'
  | { memberType: MemberType; memberId: string };

export type ResolvedIdentity = {
  memberType: MemberType;
  memberId: string;
  name: string;
  /** True when the API call should be made under the current parent session
   *  rather than swapping to the resolved member. */
  asParent: boolean;
};

export function IdentityPrompt({
  open,
  prompt,
  scope = 'any',
  kids,
  parents,
  currentPrincipal,
  memberLookup,
  onResolve,
  onCancel,
}: {
  open: boolean;
  prompt: string;
  scope?: IdentityScope;
  kids: Kid[];
  parents: Parent[];
  currentPrincipal: Principal | null | undefined;
  /** Optional per-member rollup so each tile can show that member's streak. */
  memberLookup?: ReturnType<typeof rollupByKey>;
  onResolve: (id: ResolvedIdentity) => void;
  onCancel: () => void;
}) {
  // ------------------------------------------------------------------- State
  const [pinKid, setPinKid] = useState<Kid | null>(null);
  const [pin, setPin] = useState('');
  const qc = useQueryClient();

  // Reset on open/close so a previous PIN attempt doesn't bleed across opens.
  useEffect(() => {
    if (!open) {
      setPinKid(null);
      setPin('');
    }
  }, [open]);

  // -------------------------------------------------------------- Mutations
  const login = useMutation({
    mutationFn: (input: { kidId: string; pin: string }) =>
      api.post('/api/auth/kid-login', input),
    onSuccess: (_d, vars) => {
      // The cookie has flipped. Invalidate session so the rest of the app
      // catches up; resolve to caller so they can fire the action.
      qc.invalidateQueries({ queryKey: ['session'] });
      const k = kids.find((kk) => kk.id === vars.kidId);
      if (!k) return onCancel();
      onResolve({
        memberType: 'kid',
        memberId: k.id,
        name: k.name,
        asParent: false,
      });
    },
  });

  // Auto-submit the moment the kid finishes entering 4 digits. Avoids a
  // redundant tap on the wall touchscreen.
  useEffect(() => {
    if (pinKid && pin.length === 4 && !login.isPending) {
      login.mutate({ kidId: pinKid.id, pin });
    }
  }, [pin, pinKid, login]);

  // Clear the PIN after a failed attempt so the kid can try again clean.
  useEffect(() => {
    if (login.error) setPin('');
  }, [login.error]);

  // ---------------------------------------------------------- Pick handlers
  const handlePickKid = (k: Kid) => {
    // If this kid is already the current session, short-circuit.
    if (currentPrincipal?.kind === 'kid' && currentPrincipal.kidId === k.id) {
      onResolve({ memberType: 'kid', memberId: k.id, name: k.name, asParent: false });
      return;
    }
    // Parent currently signed in can claim FOR this kid without PIN-swap.
    if (currentPrincipal?.kind === 'parent') {
      onResolve({ memberType: 'kid', memberId: k.id, name: k.name, asParent: true });
      return;
    }
    // Otherwise show the PIN pad.
    setPinKid(k);
    setPin('');
  };

  const handlePickParent = (p: Parent) => {
    if (currentPrincipal?.kind === 'parent' && currentPrincipal.userId === p.id) {
      onResolve({ memberType: 'user', memberId: p.id, name: p.name, asParent: false });
      return;
    }
    // Switching parents isn't possible from the wall (parents use email +
    // password). Tell the caller to surface a hint instead.
    onCancel();
  };

  // If scope locks us to a specific person, drive the right view directly.
  const scoped = useMemo(() => {
    if (scope === 'any') return null;
    if (scope.memberType === 'user') {
      const p = parents.find((x) => x.id === scope.memberId);
      return p ? { kind: 'parent' as const, parent: p } : null;
    }
    const k = kids.find((x) => x.id === scope.memberId);
    return k ? { kind: 'kid' as const, kid: k } : null;
  }, [scope, kids, parents]);

  // When scope is fixed to one kid, skip the roster and open the PIN pad.
  // When scope is fixed to a parent and they're the current session, resolve
  // immediately; otherwise cancel and let the caller surface a hint.
  useEffect(() => {
    if (!open || !scoped) return;
    if (scoped.kind === 'kid') {
      handlePickKid(scoped.kid);
    } else {
      handlePickParent(scoped.parent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scoped]);

  if (!open) return null;

  // --------------------------------------------------------------- Render
  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-stretch bg-ink-900/85 backdrop-blur-md safe-pb safe-pt"
      role="dialog"
      aria-modal="true"
      aria-label={prompt}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-4 px-6 pt-8 sm:px-12 sm:pt-12 lg:px-20">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-cream-50/55 sm:text-sm lg:text-base">
              {pinKid ? 'PIN' : 'TAP YOUR FACE'}
            </div>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-cream-50 sm:text-5xl lg:text-6xl">
              {pinKid ? `Hi, ${pinKid.name}` : prompt}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-cream-50/10 px-4 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 backdrop-blur transition hover:bg-cream-50/20 sm:text-sm"
          >
            Cancel
          </button>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-12 sm:py-12 lg:px-20">
          {!pinKid ? (
            <RosterPicker
              kids={kids}
              parents={parents}
              currentPrincipal={currentPrincipal}
              memberLookup={memberLookup}
              onPickKid={handlePickKid}
              onPickParent={handlePickParent}
            />
          ) : (
            <KidPinPad
              kid={pinKid}
              pin={pin}
              onPin={setPin}
              pending={login.isPending}
              error={
                login.error instanceof ApiError
                  ? login.error.message === 'invalid_pin'
                    ? 'Wrong PIN. Try again.'
                    : login.error.message
                  : null
              }
              onBack={() => {
                setPinKid(null);
                setPin('');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function RosterPicker({
  kids,
  parents,
  currentPrincipal,
  memberLookup,
  onPickKid,
  onPickParent,
}: {
  kids: Kid[];
  parents: Parent[];
  currentPrincipal: Principal | null | undefined;
  memberLookup?: ReturnType<typeof rollupByKey>;
  onPickKid: (k: Kid) => void;
  onPickParent: (p: Parent) => void;
}) {
  const currentKidId =
    currentPrincipal?.kind === 'kid' ? currentPrincipal.kidId : null;
  const currentParentId =
    currentPrincipal?.kind === 'parent' ? currentPrincipal.userId : null;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-10">
      <section>
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.28em] text-cream-50/55 sm:text-sm">
          Kids
        </div>
        {kids.length === 0 ? (
          <p className="text-cream-50/55">No kids set up yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 lg:gap-8 2xl:grid-cols-5 3xl:grid-cols-6">
            {kids.map((k) => {
              const isCurrent = k.id === currentKidId;
              const rollup = memberLookup?.get('kid', k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onPickKid(k)}
                  className={`group relative flex flex-col items-center gap-3 rounded-3xl bg-cream-50/8 p-5 ring-1 ring-cream-50/15 backdrop-blur transition active:translate-y-px hover:-translate-y-1 hover:bg-cream-50/15 sm:p-6 lg:p-7 ${
                    isCurrent ? 'outline outline-2 outline-money' : ''
                  }`}
                >
                  <MemberAvatar name={k.name} color={k.color} size="2xl" />
                  <div className="font-display text-2xl font-extrabold text-cream-50 sm:text-3xl lg:text-4xl">
                    {k.name}
                  </div>
                  {rollup && (
                    <StreakChip
                      streak={rollup.stats.streak}
                      bestStreak={rollup.stats.bestStreak}
                      size="sm"
                      tone="dark"
                    />
                  )}
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cream-50/55 sm:text-xs">
                    {isCurrent ? 'Signed in — tap to use' : 'Tap, then enter PIN'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {parents.length > 0 && (
        <section>
          <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.28em] text-cream-50/55 sm:text-sm">
            Parents
          </div>
          <div className="flex flex-wrap gap-3 sm:gap-4">
            {parents.map((p) => {
              const isCurrent = p.id === currentParentId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPickParent(p)}
                  disabled={!isCurrent}
                  className={`flex items-center gap-3 rounded-full bg-cream-50/8 px-4 py-2 ring-1 ring-cream-50/15 backdrop-blur transition ${
                    isCurrent
                      ? 'hover:bg-cream-50/15'
                      : 'cursor-not-allowed opacity-50'
                  }`}
                  title={
                    isCurrent
                      ? 'Tap to confirm as this parent'
                      : 'Open the app on your phone to act as this parent'
                  }
                >
                  <MemberAvatar name={p.name} color={p.color} size="md" />
                  <span className="font-display text-base font-extrabold text-cream-50 sm:text-lg">
                    {p.name}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-money px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      You
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function KidPinPad({
  kid,
  pin,
  onPin,
  pending,
  error,
  onBack,
}: {
  kid: Kid;
  pin: string;
  onPin: (p: string) => void;
  pending: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-8">
      <button
        type="button"
        onClick={onBack}
        className="-mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-cream-50/10 px-4 text-xs font-bold uppercase tracking-wider text-cream-50 ring-1 ring-cream-50/20 backdrop-blur transition hover:bg-cream-50/20 sm:text-sm"
      >
        ← Not me
      </button>
      <MemberAvatar name={kid.name} color={kid.color} size="3xl" />
      <div className="flex justify-center gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid h-16 w-16 place-items-center rounded-2xl text-4xl font-bold ring-2 ring-cream-50/30 transition-transform sm:h-20 sm:w-20 sm:text-5xl ${
              pin[i]
                ? 'animate-pop bg-cream-50 text-ink-900'
                : 'bg-cream-50/5 text-cream-50/30'
            }`}
            aria-label={pin[i] ? 'digit entered' : 'empty digit'}
          >
            {pin[i] ? '•' : ''}
          </span>
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[24rem] grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pin.length < 4 && onPin(pin + String(n))}
            className="aspect-square rounded-2xl bg-cream-50/10 text-3xl font-bold text-cream-50 ring-1 ring-cream-50/20 backdrop-blur transition active:translate-y-px hover:bg-cream-50/20 sm:text-4xl"
            disabled={pending}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPin('')}
          className="aspect-square rounded-2xl bg-cream-50/5 text-sm font-semibold text-cream-50/70 ring-1 ring-cream-50/15 transition active:translate-y-px hover:bg-cream-50/15"
          disabled={pending}
        >
          clear
        </button>
        <button
          type="button"
          onClick={() => pin.length < 4 && onPin(pin + '0')}
          className="aspect-square rounded-2xl bg-cream-50/10 text-3xl font-bold text-cream-50 ring-1 ring-cream-50/20 backdrop-blur transition active:translate-y-px hover:bg-cream-50/20 sm:text-4xl"
          disabled={pending}
        >
          0
        </button>
        <button
          type="button"
          onClick={() => onPin(pin.slice(0, -1))}
          className="aspect-square rounded-2xl bg-cream-50/5 text-sm font-semibold text-cream-50/70 ring-1 ring-cream-50/15 transition active:translate-y-px hover:bg-cream-50/15"
          disabled={pending}
        >
          ←
        </button>
      </div>

      {pending && (
        <p className="text-sm font-semibold text-cream-50/70">Signing in…</p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-accent-red/15 px-4 py-2 text-sm font-semibold text-accent-red ring-1 ring-accent-red/30"
        >
          {error}
        </p>
      )}
    </div>
  );
}
