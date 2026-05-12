import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { isNative, platform } from '../../lib/runtime';
import { useSession } from '../../lib/session';
import { toastError } from '../../ui/Toast';

/**
 * Billing tab. Owner-only — non-owner parents see a read-only summary.
 *
 * Surface gating (anti-steering):
 *   - Web build → only ever offers the Stripe Checkout flow.
 *   - Native iOS / Android → only ever offers the platform's IAP flow.
 *
 * The price is the same on every surface; we eat the platform fee on IAP.
 * That decision is documented in spec.md §16.4.
 */

type Plan = 'free' | 'family';
type Status = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
type Source = 'stripe' | 'apple' | 'google';

type BillingMe = {
  subscription: {
    plan: Plan;
    status: Status;
    source: Source | null;
    externalId: string | null;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
  };
  surfaces: { stripe: boolean; apple: boolean; google: boolean };
};

export function AdminBilling() {
  const session = useSession();
  const isOwner = session.data?.kind === 'parent' && session.data.role === 'owner';

  const me = useQuery({
    queryKey: ['billing-me'],
    queryFn: () => api.get<BillingMe>('/api/billing/me'),
  });

  const startStripe = useMutation({
    mutationFn: () => api.post<{ url: string }>('/api/billing/stripe/checkout'),
    onSuccess: (r) => {
      if (r?.url) window.location.assign(r.url);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t start checkout', err.message);
    },
  });

  const openPortal = useMutation({
    mutationFn: () => api.post<{ url: string }>('/api/billing/stripe/portal'),
    onSuccess: (r) => {
      if (r?.url) window.location.assign(r.url);
    },
    onError: (err) => {
      if (err instanceof ApiError) toastError('Couldn’t open billing portal', err.message);
    },
  });

  if (me.isLoading || !me.data) {
    return <p className="text-ink-500">Loading billing…</p>;
  }
  const sub = me.data.subscription;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <div className="page-tag mb-1">SUBSCRIPTION</div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Billing
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          ChoreBoard is free for up to 4 family members. The Family plan unlocks
          unlimited members, advanced gamification, and ledger CSV export.
        </p>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink-500">Current plan</p>
            <p className="font-display text-2xl font-extrabold sm:text-3xl">
              {sub.plan === 'family' ? 'Family' : 'Free'}
            </p>
          </div>
          <PlanBadge status={sub.status} source={sub.source} />
        </div>
        {sub.currentPeriodEnd && (
          <p className="mt-3 text-sm text-ink-500">
            {sub.cancelAt
              ? `Cancelling ${new Date(sub.cancelAt).toLocaleDateString()}`
              : `Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
            {sub.source ? ` · via ${sourceLabel(sub.source)}` : ''}
          </p>
        )}
      </section>

      {!isOwner && (
        <section className="card p-5 sm:p-6">
          <p className="text-sm text-ink-500">
            Only the family owner can change the subscription.
          </p>
        </section>
      )}

      {isOwner && sub.plan === 'free' && (
        <section className="card p-5 sm:p-6">
          <h3 className="mb-2 font-display text-xl font-extrabold sm:text-2xl">
            Upgrade to Family
          </h3>
          <p className="text-sm text-ink-500">
            Same price on web, iOS, and Android. {' '}
            {isNative()
              ? `Tap below to buy via ${platform() === 'ios' ? 'the App Store' : 'Google Play'}.`
              : 'Pay securely with card or Apple Pay via Stripe.'}
          </p>
          {isNative() ? (
            <NativeUpgradeButton />
          ) : (
            <button
              className="btn-primary mt-4 w-full sm:w-auto"
              onClick={() => startStripe.mutate()}
              disabled={startStripe.isPending || !me.data.surfaces.stripe}
              title={
                !me.data.surfaces.stripe
                  ? 'Stripe is not configured on the server yet.'
                  : undefined
              }
            >
              {startStripe.isPending ? 'Opening checkout…' : 'Upgrade'}
            </button>
          )}
          {!me.data.surfaces.stripe && !isNative() && (
            <p className="mt-3 text-xs text-ink-500">
              Web checkout will light up once <code>STRIPE_*</code> env vars are
              set on the API.
            </p>
          )}
        </section>
      )}

      {isOwner && sub.plan === 'family' && sub.source === 'stripe' && (
        <section className="card p-5 sm:p-6">
          <h3 className="mb-2 font-display text-xl font-extrabold sm:text-2xl">
            Manage subscription
          </h3>
          <p className="text-sm text-ink-500">
            Update payment method, change plan, or cancel via Stripe’s billing
            portal.
          </p>
          <button
            className="btn-primary mt-4 w-full sm:w-auto"
            onClick={() => openPortal.mutate()}
            disabled={openPortal.isPending}
          >
            {openPortal.isPending ? 'Opening…' : 'Open billing portal'}
          </button>
        </section>
      )}

      {isOwner && sub.plan === 'family' && sub.source && sub.source !== 'stripe' && (
        <section className="card p-5 sm:p-6">
          <h3 className="mb-2 font-display text-xl font-extrabold sm:text-2xl">
            Manage subscription
          </h3>
          <p className="text-sm text-ink-500">
            Your subscription is billed through{' '}
            <strong>{sourceLabel(sub.source)}</strong>. To change or cancel it,
            use {sub.source === 'apple'
              ? 'Settings → Apple ID → Subscriptions on your iPhone or iPad.'
              : 'Google Play → Profile → Payments & subscriptions on your Android device.'}
          </p>
        </section>
      )}
    </div>
  );
}

function PlanBadge({ status, source }: { status: Status; source: Source | null }) {
  const tone =
    status === 'active' || status === 'trialing'
      ? 'bg-money/15 text-money ring-money/30'
      : status === 'past_due'
        ? 'bg-accent-orange/15 text-accent-orange ring-accent-orange/30'
        : 'bg-ink-900/10 text-ink-500 ring-ink-900/15';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-2 ${tone}`}
    >
      {labelForStatus(status)}
      {source && <span className="opacity-70">· {sourceLabel(source)}</span>}
    </span>
  );
}

function labelForStatus(s: Status): string {
  switch (s) {
    case 'trialing': return 'Trialing';
    case 'active': return 'Active';
    case 'past_due': return 'Payment failed';
    case 'cancelled': return 'Cancelled';
    case 'expired': return 'Expired';
  }
}

function sourceLabel(s: Source): string {
  switch (s) {
    case 'stripe': return 'Web (Stripe)';
    case 'apple': return 'App Store';
    case 'google': return 'Google Play';
  }
}

/**
 * Native IAP entry point.
 *
 * For v1 we render an explanatory placeholder until `@capacitor-community/in-app-purchases`
 * is wired in. The full path is:
 *
 *   1. `await CdvPurchase.store.initialize([{ id: 'family_monthly', type: PAID_SUBSCRIPTION, platform: 'apple' | 'google' }])`
 *   2. `store.when().approved((tx) => tx.verify())`
 *   3. On `verified`, POST tx.transactionId / purchaseToken to /api/billing/iap/verify
 *
 * The user wanted same-price-everywhere; the App Store / Play Console must
 * have the IAP product priced identically to the web tier.
 */
function NativeUpgradeButton() {
  return (
    <div className="mt-4 rounded-xl bg-cream-50 p-4 ring-2 ring-ink-900/15">
      <p className="text-sm text-ink-500">
        In-app purchase will be available after the {platform() === 'ios' ? 'App Store' : 'Google Play'}{' '}
        listing is published. Once live, this button opens the platform’s
        secure purchase sheet.
      </p>
    </div>
  );
}
