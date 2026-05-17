import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useLogout, useSession } from '../lib/session';

// ---------------------------------------------------------------------------
// Whitelist mirror
// ---------------------------------------------------------------------------
// Client-side mirror of the SAME hardcoded set on the server. Used purely
// for picking which sub-view to render BEFORE the heavy stats fetch goes
// out, so the user doesn't see a flash of "loading dashboard" before the
// 403 lands. Server is still the source of truth — see the 403 handling on
// the stats fetch below.

const ADMIN_CONTACT_EMAIL = 'mathewharvey@gmail.com';

const WHITELISTED_EMAILS: ReadonlySet<string> = new Set<string>([
  'mathewharvey@gmail.com',
  'jeff-assistant@agentmail.to',
]);

function isWhitelistedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return WHITELISTED_EMAILS.has(email.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Payload shape (mirror of the server contract)
// ---------------------------------------------------------------------------

type DailyPoint = { date: string; count: number };

type DashPayload = {
  generatedAt: string;
  totals: {
    signups: number;
    activeUsers: number;
    verifiedUsers: number;
    workspaces: number;
    kids: number;
    chores: number;
    completedChores: number;
    milestones: number;
    milestoneHits: number;
    badgesAwarded: number;
  };
  activity: {
    signups24h: number;
    signups7d: number;
    signups30d: number;
    active7d: number;
    active30d: number;
    items7d: number;
    items30d: number;
    openSessions: number;
  };
  workspaceTypes: { family: number; solo: number };
  planDistribution: Array<{ plan: string; count: number }>;
  dailySignups: DailyPoint[];
  dailyApplets: DailyPoint[];
  topPublicApplets: Array<{ name: string; icon: string | null; installs: number }>;
  recentSignups: Array<{
    email: string;
    displayName: string;
    createdAt: string;
    lastLoginAt: string | null;
    isActive: boolean;
    emailVerified: boolean;
    plan: string;
    role: string;
    workspaceName: string;
    workspaceType: 'family' | 'solo';
  }>;
};

type ForbiddenPayload = { error: string; message?: string; adminEmail?: string };

// ---------------------------------------------------------------------------
// Chart.js lazy loader (CDN, module-level Promise so it loads once)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    Chart?: any;
  }
}

let chartLoader: Promise<any> | null = null;

function loadChartJs(): Promise<any> {
  if (chartLoader) return chartLoader;
  chartLoader = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    if (window.Chart) {
      resolve(window.Chart);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.Chart) resolve(window.Chart);
      else reject(new Error('Chart.js loaded but global missing'));
    };
    script.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(script);
  });
  return chartLoader;
}

// ---------------------------------------------------------------------------
// Bucketers (from the 90-day daily series)
// ---------------------------------------------------------------------------

type Bucket = { key: string; label: string; tickLabel: string; count: number };

function buildDayBuckets(series: DailyPoint[], n: number): Bucket[] {
  const byDate = new Map(series.map((p) => [p.date, p.count]));
  const out: Bucket[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key =
      d.getUTCFullYear() +
      '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getUTCDate()).padStart(2, '0');
    const label = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const tickLabel = d.toLocaleDateString(undefined, {
      weekday: 'short',
      timeZone: 'UTC',
    });
    out.push({ key, label, tickLabel, count: byDate.get(key) ?? 0 });
  }
  return out;
}

// Week buckets start on Monday in UTC.
function buildWeekBuckets(series: DailyPoint[], n: number): Bucket[] {
  const byDate = new Map(series.map((p) => [p.date, p.count]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // 0=Sun … 1=Mon … 6=Sat. Distance from Monday (Mon=0, Sun=6).
  const dow = today.getUTCDay();
  const distFromMon = (dow + 6) % 7;
  const thisMon = new Date(today);
  thisMon.setUTCDate(today.getUTCDate() - distFromMon);

  const out: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMon);
    start.setUTCDate(thisMon.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    let count = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + d);
      const key =
        day.getUTCFullYear() +
        '-' +
        String(day.getUTCMonth() + 1).padStart(2, '0') +
        '-' +
        String(day.getUTCDate()).padStart(2, '0');
      count += byDate.get(key) ?? 0;
    }
    const key =
      start.getUTCFullYear() +
      '-' +
      String(start.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(start.getUTCDate()).padStart(2, '0');
    const label =
      start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) +
      ' – ' +
      end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const tickLabel = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    out.push({ key, label, tickLabel, count });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';
  const diff = Date.now() - then;
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleString();
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180): escape `"` by doubling, wrap fields containing , " or \n.
// ---------------------------------------------------------------------------

function csvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const body = rows.map((r) => r.map(csvField).join(',')).join('\r\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const PLAN_COLOURS: Record<string, string> = {
  free: '#5a5a78',
  starter: '#38bdf8',
  team: '#38bdf8',
  family: '#22c55e',
  business: '#22c55e',
  pro: '#22c55e',
  power: '#a855f7',
};

