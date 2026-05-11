import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Kid } from '../lib/types';
import { MemberAvatar, PageTag, Wordmark } from '../ui/primitives';

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

  const layout = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col p-6">
      <header className="mb-8 flex items-start justify-between">
        <Wordmark size="md" />
        <PageTag index={4} label="PIN SIGN-IN" title="Who's here?" />
      </header>
      <div className="flex flex-1 items-start justify-center">{children}</div>
    </div>
  );

  if (!familyId) {
    return layout(
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Find your family
          </h1>
          <Link to="/" className="pill">
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
          <button className="btn-primary" disabled={findFamily.isPending}>
            Continue
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
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-4xl font-extrabold tracking-tight">
            Who's here?
          </h2>
          <button
            className="pill"
            onClick={() => {
              localStorage.removeItem('cb_family_id');
              setFamilyId(null);
            }}
          >
            Switch family
          </button>
        </div>
        {kidsQ.isLoading && <p className="text-ink-500">Loading…</p>}
        {kidsQ.data && kidsQ.data.length === 0 && (
          <p className="text-ink-500">
            No kids set up yet. Ask a parent to add you in the admin screen.
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          {kidsQ.data?.map((k) => (
            <button
              key={k.id}
              onClick={() => setSelectedKid(k)}
              className="card flex w-28 flex-col items-center gap-2 p-4 transition hover:-translate-y-0.5"
            >
              <MemberAvatar name={k.name} color={k.color} size="lg" />
              <span className="text-sm font-semibold">{k.name}</span>
              <span className="page-tag">KID</span>
            </button>
          ))}
        </div>
      </div>,
    );
  }

  return layout(
    <div className="w-full max-w-md text-center">
      <button
        className="pill mb-4"
        onClick={() => {
          setSelectedKid(null);
          setPin('');
        }}
      >
        ← Not me
      </button>
      <div className="flex flex-col items-center gap-3">
        <div className="page-tag">WELCOME BACK</div>
        <div className="flex items-center gap-3">
          <MemberAvatar name={selectedKid.name} color={selectedKid.color} size="md" />
          <span className="font-display text-3xl font-extrabold tracking-tight">
            {selectedKid.name}
          </span>
        </div>
      </div>

      <div className="my-6 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl font-bold ring-2 ring-ink-900 ${
              pin[i]
                ? 'bg-ink-900 text-cream-50'
                : 'bg-paper text-ink-300'
            }`}
          >
            {pin[i] ? '•' : ''}
          </span>
        ))}
      </div>

      <div className="mx-auto grid w-72 grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => pin.length < 4 && setPin(pin + String(n))}
            className="rounded-2xl bg-paper py-4 text-2xl font-bold text-ink-900 ring-2 ring-ink-900 shadow-paper-sm transition active:translate-y-px hover:bg-cream-50"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="rounded-2xl bg-paper py-4 text-sm font-semibold text-ink-700 ring-2 ring-ink-900 shadow-paper-sm hover:bg-cream-50"
        >
          clear
        </button>
        <button
          onClick={() => pin.length < 4 && setPin(pin + '0')}
          className="rounded-2xl bg-paper py-4 text-2xl font-bold text-ink-900 ring-2 ring-ink-900 shadow-paper-sm hover:bg-cream-50"
        >
          0
        </button>
        <button
          onClick={() => setPin(pin.slice(0, -1))}
          className="rounded-2xl bg-paper py-4 text-sm font-semibold text-ink-700 ring-2 ring-ink-900 shadow-paper-sm hover:bg-cream-50"
        >
          ←
        </button>
      </div>

      <button
        className="btn-primary mt-6 w-full"
        disabled={pin.length !== 4 || loginMut.isPending}
        onClick={() => loginMut.mutate()}
      >
        {loginMut.isPending ? '...' : 'Sign in'}
      </button>
      {loginMut.error instanceof ApiError && (
        <p className="mt-3 text-sm text-accent-red">
          {loginMut.error.message === 'invalid_pin'
            ? 'Wrong PIN. Try again.'
            : loginMut.error.message}
        </p>
      )}
    </div>,
  );
}
