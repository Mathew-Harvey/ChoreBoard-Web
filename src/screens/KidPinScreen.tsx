import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Kid } from '../lib/types';
import { MemberAvatar, PageTag, Wordmark } from '../ui/primitives';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';

/**
 * The "kid sign-in" path. v1 expects the device to be paired with a family
 * already (so a kid sees their family roster). For first-run on a new device,
 * a parent enters the family name; in a closed-beta context that's enough.
 */
export function KidPinScreen() {
  const [familyName, setFamilyName] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('cb_family_id') : null,
  );
  const [selectedKid, setSelectedKid] = useState<Kid | null>(null);
  const [pin, setPin] = useState('');
  const qc = useQueryClient();

  const findFamily = useMutation({
    mutationFn: async () => {
      const r = await api.get<{ families: Array<{ id: string; name: string }> }>(
        `/api/auth/families?q=${encodeURIComponent(familyName)}`,
      );
      return r.families;
    },
    onSuccess: (fams) => {
      if (fams.length === 1) {
        const id = fams[0]?.id;
        if (id) {
          localStorage.setItem('cb_family_id', id);
          setFamilyId(id);
        }
      }
    },
  });

  const kidsQ = useQuery({
    queryKey: ['kid-roster', familyId],
    queryFn: async () => {
      const r = await api.get<{ kids: Kid[] }>(`/api/auth/family/${familyId}/kids`);
      return r.kids;
    },
    enabled: !!familyId,
  });

  const loginMut = useMutation({
    mutationFn: () => api.post('/api/auth/kid-login', { kidId: selectedKid!.id, pin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });

  // Auto-submit when the kid finishes the 4th digit. Avoids a redundant tap.
  useEffect(() => {
    if (selectedKid && pin.length === 4 && !loginMut.isPending) {
      loginMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selectedKid]);

  // Reset PIN on a failed attempt so the next attempt is clean.
  useEffect(() => {
    if (loginMut.error) setPin('');
  }, [loginMut.error]);

  const layout = (children: React.ReactNode) => (
    <div className="safe-pt safe-pb flex min-h-screen flex-col px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-6 flex items-start justify-between sm:mb-10">
        <Wordmark size="lg" />
        <PageTag index={4} label="PIN SIGN-IN" title="Who's here?" />
      </header>
      <div className="flex flex-1 items-start justify-center">{children}</div>
      <nav
        className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-ink-500"
        aria-label="Legal"
      >
        <Link to="/privacy" className="hover:text-ink-900 hover:underline">
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms" className="hover:text-ink-900 hover:underline">
          Terms
        </Link>
        <span aria-hidden="true">·</span>
        <a
          href="mailto:support@choreboard.io"
          className="hover:text-ink-900 hover:underline"
        >
          support@choreboard.io
        </a>
      </nav>
    </div>
  );

  if (!familyId) {
    return layout(
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Find your family
          </h1>
          <Link to="/" className="pill-tap whitespace-nowrap">
            Parent sign-in →
          </Link>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            findFamily.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <input
            className="input"
            placeholder="Family name (e.g. The Donovans)"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            required
          />
          <button className="btn-primary w-full" disabled={findFamily.isPending}>
            {findFamily.isPending ? 'Looking…' : 'Continue'}
          </button>
          {findFamily.data && findFamily.data.length === 0 && (
            <p className="text-sm text-accent-red">No family by that name.</p>
          )}
          {findFamily.data && findFamily.data.length > 1 && (
            <ul className="flex flex-col gap-2">
              {findFamily.data.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => {
                      localStorage.setItem('cb_family_id', f.id);
                      setFamilyId(f.id);
                    }}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </div>,
    );
  }

  if (!selectedKid) {
    return layout(
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <div className="page-tag mb-1">WELCOME</div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              Who&apos;s here?
            </h2>
          </div>
          <button
            className="pill-tap self-start whitespace-nowrap sm:self-end"
            onClick={() => {
              localStorage.removeItem('cb_family_id');
              setFamilyId(null);
            }}
          >
            Switch family
          </button>
        </div>
        {kidsQ.isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card flex flex-col items-center gap-3 p-4 sm:p-5">
                <Skeleton width={80} height={80} radius={999} />
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={10} />
              </div>
            ))}
          </div>
        )}
        {kidsQ.data && kidsQ.data.length === 0 && (
          <div className="card p-6">
            <EmptyState
              illustration="kids"
              title="No kids set up yet"
              body="Ask a parent to add you in the family admin screen."
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7">
          {kidsQ.data?.map((k) => (
            <button
              key={k.id}
              onClick={() => setSelectedKid(k)}
              className="card group flex flex-col items-center gap-3 p-4 transition active:translate-y-px hover:-translate-y-0.5 sm:p-5 lg:p-6"
            >
              <MemberAvatar name={k.name} color={k.color} size="xl" />
              <span className="font-display text-base font-extrabold sm:text-lg lg:text-xl">
                {k.name}
              </span>
              <span className="page-tag">TAP TO SIGN IN</span>
            </button>
          ))}
        </div>
      </div>,
    );
  }

  return layout(
    <div className="w-full max-w-md text-center sm:max-w-lg">
      <button
        className="pill-tap mb-4"
        onClick={() => {
          setSelectedKid(null);
          setPin('');
        }}
      >
        ← Not me
      </button>
      <div className="flex flex-col items-center gap-3">
        <div className="page-tag">WELCOME BACK</div>
        <MemberAvatar name={selectedKid.name} color={selectedKid.color} size="2xl" />
        <span className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {selectedKid.name}
        </span>
      </div>

      <div className="my-6 flex justify-center gap-3 sm:my-8 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl font-bold ring-2 ring-ink-900 transition-transform sm:h-16 sm:w-16 sm:text-4xl ${
              pin[i]
                ? 'animate-pop bg-ink-900 text-cream-50'
                : 'bg-paper text-ink-300'
            }`}
            aria-label={pin[i] ? 'digit entered' : 'empty digit'}
          >
            {pin[i] ? '•' : ''}
          </span>
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[20rem] grid-cols-3 gap-3 sm:max-w-[22rem] sm:gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => pin.length < 4 && setPin(pin + String(n))}
            className="aspect-square rounded-2xl bg-paper text-2xl font-bold text-ink-900 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50 sm:text-3xl"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="aspect-square rounded-2xl bg-paper text-sm font-semibold text-ink-700 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50"
        >
          clear
        </button>
        <button
          onClick={() => pin.length < 4 && setPin(pin + '0')}
          className="aspect-square rounded-2xl bg-paper text-2xl font-bold text-ink-900 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50 sm:text-3xl"
        >
          0
        </button>
        <button
          onClick={() => setPin(pin.slice(0, -1))}
          className="aspect-square rounded-2xl bg-paper text-sm font-semibold text-ink-700 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50"
        >
          ←
        </button>
      </div>

      {loginMut.error instanceof ApiError && (
        <p className="mt-4 rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
          {loginMut.error.message === 'invalid_pin'
            ? 'Wrong PIN. Try again.'
            : loginMut.error.message}
        </p>
      )}
      {loginMut.isPending && (
        <p className="mt-4 text-sm font-semibold text-ink-500">Signing in…</p>
      )}
    </div>,
  );
}