const CAT_COLOURS = [
  '#6366f1',
  '#e94560',
  '#22c55e',
  '#f59e0b',
  '#38bdf8',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

// ===========================================================================
// Component
// ===========================================================================

export function AdminDashPage(): JSX.Element {
  const session = useSession();
  const principal = session.data;

  return (
    <div className="admin-dash-root">
      <ScopedStyles />
      <div className="admin-dash-bg" aria-hidden />
      <div className="admin-dash-wrap">
        {session.isLoading ? (
          <LoadingCard />
        ) : !principal ? (
          <InlineLoginCard />
        ) : principal.kind !== 'parent' || !isWhitelistedEmail(principal.email) ? (
          <AccessDeniedCard
            email={
              principal.kind === 'parent' ? principal.email : `${principal.name} (kid PIN)`
            }
          />
        ) : (
          <DashboardView email={principal.email} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: loading
// ---------------------------------------------------------------------------

function LoadingCard(): JSX.Element {
  return (
    <div className="admin-dash-state-card">
      <div className="admin-dash-spinner" aria-hidden />
      <div className="admin-dash-state-title">Checking access…</div>
      <div className="admin-dash-state-sub">Verifying your admin session.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: signed out — inline login (does NOT redirect)
// ---------------------------------------------------------------------------

function InlineLoginCard(): JSX.Element {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mut = useMutation({
    mutationFn: async () => api.post('/api/auth/login', { email, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const err = mut.error instanceof ApiError ? mut.error : null;
  // Match the spec's two known error shapes. ChoreBoard returns 401
  // invalid_credentials today and has no verification flow, but if/when
  // it lands the {needsVerification:true} shape we already handle it.
  const message = err
    ? err.status === 401
      ? 'Sign-in failed'
      : err.payload && typeof err.payload === 'object' && 'needsVerification' in (err.payload as object)
        ? 'Please verify your email before signing in.'
        : err.message
    : null;

  return (
    <div className="admin-dash-state-card admin-dash-state-card-wide">
      <BrandMark />
      <div className="admin-dash-state-title">Admin dashboard sign-in</div>
      <div className="admin-dash-state-sub">
        Restricted to whitelisted admin accounts. You'll stay on{' '}
        <code className="admin-dash-inline-code">/admin/dash</code> after signing in.
      </div>
      <form
        className="admin-dash-login-form"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
      >
        <label className="admin-dash-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
          />
        </label>
        <label className="admin-dash-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {message && <div className="admin-dash-form-error">{message}</div>}
        <button type="submit" className="admin-dash-btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: signed in but not whitelisted
// ---------------------------------------------------------------------------

function AccessDeniedCard({
  email,
  message,
}: {
  email: string;
  message?: string;
}): JSX.Element {
  const logout = useLogout();
  return (
    <div className="admin-dash-state-card admin-dash-state-card-wide">
      <BrandMark />
      <div className="admin-dash-state-title">Access denied</div>
      <div className="admin-dash-state-sub">
        {message ?? `${email} isn't on the admin allowlist.`}
      </div>
      <div className="admin-dash-state-meta">
        Signed in as <span className="admin-dash-email-pill">{email}</span>
      </div>
      <div className="admin-dash-state-actions">
        <a
          href={`mailto:${ADMIN_CONTACT_EMAIL}?subject=Admin%20dashboard%20access`}
          className="admin-dash-btn-secondary"
        >
          Request access
        </a>
        <button
          className="admin-dash-btn-ghost"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State: allowed → the actual dashboard
// ---------------------------------------------------------------------------

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'refreshing'; data: DashPayload }
  | { kind: 'ok'; data: DashPayload }
  | { kind: 'error'; message: string; data: DashPayload | null }
  | { kind: 'denied'; message: string };

function DashboardView({ email }: { email: string }): JSX.Element {
  const [state, setState] = useState<FetchState>({ kind: 'idle' });
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Bumping this triggers a re-fetch via the effect below. Used by the
  // ↻ Refresh button so the same code path (and the same state-transition
  // logic) handles both the 60s tick and manual presses.
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-render every 5s so the "Updated 12s ago" footer + relative times stay
  // fresh. Independent of the data refresh interval below.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      setState((prev) =>
        prev.kind === 'ok'
          ? { kind: 'refreshing', data: prev.data }
          : prev.kind === 'refreshing'
            ? prev
            : { kind: 'loading' },
      );
      try {
        const url = '/api/admin/dash-stats';
        const r = await fetch(resolveUrl(url), {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'X-Client': 'web' },
        });
        if (!r.ok) {
          let payload: ForbiddenPayload | null = null;
          try {
            payload = (await r.json()) as ForbiddenPayload;
          } catch {
            /* */
          }
          if (r.status === 403) {
            // Covers the case where the admin was just removed from the
            // allowlist between page-load and refresh.
            if (cancelled) return;
            setState({
              kind: 'denied',
              message: payload?.message ?? 'Access has been revoked.',
            });
            return;
          }
          throw new Error(payload?.message ?? `Stats request failed (${r.status})`);
        }
        const data = (await r.json()) as DashPayload;
        if (cancelled) return;
        setState({ kind: 'ok', data });
        setLastFetchAt(Date.now());
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load stats';
        // Keep showing the last good payload during a transient error.
        setState((prev) =>
          prev.kind === 'ok' || prev.kind === 'refreshing'
            ? { kind: 'error', message: msg, data: prev.data }
            : { kind: 'error', message: msg, data: null },
        );
        // Single, short, PII-free log line.
        console.warn('[admin-dash] fetch failed:', msg);
      }
    };
    void fetchOnce();
    const id = window.setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [refreshKey]);

  if (state.kind === 'denied') {
    return <AccessDeniedCard email={email} message={state.message} />;
  }

  const data: DashPayload | null =
    state.kind === 'ok' || state.kind === 'refreshing'
      ? state.data
      : state.kind === 'error'
        ? state.data
        : null;

  if (!data) {
    return <LoadingCard />;
  }

  const status: 'live' | 'refreshing' | 'error' =
    state.kind === 'error' ? 'error' : state.kind === 'refreshing' ? 'refreshing' : 'live';

  return (
    <Dashboard
      data={data}
      email={email}
      status={status}
      lastFetchAt={lastFetchAt}
      nowTick={nowTick}
      lastError={state.kind === 'error' ? state.message : null}
      onRefresh={() => setRefreshKey((k) => k + 1)}
    />
  );
}

function resolveUrl(path: string): string {
  // Mirror what `lib/api.ts` does at runtime (relative on web, absolute on
  // native via VITE_API_BASE_URL). We inline this instead of importing the
  // helper so this file stays self-contained per spec.
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (!base) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return base + (path.startsWith('/') ? path : '/' + path);
}

// ---------------------------------------------------------------------------
// The dashboard itself
// ---------------------------------------------------------------------------

type ChartRange = 'days' | 'weeks';
type WindowFilter = '24h' | '7d' | '30d' | 'all';

function Dashboard({
  data,
  email,
  status,
  lastFetchAt,
  nowTick,
  lastError,
  onRefresh,
}: {
  data: DashPayload;
  email: string;
  status: 'live' | 'refreshing' | 'error';
  lastFetchAt: number | null;
  nowTick: number;
  lastError: string | null;
  onRefresh: () => void;
}): JSX.Element {
  const logout = useLogout();
  const [chartRange, setChartRange] = useState<ChartRange>('days');

  const signupBuckets = useMemo(
    () =>
      chartRange === 'days'
        ? buildDayBuckets(data.dailySignups, 10)
        : buildWeekBuckets(data.dailySignups, 10),
    [data.dailySignups, chartRange],
  );
  const applletBuckets = useMemo(
    () =>
      chartRange === 'days'
        ? buildDayBuckets(data.dailyApplets, 10)
        : buildWeekBuckets(data.dailyApplets, 10),
    [data.dailyApplets, chartRange],
  );

  return (
    <div className="admin-dash-shell">
      <Header
        email={email}
        status={status}
        onRefresh={onRefresh}
        onSignOut={() => logout.mutate()}
        signingOut={logout.isPending}
      />

      {lastError && <div className="admin-dash-error-banner">⚠ {lastError}</div>}

      {/* 3. Hero row */}
      <section className="admin-dash-hero">
        <div className="admin-dash-hero-big">
          <div className="admin-dash-eyebrow">Total signups</div>
          <div className="admin-dash-bignum">{data.totals.signups.toLocaleString()}</div>
          <div className="admin-dash-bignum-sub">
            <strong>{data.totals.activeUsers.toLocaleString()}</strong> active ·{' '}
            <strong>{data.totals.verifiedUsers.toLocaleString()}</strong> email-verified
          </div>
          <div className="admin-dash-delta-row">
            <DeltaCell label="24h" value={data.activity.signups24h} />
            <DeltaCell label="7d" value={data.activity.signups7d} />
            <DeltaCell label="30d" value={data.activity.signups30d} />
          </div>
        </div>
        <div className="admin-dash-hero-grid">
          <StatCard label="Workspaces" value={data.totals.workspaces} />
          <StatCard label="Chores completed" value={data.totals.completedChores} />
          <StatCard label="Milestones" value={data.totals.milestones} />
          <StatCard label="Badges awarded" value={data.totals.badgesAwarded} />
        </div>
      </section>

      {/* 4. KPI strip */}
      <section className="admin-dash-kpi-strip">
        <StatCard label="Active · 7d" value={data.activity.active7d} />
        <StatCard label="Active · 30d" value={data.activity.active30d} />
        <StatCard label="Chores · 7d" value={data.activity.items7d} />
        <StatCard label="Chores · 30d" value={data.activity.items30d} />
        <StatCard label="Open sessions" value={data.activity.openSessions} />
        <StatCard label="Milestone hits" value={data.totals.milestoneHits} />
      </section>

      {/* 5. Chart toolbar */}
      <section className="admin-dash-chart-toolbar">
        <div className="admin-dash-eyebrow">Activity</div>
        <Segmented
          value={chartRange}
          onChange={setChartRange as (v: string) => void}
          options={[
            { value: 'days', label: 'Last 10 days' },
            { value: 'weeks', label: 'Last 10 weeks' },
          ]}
        />
      </section>

      {/* 6. Charts */}
      <section className="admin-dash-chart-row">
        <ChartCard
          title={`Signups · last 10 ${chartRange === 'days' ? 'days' : 'weeks'}`}
          buckets={signupBuckets}
          colour="#6366f1"
        />
        <ChartCard
          title={`Chores completed · last 10 ${chartRange === 'days' ? 'days' : 'weeks'}`}
          buckets={applletBuckets}
          colour="#e94560"
        />
      </section>

      {/* 7. Row lists */}
      <section className="admin-dash-list-row">
        <DistributionCard
          title="Plan distribution"
          items={data.planDistribution.map((p, i) => ({
            label: p.plan,
            count: p.count,
            colour:
              PLAN_COLOURS[p.plan] ??
              CAT_COLOURS[i % CAT_COLOURS.length] ??
              '#5a5a78',
          }))}
        />
      </section>

      {/* 8. Recent signups */}
      <RecentSignupsSection rows={data.recentSignups} />

      {/* 9. Top public applets */}
      <TopAppletsCard rows={data.topPublicApplets} />

      {/* 10. Footer */}
      <footer className="admin-dash-footer">
        <span>Whitelisted admin view · handle member data with care.</span>
        <span>
          {lastFetchAt
            ? `Updated ${Math.max(0, Math.round((nowTick - lastFetchAt) / 1000))}s ago`
            : 'Updating…'}
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  email,
  status,
  onRefresh,
  onSignOut,
  signingOut,
}: {
  email: string;
  status: 'live' | 'refreshing' | 'error';
  onRefresh: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}): JSX.Element {
  return (
    <header className="admin-dash-header">
      <div className="admin-dash-header-left">
        <BrandMark />
        <div>
          <div className="admin-dash-title">ChoreBoard admin</div>
          <div className="admin-dash-subtitle">
            Live usage of{' '}
            <a href="https://app.choreboard.io" target="_blank" rel="noreferrer">
              app.choreboard.io
            </a>
          </div>
        </div>
      </div>
      <div className="admin-dash-header-right">
        <StatusDot status={status} />
        <span className="admin-dash-email-pill" title={email}>
          {email}
        </span>
        <button
          className="admin-dash-btn-secondary"
          onClick={onRefresh}
          aria-label="Refresh stats"
        >
          ↻ Refresh
        </button>
        <button
          className="admin-dash-btn-ghost"
          onClick={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  );
}

function StatusDot({
  status,
}: {
  status: 'live' | 'refreshing' | 'error';
}): JSX.Element {
  const label =
    status === 'live' ? 'Live' : status === 'refreshing' ? 'Refreshing' : 'Offline';
  return (
    <span
      className={`admin-dash-status admin-dash-status-${status}`}
      title={`Status: ${label}`}
    >
      <span className="admin-dash-status-dot" />
      {label}
    </span>
  );
}

function BrandMark(): JSX.Element {
  return (
    <span className="admin-dash-brand" aria-hidden>
      <span className="admin-dash-brand-mark" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function DeltaCell({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="admin-dash-delta-cell">
      <div className="admin-dash-delta-label">{label}</div>
      <div className="admin-dash-delta-value">+{value.toLocaleString()}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="admin-dash-stat-card">
      <div className="admin-dash-stat-label">{label}</div>
      <div className="admin-dash-stat-value">{value.toLocaleString()}</div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <div className="admin-dash-segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`admin-dash-segmented-item${
            o.value === value ? ' admin-dash-segmented-item-active' : ''
          }`}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart card
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  buckets,
  colour,
}: {
  title: string;
  buckets: Bucket[];
  colour: string;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Keep the instance in a ref so we can destroy it on data change AND on
  // unmount — the most common bug in dashboards like this is leaking
  // canvases (each refresh leaves an orphan).
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void loadChartJs().then((Chart) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      instanceRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: buckets.map((b) => b.tickLabel),
          datasets: [
            {
              data: buckets.map((b) => b.count),
              backgroundColor: colour,
              hoverBackgroundColor: colour,
              borderRadius: 7,
              maxBarThickness: 34,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f0f1a',
              borderColor: '#262640',
              borderWidth: 1,
              titleColor: '#f4f4fb',
              bodyColor: '#f4f4fb',
              padding: 10,
              displayColors: false,
              callbacks: {
                title: (items: any[]) => buckets[items[0].dataIndex]?.label ?? '',
                label: (item: any) => `${item.formattedValue}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#8b8ba8', font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.05)' },
              border: { display: false },
              ticks: {
                color: '#8b8ba8',
                font: { size: 11 },
                precision: 0,
              },
            },
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [buckets, colour]);

  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div className="admin-dash-chart-card">
      <div className="admin-dash-chart-head">
        <div className="admin-dash-chart-title">{title}</div>
        <div className="admin-dash-chart-total">{total.toLocaleString()}</div>
      </div>
      <div className="admin-dash-chart-frame">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution list (plans, categories)
// ---------------------------------------------------------------------------

function DistributionCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number; colour: string }>;
}): JSX.Element {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <div className="admin-dash-dist-card">
      <div className="admin-dash-dist-title">{title}</div>
      {items.length === 0 ? (
        <div className="admin-dash-empty">No data yet.</div>
      ) : (
        <ul className="admin-dash-dist-list">
          {items.map((item) => {
            const pct = Math.max(0.5, (item.count / total) * 100);
            return (
              <li key={item.label} className="admin-dash-dist-row">
                <span className="admin-dash-dist-line">
                  <span
                    className="admin-dash-dist-swatch"
                    style={{ background: item.colour }}
                  />
                  <span className="admin-dash-dist-label">{item.label}</span>
                  <span className="admin-dash-dist-count">
                    {item.count.toLocaleString()}
                  </span>
                </span>
                <span className="admin-dash-dist-bar">
                  <span
                    className="admin-dash-dist-bar-fill"
                    style={{ width: pct + '%', background: item.colour }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent signups (with search, window filter, CSV export)
// ---------------------------------------------------------------------------

function RecentSignupsSection({
  rows,
}: {
  rows: DashPayload['recentSignups'];
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff =
      windowFilter === '24h'
        ? Date.now() - 24 * 60 * 60 * 1000
        : windowFilter === '7d'
          ? Date.now() - 7 * 24 * 60 * 60 * 1000
          : windowFilter === '30d'
            ? Date.now() - 30 * 24 * 60 * 60 * 1000
            : -Infinity;
    return rows.filter((r) => {
      if (cutoff > -Infinity) {
        const t = new Date(r.createdAt).getTime();
        if (!Number.isFinite(t) || t < cutoff) return false;
      }
      if (q) {
        const hay = (
          r.email +
          ' ' +
          r.displayName +
          ' ' +
          r.workspaceName
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, windowFilter]);

  const onExport = () => {
    const header = [
      'email',
      'displayName',
      'workspaceName',
      'workspaceType',
      'plan',
      'role',
      'isActive',
      'emailVerified',
      'createdAt',
      'lastLoginAt',
    ];
    const data = visible.map((r) => [
      r.email,
      r.displayName,
      r.workspaceName,
      r.workspaceType,
      r.plan,
      r.role,
      r.isActive ? 'true' : 'false',
      r.emailVerified ? 'true' : 'false',
      r.createdAt,
      r.lastLoginAt ?? '',
    ]);
    downloadCsv(
      `choreboard-signups-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...data],
    );
  };

  return (
    <section className="admin-dash-table-card">
      <div className="admin-dash-table-head">
        <div>
          <div className="admin-dash-eyebrow">Recent signups</div>
          <div className="admin-dash-table-subtitle">
            Showing <strong>{visible.length}</strong> of{' '}
            <strong>{rows.length}</strong> accounts (newest 500)
          </div>
        </div>
        <div className="admin-dash-table-controls">
          <input
            className="admin-dash-search"
            type="search"
            placeholder="Search email, name, workspace…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search recent signups"
          />
          <Segmented
            value={windowFilter}
            onChange={(v) => setWindowFilter(v as WindowFilter)}
            options={[
              { value: '24h', label: '24h' },
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' },
              { value: 'all', label: 'All time' },
            ]}
          />
          <button
            className="admin-dash-btn-secondary"
            onClick={onExport}
            disabled={visible.length === 0}
            type="button"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="admin-dash-empty">No signups yet.</div>
      ) : visible.length === 0 ? (
        <div className="admin-dash-empty">No signups match the current filters.</div>
      ) : (
        <div className="admin-dash-table-wrap">
          <table className="admin-dash-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Workspace</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Signed up</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.email + r.createdAt}>
                  <td>
                    <a
                      className="admin-dash-table-link"
                      href={`mailto:${r.email}`}
                    >
                      {r.email}
                    </a>
                  </td>
                  <td>{r.displayName}</td>
                  <td>
                    <span className="admin-dash-cell-stack">
                      <span>{r.workspaceName}</span>
                      <span
                        className={`admin-dash-tag admin-dash-tag-workspace admin-dash-tag-workspace-${r.workspaceType}`}
                      >
                        {r.workspaceType}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="admin-dash-tag-stack">
                      <span
                        className="admin-dash-tag"
                        style={{
                          background:
                            (PLAN_COLOURS[r.plan] ?? '#5a5a78') + '33',
                          color: PLAN_COLOURS[r.plan] ?? '#bdbdcf',
                        }}
                      >
                        {r.plan}
                      </span>
                      {r.role === 'owner' && (
                        <span className="admin-dash-tag admin-dash-tag-admin">admin</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <StatusTag verified={r.emailVerified} active={r.isActive} />
                  </td>
                  <td title={new Date(r.createdAt).toLocaleString()}>
                    {relativeTime(r.createdAt)}
                  </td>
                  <td
                    title={
                      r.lastLoginAt
                        ? new Date(r.lastLoginAt).toLocaleString()
                        : 'never logged in'
                    }
                  >
                    {relativeTime(r.lastLoginAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusTag({
  verified,
  active,
}: {
  verified: boolean;
  active: boolean;
}): JSX.Element {
  if (!verified) {
    return <span className="admin-dash-tag admin-dash-tag-pending">pending</span>;
  }
  if (!active) {
    return <span className="admin-dash-tag admin-dash-tag-dormant">dormant</span>;
  }
  return <span className="admin-dash-tag admin-dash-tag-verified">verified</span>;
}

// ---------------------------------------------------------------------------
// Top applets / most-completed chores
// ---------------------------------------------------------------------------

function TopAppletsCard({
  rows,
}: {
  rows: DashPayload['topPublicApplets'];
}): JSX.Element {
  return (
    <section className="admin-dash-top-card">
      <div className="admin-dash-eyebrow">Most-completed chores</div>
      {rows.length === 0 ? (
        <div className="admin-dash-empty">Nothing approved yet.</div>
      ) : (
        <ul className="admin-dash-top-list">
          {rows.slice(0, 10).map((r, i) => (
            <li key={r.name + i} className="admin-dash-top-row">
              <span className="admin-dash-top-rank">{i + 1}</span>
              <span className="admin-dash-top-icon" aria-hidden>
                {r.icon ?? '✓'}
              </span>
              <span className="admin-dash-top-name">{r.name}</span>
              <span className="admin-dash-top-installs">
                {compactNumber(r.installs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ===========================================================================
// Inline scoped styles — every selector is admin-dash-* so it can't collide
// with the rest of the app's CSS.
// ===========================================================================

function ScopedStyles(): JSX.Element {
  return (
    <style>{`
      .admin-dash-root {
        position: fixed;
        inset: 0;
        background: #0f0f1a;
        color: #f4f4fb;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont,
          'Segoe UI', sans-serif;
        line-height: 1.5;
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 1;
      }
      .admin-dash-bg {
        position: fixed;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(900px 540px at -10% -20%, rgba(99, 102, 241, 0.28), transparent 65%),
          radial-gradient(720px 420px at 110% -10%, rgba(233, 69, 96, 0.22), transparent 65%);
        z-index: 0;
      }
      .admin-dash-wrap {
        position: relative;
        z-index: 1;
        min-height: 100%;
        max-width: 1320px;
        margin: 0 auto;
        padding: 32px 28px 60px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      @media (max-width: 720px) {
        .admin-dash-wrap { padding: 20px 16px 48px; }
      }

      .admin-dash-shell {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* ----- BRAND / HEADER ------------------------------------------------ */
      .admin-dash-brand {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: linear-gradient(135deg, #6366f1 0%, #e94560 100%);
        box-shadow: 0 8px 24px -10px rgba(99, 102, 241, 0.7);
        flex: 0 0 36px;
      }
      .admin-dash-brand-mark {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background: rgba(255,255,255,0.92);
        transform: rotate(45deg);
      }

      .admin-dash-header {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: center;
        justify-content: space-between;
      }
      .admin-dash-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .admin-dash-title {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .admin-dash-subtitle {
        font-size: 13px;
        color: #8b8ba8;
      }
      .admin-dash-subtitle a {
        color: #c7c7e0;
        text-decoration: underline;
        text-underline-offset: 2px;
        text-decoration-color: rgba(199, 199, 224, 0.35);
      }
      .admin-dash-header-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .admin-dash-email-pill {
        font-size: 12px;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: 999px;
        background: #1c1c2e;
        border: 1px solid #262640;
        color: #c7c7e0;
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ----- BUTTONS ------------------------------------------------------- */
      .admin-dash-btn-primary,
      .admin-dash-btn-secondary,
      .admin-dash-btn-ghost {
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 14px;
        border-radius: 10px;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.05s;
      }
      .admin-dash-btn-primary {
        color: #f4f4fb;
        background: linear-gradient(135deg, #6366f1 0%, #e94560 100%);
        box-shadow: 0 10px 30px -16px rgba(99, 102, 241, 0.8);
      }
      .admin-dash-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .admin-dash-btn-secondary {
        background: #1c1c2e;
        border-color: #262640;
        color: #f4f4fb;
      }
      .admin-dash-btn-secondary:hover { background: #232340; }
      .admin-dash-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
      .admin-dash-btn-ghost {
        background: transparent;
        border-color: #262640;
        color: #c7c7e0;
      }
      .admin-dash-btn-ghost:hover { background: rgba(255,255,255,0.04); }
      .admin-dash-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ----- STATUS DOT ---------------------------------------------------- */
      .admin-dash-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 999px;
        background: #1c1c2e;
        border: 1px solid #262640;
      }
      .admin-dash-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex: 0 0 8px;
      }
      .admin-dash-status-live .admin-dash-status-dot {
        background: #22c55e;
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
        animation: admin-dash-pulse 1.6s ease-out infinite;
      }
      .admin-dash-status-live { color: #4ade80; }
      .admin-dash-status-refreshing .admin-dash-status-dot { background: #f59e0b; }
      .admin-dash-status-refreshing { color: #fbbf24; }
      .admin-dash-status-error .admin-dash-status-dot { background: #e94560; }
      .admin-dash-status-error { color: #fb7185; }
      @keyframes admin-dash-pulse {
        0%   { box-shadow: 0 0 0 0   rgba(34,197,94,0.55); }
        80%  { box-shadow: 0 0 0 8px rgba(34,197,94,0);    }
        100% { box-shadow: 0 0 0 0   rgba(34,197,94,0);    }
      }

      /* ----- ERROR BANNER -------------------------------------------------- */
      .admin-dash-error-banner {
        background: rgba(233, 69, 96, 0.14);
        border: 1px solid rgba(233, 69, 96, 0.35);
        color: #fda4af;
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 13px;
      }

      /* ----- HERO ROW ------------------------------------------------------ */
      .admin-dash-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 18px;
      }
      @media (max-width: 900px) {
        .admin-dash-hero { grid-template-columns: 1fr; }
      }
      .admin-dash-hero-big,
      .admin-dash-hero-grid > .admin-dash-stat-card,
      .admin-dash-stat-card,
      .admin-dash-dist-card,
      .admin-dash-chart-card,
      .admin-dash-table-card,
      .admin-dash-top-card,
      .admin-dash-state-card {
        background: #1c1c2e;
        border: 1px solid #262640;
        border-radius: 18px;
      }
      .admin-dash-hero-big {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .admin-dash-bignum {
        font-size: 64px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        color: #f4f4fb;
      }
      .admin-dash-bignum-sub {
        font-size: 13px;
        color: #8b8ba8;
      }
      .admin-dash-bignum-sub strong { color: #f4f4fb; font-weight: 600; }
      .admin-dash-delta-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: auto;
      }
      .admin-dash-delta-cell {
        padding: 12px;
        background: #161624;
        border: 1px solid #262640;
        border-radius: 12px;
      }
      .admin-dash-delta-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #5a5a78;
        font-weight: 600;
      }
      .admin-dash-delta-value {
        margin-top: 4px;
        font-size: 22px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #c7c7e0;
      }

      .admin-dash-hero-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      /* ----- STAT CARDS ---------------------------------------------------- */
      .admin-dash-stat-card {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .admin-dash-stat-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #8b8ba8;
        font-weight: 600;
      }
      .admin-dash-stat-value {
        font-size: 28px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }

      /* ----- KPI STRIP ----------------------------------------------------- */
      .admin-dash-kpi-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 14px;
      }

      /* ----- CHART TOOLBAR + ROW ------------------------------------------ */
      .admin-dash-chart-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .admin-dash-eyebrow {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #8b8ba8;
        font-weight: 700;
      }
      .admin-dash-segmented {
        display: inline-flex;
        background: #161624;
        border: 1px solid #262640;
        border-radius: 999px;
        padding: 4px;
        gap: 2px;
      }
      .admin-dash-segmented-item {
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 14px;
        border-radius: 999px;
        background: transparent;
        color: #8b8ba8;
        border: 0;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .admin-dash-segmented-item:hover { color: #c7c7e0; }
      .admin-dash-segmented-item-active {
        background: linear-gradient(135deg, #6366f1 0%, #e94560 100%);
        color: #f4f4fb !important;
        box-shadow: 0 8px 18px -10px rgba(99, 102, 241, 0.7);
      }

      .admin-dash-chart-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      @media (max-width: 980px) {
        .admin-dash-chart-row { grid-template-columns: 1fr; }
      }
      .admin-dash-chart-card { padding: 18px; }
      .admin-dash-chart-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .admin-dash-chart-title {
        font-size: 14px;
        font-weight: 600;
        color: #c7c7e0;
      }
      .admin-dash-chart-total {
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #f4f4fb;
      }
      .admin-dash-chart-frame {
        position: relative;
        height: 280px;
      }
      .admin-dash-chart-frame canvas {
        width: 100% !important;
        height: 100% !important;
      }

      /* ----- DISTRIBUTION LISTS ------------------------------------------- */
      .admin-dash-list-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      @media (max-width: 900px) {
        .admin-dash-list-row { grid-template-columns: 1fr; }
      }
      .admin-dash-dist-card { padding: 18px; }
      .admin-dash-dist-title {
        font-size: 13px;
        font-weight: 600;
        color: #c7c7e0;
        margin-bottom: 14px;
      }
      .admin-dash-dist-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .admin-dash-dist-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .admin-dash-dist-line {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .admin-dash-dist-swatch {
        width: 10px;
        height: 10px;
        border-radius: 3px;
        flex: 0 0 10px;
      }
      .admin-dash-dist-label {
        font-size: 13px;
        color: #c7c7e0;
        text-transform: capitalize;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-dash-dist-count {
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #f4f4fb;
      }
      .admin-dash-dist-bar {
        position: relative;
        width: 100%;
        height: 4px;
        background: #161624;
        border-radius: 999px;
        overflow: hidden;
      }
      .admin-dash-dist-bar-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
      }

      /* ----- TABLE --------------------------------------------------------- */
      .admin-dash-table-card { padding: 18px 18px 8px; }
      .admin-dash-table-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 14px;
      }
      .admin-dash-table-subtitle {
        margin-top: 4px;
        font-size: 13px;
        color: #8b8ba8;
      }
      .admin-dash-table-subtitle strong {
        color: #f4f4fb;
        font-variant-numeric: tabular-nums;
      }
      .admin-dash-table-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .admin-dash-search {
        font: inherit;
        font-size: 13px;
        padding: 8px 12px;
        border-radius: 10px;
        background: #161624;
        border: 1px solid #262640;
        color: #f4f4fb;
        min-width: 200px;
        outline: none;
        transition: border-color 0.15s;
      }
      .admin-dash-search::placeholder { color: #5a5a78; }
      .admin-dash-search:focus { border-color: #6366f1; }

      .admin-dash-table-wrap {
        overflow-x: auto;
        margin: 0 -18px;
        padding: 0 18px;
      }
      .admin-dash-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .admin-dash-table th {
        text-align: left;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #5a5a78;
        padding: 10px 12px;
        border-bottom: 1px solid #262640;
        white-space: nowrap;
      }
      .admin-dash-table td {
        padding: 12px;
        border-bottom: 1px solid rgba(38, 38, 64, 0.5);
        color: #c7c7e0;
        white-space: nowrap;
        vertical-align: middle;
      }
      .admin-dash-table tr:last-child td { border-bottom: 0; }
      .admin-dash-table-link {
        color: #c7c7e0;
        text-decoration: none;
        border-bottom: 1px solid rgba(199,199,224,0.2);
      }
      .admin-dash-table-link:hover { color: #f4f4fb; border-bottom-color: #f4f4fb; }
      .admin-dash-cell-stack {
        display: inline-flex;
        flex-direction: column;
        gap: 4px;
        align-items: flex-start;
      }

      .admin-dash-tag-stack {
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }
      .admin-dash-tag {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 999px;
        text-transform: capitalize;
        line-height: 1;
        background: #262640;
        color: #c7c7e0;
      }
      .admin-dash-tag-workspace-family {
        background: rgba(99,102,241,0.16);
        color: #a5b4fc;
      }
      .admin-dash-tag-workspace-solo {
        background: rgba(90,90,120,0.25);
        color: #bdbdcf;
      }
      .admin-dash-tag-admin {
        background: rgba(233, 69, 96, 0.18);
        color: #fb7185;
      }
      .admin-dash-tag-verified {
        background: rgba(34, 197, 94, 0.16);
        color: #4ade80;
      }
      .admin-dash-tag-pending {
        background: rgba(90,90,120,0.28);
        color: #8b8ba8;
      }
      .admin-dash-tag-dormant {
        background: rgba(245, 158, 11, 0.16);
        color: #fbbf24;
      }
      .admin-dash-tag-disabled {
        background: rgba(233, 69, 96, 0.18);
        color: #fb7185;
      }

      /* ----- TOP APPLETS --------------------------------------------------- */
      .admin-dash-top-card { padding: 18px; }
      .admin-dash-top-list {
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .admin-dash-top-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(38, 38, 64, 0.5);
      }
      .admin-dash-top-row:last-child { border-bottom: 0; }
      .admin-dash-top-rank {
        font-size: 12px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #5a5a78;
        width: 24px;
      }
      .admin-dash-top-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: #161624;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .admin-dash-top-name {
        flex: 1;
        font-size: 13px;
        color: #c7c7e0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-dash-top-installs {
        font-size: 14px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #f4f4fb;
      }

      /* ----- EMPTY STATES -------------------------------------------------- */
      .admin-dash-empty {
        padding: 24px;
        text-align: center;
        color: #8b8ba8;
        font-size: 13px;
        background: #161624;
        border: 1px dashed #262640;
        border-radius: 12px;
      }

      /* ----- FOOTER -------------------------------------------------------- */
      .admin-dash-footer {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: space-between;
        font-size: 12px;
        color: #5a5a78;
      }

      /* ----- STATE CARDS (loading / login / denied) ------------------------ */
      .admin-dash-state-card {
        align-self: center;
        max-width: 420px;
        width: 100%;
        margin: 80px auto;
        padding: 28px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .admin-dash-state-card-wide {
        max-width: 460px;
      }
      .admin-dash-state-title {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #f4f4fb;
      }
      .admin-dash-state-sub {
        font-size: 13px;
        color: #8b8ba8;
        line-height: 1.55;
      }
      .admin-dash-inline-code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 6px;
        background: #161624;
        border: 1px solid #262640;
        color: #c7c7e0;
      }
      .admin-dash-state-meta {
        font-size: 12px;
        color: #8b8ba8;
        margin-top: 4px;
      }
      .admin-dash-state-actions {
        display: flex;
        gap: 10px;
        margin-top: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .admin-dash-spinner {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid #262640;
        border-top-color: #6366f1;
        animation: admin-dash-spin 0.9s linear infinite;
        margin-bottom: 4px;
      }
      @keyframes admin-dash-spin {
        to { transform: rotate(360deg); }
      }

      /* ----- LOGIN FORM ---------------------------------------------------- */
      .admin-dash-login-form {
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }
      .admin-dash-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        text-align: left;
      }
      .admin-dash-field > span {
        font-size: 12px;
        font-weight: 600;
        color: #c7c7e0;
      }
      .admin-dash-field input {
        font: inherit;
        font-size: 14px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #161624;
        border: 1px solid #262640;
        color: #f4f4fb;
        outline: none;
        transition: border-color 0.15s;
      }
      .admin-dash-field input::placeholder { color: #5a5a78; }
      .admin-dash-field input:focus { border-color: #6366f1; }
      .admin-dash-form-error {
        background: rgba(233, 69, 96, 0.14);
        border: 1px solid rgba(233, 69, 96, 0.35);
        color: #fda4af;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 12px;
        text-align: left;
      }
    `}</style>
  );
}

export default AdminDashPage;
