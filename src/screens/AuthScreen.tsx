import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { localeGuess } from '../lib/locale';
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
  // Country / currency snapshot from `navigator.language` + timezone. We
  // post these alongside the signup so the chore-suggestion engine can
  // pick the right local-currency base rates from the very first second
  // of the wizard. The values are non-blocking and overridable in
  // Admin → Family — see `lib/locale.ts` for the detection chain.
  const [locale] = useState(() => localeGuess());
  // Required at signup. Stored locally so we have a record of when the
  // Owner accepted, until we land a /api/auth endpoint that captures it
  // server-side.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'login') {
        return api.post('/api/auth/login', { email, password });
      }
      return api.post('/api/auth/signup', {
        email,
        password,
        name,
        familyName,
        timezone,
        // Gender stays 'unspecified' at signup — we ask later, on the
        // member dashboard, where the picker has actual context.
        gender: 'unspecified',
        // Either locale.country / locale.currency is null (e.g. 'en' tag
        // with no region, no Intl support) or both are set together.
        // The API treats these as optional and falls back to US/USD if
        // missing, so passing nulls is safe.
        ...(locale.country ? { country: locale.country } : {}),
        ...(locale.currency ? { currency: locale.currency } : {}),
      });
    },
    onSuccess: () => {
      if (mode === 'signup') {
        try {
          localStorage.setItem('cb_terms_accepted_at', new Date().toISOString());
          localStorage.setItem('cb_terms_version', '2026-05-12');
        } catch {
          // Storage can throw in private mode; the consent timestamp is a nice-to-have.
        }
      }
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const apiErr = mut.error instanceof ApiError ? mut.error : null;
  const canSubmit = mode === 'login' || acceptedTerms;

  return (
    <div className="safe-pt safe-pb relative min-h-screen overflow-hidden">
      {/* Decorative paper-style hero blob behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-[60%] bg-accent-orange/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] right-[-100px] h-[420px] w-[420px] rounded-full bg-money/15 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 py-8 sm:max-w-lg sm:py-12">
        <header className="mb-6 flex items-center justify-between sm:mb-10">
          <Wordmark size="lg" />
          <Link to="/kid" className="pill-tap">
            I&apos;m a kid →
          </Link>
        </header>

        <main className="flex-1">
          <div className="card p-6 sm:p-8 lg:p-10">
            <div className="page-tag mb-2">
              {mode === 'login' ? '01 — SIGN IN' : '01 — NEW FAMILY'}
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
              {mode === 'login' ? 'Welcome back' : 'Start a family'}
            </h1>
            <p className="mt-2 text-sm text-ink-500 sm:text-base">
              {mode === 'login'
                ? 'Sign in to your family dashboard.'
                : 'Create your household and we’ll seed the default chore catalog.'}
            </p>

            <div
              className="mt-5 inline-flex rounded-xl bg-cream-200 p-1 ring-2 ring-ink-900"
              role="tablist"
            >
              <button
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => setMode('login')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'login' ? 'bg-ink-900 text-cream-50' : 'text-ink-700'
                }`}
              >
                Log in
              </button>
              <button
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => setMode('signup')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
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
              {mode === 'signup' && (
                <label className="mt-1 flex items-start gap-3 rounded-xl bg-cream-50 px-3 py-3 text-sm text-ink-700 ring-2 ring-ink-900/15">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    required
                    className="mt-1 h-4 w-4 shrink-0 accent-ink-900"
                    aria-describedby="cb-terms-help"
                  />
                  <span id="cb-terms-help" className="leading-snug">
                    I&apos;m an adult and I accept the{' '}
                    <Link
                      to="/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-ink-900 underline decoration-ink-900/30 decoration-2 underline-offset-2 hover:decoration-ink-900"
                    >
                      Terms of Service
                    </Link>{' '}
                    and the{' '}
                    <Link
                      to="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-ink-900 underline decoration-ink-900/30 decoration-2 underline-offset-2 hover:decoration-ink-900"
                    >
                      Privacy Policy
                    </Link>
                    , including on behalf of the children I&apos;ll add to my
                    family.
                  </span>
                </label>
              )}
              {apiErr && (
                <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
                  {apiErr.message === 'invalid_credentials'
                    ? 'Email or password is incorrect.'
                    : apiErr.message === 'email_taken'
                      ? 'That email is already in use.'
                      : apiErr.message}
                </p>
              )}
              <button
                type="submit"
                className="btn-primary mt-2 w-full"
                disabled={mut.isPending || !canSubmit}
                title={!canSubmit ? 'Please accept the Terms and Privacy Policy.' : undefined}
              >
                {mut.isPending ? 'Working…' : mode === 'login' ? 'Log in' : 'Create family'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-balance text-center text-xs text-ink-500 sm:text-sm">
            Parents sign in with email + password. Kids sign in on a shared family
            device with a 4-digit PIN.
          </p>

          <nav
            className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-ink-500"
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
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {children}
    </label>
  );
}
