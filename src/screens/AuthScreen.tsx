import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Wordmark } from '../ui/primitives';

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const qc = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [timezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney',
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'login') {
        return api.post('/api/auth/login', { email, password });
      }
      return api.post('/api/auth/signup', { email, password, name, familyName, timezone });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const apiErr = mut.error instanceof ApiError ? mut.error : null;

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center justify-between">
          <Wordmark size="lg" />
          <Link to="/kid" className="pill">
            I'm a kid →
          </Link>
        </div>

        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
          {mode === 'login' ? 'Welcome back' : 'Start a family'}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {mode === 'login'
            ? 'Sign in to your family dashboard.'
            : 'Create your household and we’ll seed the default chore catalog.'}
        </p>

        <div className="mt-5 inline-flex rounded-xl bg-cream-200 p-1 ring-2 ring-ink-900">
          <button
            onClick={() => setMode('login')}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              mode === 'login' ? 'bg-ink-900 text-cream-50' : 'text-ink-700'
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              mode === 'signup' ? 'bg-ink-900 text-cream-50' : 'text-ink-700'
            }`}
          >
            Create family
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="mt-6 flex flex-col gap-3"
        >
          {mode === 'signup' && (
            <>
              <Field label="Your name">
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Matt"
                />
              </Field>
              <Field label="Family name">
                <input
                  className="input"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  required
                  placeholder="e.g. The Donovans"
                />
              </Field>
            </>
          )}
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          {apiErr && (
            <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
              {apiErr.message === 'invalid_credentials'
                ? 'Email or password is incorrect.'
                : apiErr.message === 'email_taken'
                  ? 'That email is already in use.'
                  : apiErr.message}
            </p>
          )}
          <button type="submit" className="btn-primary mt-2" disabled={mut.isPending}>
            {mut.isPending ? '...' : mode === 'login' ? 'Log in' : 'Create family'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          Parents sign in with email + password. Kids sign in on a shared family
          device with a 4-digit PIN.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {children}
    </label>
  );
}
