import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { PublicInvite } from '../lib/types';
import { Wordmark } from '../ui/primitives';

/**
 * Public co-parent join flow. The token comes from the URL the owner shared
 * out-of-band; we don't require the joiner to be signed in (and if they are,
 * we still create a fresh user — this is for a *second* parent on a
 * different account, not for linking).
 */
export function JoinFamilyScreen() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const inviteQ = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<{ invite: PublicInvite }>(`/api/auth/invites/${token}`),
    enabled: !!token,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      api.post(`/api/auth/invites/${token}/accept`, { name, email, password }),
    onSuccess: async () => {
      try {
        localStorage.setItem('cb_terms_accepted_at', new Date().toISOString());
        localStorage.setItem('cb_terms_version', '2026-05-12');
      } catch {
        // Storage can throw in private mode; the consent timestamp is a
        // nice-to-have and doesn't gate the flow.
      }
      await qc.invalidateQueries({ queryKey: ['session'] });
      navigate('/', { replace: true });
    },
  });

  const apiErr = (inviteQ.error instanceof ApiError && inviteQ.error) || null;
  const acceptErr = accept.error instanceof ApiError ? accept.error : null;
  const canSubmit =
    acceptedTerms && name.trim() && /.+@.+/.test(email) && password.length >= 8;

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

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 py-8 sm:max-w-lg sm:py-12">
        <header className="mb-6 flex items-center justify-between sm:mb-10">
          <Wordmark size="lg" />
          <Link to="/" className="pill-tap">
            Sign in instead →
          </Link>
        </header>

        <main className="flex-1">
          <div className="card p-6 sm:p-8 lg:p-10">
            <div className="page-tag mb-2">01 — JOIN FAMILY</div>

            {inviteQ.isLoading && (
              <p className="mt-4 text-ink-500">Checking your invite…</p>
            )}

            {apiErr && (
              <InviteError status={apiErr.status} reason={apiErr.message} />
            )}

            {inviteQ.data && (
              <>
                <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                  Join the {inviteQ.data.invite.familyName}
                </h1>
                <p className="mt-2 text-sm text-ink-500 sm:text-base">
                  {inviteQ.data.invite.invitedByName
                    ? `${inviteQ.data.invite.invitedByName} invited you to co-parent on ChoreBoard.`
                    : 'You were invited to co-parent on ChoreBoard.'}
                </p>

                {accept.isSuccess ? (
                  <p className="mt-6 rounded-xl bg-money/15 px-4 py-3 text-sm text-ink-900 ring-2 ring-ink-900/20">
                    You’re in. Loading the family dashboard…
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      accept.mutate();
                    }}
                    className="mt-6 flex flex-col gap-3"
                  >
                    <Field label="Your name">
                      <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoComplete="name"
                        placeholder="e.g. Sam"
                      />
                    </Field>
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
                        autoComplete="new-password"
                        className="input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                    </Field>
                    <label className="mt-1 flex items-start gap-3 rounded-xl bg-cream-50 px-3 py-3 text-sm text-ink-700 ring-2 ring-ink-900/15">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        required
                        className="mt-1 h-4 w-4 shrink-0 accent-ink-900"
                      />
                      <span className="leading-snug">
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
                        .
                      </span>
                    </label>
                    {acceptErr && (
                      <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
                        {explainAcceptError(acceptErr)}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="btn-primary mt-2 w-full"
                      disabled={accept.isPending || !canSubmit}
                      title={!canSubmit ? 'Fill every field and accept the terms.' : undefined}
                    >
                      {accept.isPending ? 'Joining…' : 'Join family'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          <p className="mt-6 text-balance text-center text-xs text-ink-500 sm:text-sm">
            Already a ChoreBoard parent? Ask your co-parent for a fresh invite —
            invites create a new sign-in for this household.
          </p>
        </main>
      </div>
    </div>
  );
}

function InviteError({ status, reason }: { status: number; reason: string }) {
  const { title, body } = explainLookupError(status, reason);
  return (
    <div className="mt-4 rounded-xl bg-accent-red/10 p-4 ring-2 ring-accent-red/30">
      <p className="font-display text-lg font-extrabold text-ink-900">{title}</p>
      <p className="mt-1 text-sm text-ink-700">{body}</p>
      <Link to="/" className="btn-ghost mt-3 inline-flex">
        Go to sign-in
      </Link>
    </div>
  );
}

function explainLookupError(status: number, reason: string): { title: string; body: string } {
  if (status === 404) {
    return {
      title: 'This invite link isn’t valid',
      body: 'Double-check the URL, or ask the owner to send a fresh one.',
    };
  }
  if (reason === 'invite_consumed') {
    return {
      title: 'This invite was already used',
      body: 'Sign in with the email you used last time, or ask the owner for a new invite.',
    };
  }
  if (reason === 'invite_revoked') {
    return {
      title: 'This invite was revoked',
      body: 'Ask the owner to generate a new join link.',
    };
  }
  if (reason === 'invite_expired') {
    return {
      title: 'This invite has expired',
      body: 'Invites are valid for 7 days. Ask the owner for a fresh one.',
    };
  }
  return { title: 'Something went wrong', body: reason };
}

function explainAcceptError(err: ApiError): string {
  if (err.message === 'email_taken') {
    return 'That email is already in use. Try signing in instead, or use a different address.';
  }
  if (err.status === 410) {
    return 'This invite is no longer valid. Ask the owner to send a fresh link.';
  }
  return err.message;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {children}
    </label>
  );
}
