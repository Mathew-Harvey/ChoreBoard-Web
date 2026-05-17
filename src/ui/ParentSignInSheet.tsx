import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { ParentPrincipal } from '../lib/types';

const LAST_PARENT_EMAIL_KEY = 'cb_last_paired_parent_email';

type ElevateResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'owner' | 'parent';
    familyId: string;
    color: string;
    gender: ParentPrincipal['gender'];
  };
  session: {
    token: string;
    expiresAt: string;
    elevationExpiresAt: string;
  };
};

/**
 * "Sign me in to approve" sheet rendered on the kitchen tablet when a kid
 * principal needs a parent to clear an action (today: approve a pending
 * chore; the same component can be reused for any future parent-only
 * gate). Reuses the same modal shape and timing as `IdentityPrompt`:
 *   - Bottom sheet on phone, centered modal on tablet (handled by the
 *     responsive max-width).
 *   - 240ms fade-in / fade-out via `animate-floatIn`.
 *   - Email pre-filled from `cb_last_paired_parent_email` if a previous
 *     elevation on this device cached one. Clears on revoke (PR 4 already
 *     wipes the device session, which forces a fresh pair).
 *
 * On success the API stamps the new session with elevation_expires_at and
 * the SPA's session query is invalidated so every subsequent write is
 * authorised as the elevated parent until the timer runs out.
 */
export function ParentSignInSheet({
  open,
  context,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  /** One-line context to remind the parent why we're prompting. e.g.
   *  `"Skye finished Empty the dishwasher. Approve from here?"`. */
  context?: string;
  onCancel: () => void;
  onSuccess?: (resp: ElevateResponse) => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(LAST_PARENT_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');

  // Reset password (never email) every time the sheet closes.
  useEffect(() => {
    if (!open) setPassword('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      api.post<ElevateResponse>('/api/auth/elevate', { email, password }),
    onSuccess: (data) => {
      try {
        localStorage.setItem(LAST_PARENT_EMAIL_KEY, data.user.email);
      } catch {
        // non-fatal — the elevation already worked
      }
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      window.dispatchEvent(
        new CustomEvent('cb:parent.elevated', { detail: { user: data.user, session: data.session } }),
      );
      onSuccess?.(data);
      onCancel();
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-end bg-ink-900/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onCancel}
      role="dialog"
      aria-label="Sign me in to approve"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-chunky bg-paper p-6 ring-2 ring-ink-900 shadow-paper sm:rounded-chunky sm:p-7 animate-floatIn"
      >
        <div className="page-tag mb-2">02 — APPROVE</div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          A parent is needed
        </h2>
        {context && <p className="mt-2 text-sm text-ink-500">{context}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email && password.length >= 8) mut.mutate();
          }}
          className="mt-5 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-ink-900">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-ink-900">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              autoFocus={!!email}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {mut.error instanceof ApiError && (
            <p className="rounded-lg bg-accent-red/10 px-3 py-2 text-sm text-accent-red ring-1 ring-accent-red/30">
              {mut.error.message === 'invalid_credentials'
                ? 'Email or password is wrong.'
                : mut.error.message}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary mt-2 w-full"
            disabled={mut.isPending || !email || password.length < 8}
          >
            {mut.isPending ? 'Signing in…' : 'Sign in to approve'}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={onCancel}
            disabled={mut.isPending}
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
