import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { PairingIssuance } from '../lib/types';
import { toastError, toastSuccess } from './Toast';

/**
 * Shared "show this 6-digit code on the kitchen tablet" modal.
 *
 * Used in two places:
 *   • AdminFamily → Paired devices → Generate code (PR 4).
 *   • OnboardWizard → step 4 (PR 5).
 *
 * Issues a fresh pairing on first open via POST /api/family/pairings, shows
 * the plaintext code in 64px monospace with a 10-minute SVG countdown ring,
 * and lets the parent copy the code or regenerate. The plaintext is only
 * available in the response of the mutation — when the modal closes we
 * forget it.
 */
export function PairingCodeModal({
  open,
  onClose,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful issue — the parent caller can refresh the
   *  Paired-devices list, mark the wizard step as fulfilled, etc. */
  onIssued?: (issuance: PairingIssuance) => void;
}) {
  const qc = useQueryClient();
  const [issuance, setIssuance] = useState<PairingIssuance | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = useMutation({
    mutationFn: () => api.post<PairingIssuance>('/api/family/pairings', {}),
    onSuccess: (data) => {
      setIssuance(data);
      onIssued?.(data);
      qc.invalidateQueries({ queryKey: ['device-pairings'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError("Couldn't generate code", err.message);
    },
  });

  // Issue exactly once when the modal opens. If the parent re-opens the
  // modal later we issue a fresh code (single-use, single-show contract).
  useEffect(() => {
    if (open && !issuance && !issue.isPending) {
      issue.mutate();
    }
    if (!open) {
      setIssuance(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Pair a kitchen tablet"
    >
      <div
        className="card relative w-full max-w-md p-6 sm:max-w-lg sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-tag mb-2">PAIR A KITCHEN TABLET</div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          Show this on the tablet
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          Open <span className="font-semibold text-ink-900">app.choreboard.io/kid</span>{' '}
          on the kitchen tablet and enter this code. It only works once and
          expires when the timer runs out.
        </p>

        {issue.isPending && (
          <div className="mt-6 grid h-44 place-items-center text-ink-500">
            Generating…
          </div>
        )}

        {issuance && (
          <div className="mt-6 grid grid-cols-[1fr_auto] items-center gap-6">
            <CodeDisplay code={issuance.code} />
            <CountdownRing
              expiresAtISO={issuance.pairing.expiresAt}
              onExpire={() => issue.mutate()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={!issuance || issue.isPending}
            onClick={async () => {
              if (!issuance) return;
              try {
                await navigator.clipboard.writeText(issuance.code);
                setCopied(true);
                toastSuccess('Code copied');
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toastError("Couldn't copy", 'Read the code aloud instead.');
              }
            }}
          >
            {copied ? 'Copied!' : 'Copy code'}
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>

        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-ink-400 hover:bg-ink-900/5 hover:text-ink-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function CodeDisplay({ code }: { code: string }) {
  return (
    <div
      aria-label={`Pairing code ${code.split('').join(' ')}`}
      className="font-display text-[44px] font-extrabold tabular-nums tracking-[0.18em] text-money sm:text-[56px]"
    >
      {code}
    </div>
  );
}

function CountdownRing({
  expiresAtISO,
  onExpire,
}: {
  expiresAtISO: string;
  onExpire?: () => void;
}) {
  const expiresAtMs = useMemo(() => new Date(expiresAtISO).getTime(), [expiresAtISO]);
  const totalMs = useMemo(() => Math.max(1, expiresAtMs - Date.now()), [expiresAtMs]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, expiresAtMs - now);
  const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
  const expired = remainingMs <= 0;

  useEffect(() => {
    if (expired && onExpire) onExpire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const r = 28;
  const C = 2 * Math.PI * r;
  const dash = C * fraction;

  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  const label = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="relative grid h-20 w-20 place-items-center">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} stroke="rgba(16,24,43,0.12)" strokeWidth="6" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={r}
          stroke={expired ? '#A6A9B5' : '#0F6E37'}
          strokeWidth="6"
          fill="none"
          strokeDasharray={`${dash} ${C}`}
          strokeDashoffset={C / 4}
          strokeLinecap="round"
          style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }}
        />
      </svg>
      <span className="absolute font-display text-xs font-bold tabular-nums text-ink-700">
        {label}
      </span>
    </div>
  );
}
