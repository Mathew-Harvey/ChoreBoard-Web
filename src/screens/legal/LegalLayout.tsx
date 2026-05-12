import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PageTag, Wordmark } from '../../ui/primitives';

/**
 * Shared chrome for the in-app legal pages (/privacy and /terms).
 *
 * Mirrors the visual language of AdminLayout — sticky top bar with the
 * wordmark, sticky tab strip underneath, and a paper-coloured content well —
 * so the policies feel like part of the product instead of a third-party
 * legal microsite. Works for both signed-in and signed-out users.
 */
export function LegalLayout({
  page,
  pageIndex,
  pageLabel,
  pageTitle,
  effective,
  contact,
  intro,
  children,
}: {
  page: 'privacy' | 'terms';
  pageIndex: number;
  pageLabel: string;
  pageTitle: string;
  effective: string;
  contact: { label: string; href: string };
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col safe-pb">
      <header className="safe-pt sticky top-0 z-30 flex items-center justify-between gap-3 border-b-2 border-ink-900 bg-cream-100/85 px-4 py-3 backdrop-blur-md sm:px-7 sm:py-4">
        <Link to="/" aria-label="ChoreBoard home" className="shrink-0">
          <Wordmark size="md" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link to="/" className="btn-secondary">
            <span className="hidden sm:inline">← Back to app</span>
            <span className="sm:hidden">← App</span>
          </Link>
          <PageTag index={pageIndex} label={pageLabel} title={pageTitle} />
        </div>
      </header>

      <nav
        className="sticky z-20 overflow-x-auto border-b-2 border-ink-900/15 bg-cream-100/85 backdrop-blur-md"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
        aria-label="Legal sections"
      >
        <div className="mx-auto flex min-w-max max-w-[1100px] gap-2 px-4 py-2.5 sm:px-7 sm:py-3">
          <LegalTab to="/privacy" active={page === 'privacy'}>
            Privacy
          </LegalTab>
          <LegalTab to="/terms" active={page === 'terms'}>
            Terms
          </LegalTab>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-7 sm:py-12">
          <div className="page-tag">LEGAL · {pageLabel}</div>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
            {pageTitle}
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
            <span>
              <strong className="text-ink-900">Effective:</strong> {effective}
            </span>
            <span>
              <strong className="text-ink-900">Operator:</strong> ChoreBoard, Australia
            </span>
            <span>
              <strong className="text-ink-900">Contact:</strong>{' '}
              <a className="legal-link" href={contact.href}>
                {contact.label}
              </a>
            </span>
          </div>

          {intro}

          <div className="legal-prose mt-10">{children}</div>

          <footer className="mt-12 border-t-2 border-ink-900/15 pt-6 text-xs text-ink-500">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} ChoreBoard · made in Australia</span>
              <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal footer">
                <NavLink to="/privacy" className="legal-link">
                  Privacy
                </NavLink>
                <NavLink to="/terms" className="legal-link">
                  Terms
                </NavLink>
                <a className="legal-link" href="mailto:support@choreboard.io">
                  support@choreboard.io
                </a>
              </nav>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

function LegalTab({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
          : 'text-ink-700 hover:bg-ink-900/5'
      }`}
    >
      {children}
    </NavLink>
  );
}

/**
 * Plain-English summary block, used at the top of each policy. Keeps the
 * tone friendly and the most important answers at the top so a person who
 * doesn't read all the way down still learns the essentials.
 */
export function PolicySummary({
  accent = 'money',
  children,
}: {
  accent?: 'money' | 'blue';
  children: ReactNode;
}) {
  const tag = accent === 'blue' ? 'text-accent-blue' : 'text-money';
  const dot = accent === 'blue' ? 'bg-accent-blue' : 'bg-money';
  return (
    <aside
      className="card mt-8 p-5 sm:p-6"
      aria-label="Plain-English summary"
    >
      <div
        className={`mb-3 font-display text-xs font-extrabold uppercase tracking-[0.14em] ${tag}`}
      >
        The short version
      </div>
      <ul className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink-700">
        {Array.isArray(children) ? (
          children.map((child, i) => (
            <li key={i} className="relative pl-6">
              <span
                aria-hidden
                className={`absolute left-0 top-2 h-2.5 w-2.5 rounded-[3px] ring-2 ring-ink-900/85 ${dot}`}
              />
              {child}
            </li>
          ))
        ) : (
          <li className="relative pl-6">
            <span
              aria-hidden
              className={`absolute left-0 top-2 h-2.5 w-2.5 rounded-[3px] ring-2 ring-ink-900/85 ${dot}`}
            />
            {children}
          </li>
        )}
      </ul>
    </aside>
  );
}

/** A numbered policy section. Anchorable via id for direct linking. */
export function PolicySection({
  id,
  num,
  title,
  children,
}: {
  id: string;
  num: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="legal-section">
      <h2 className="legal-h2">
        <span className="legal-num">{String(num).padStart(2, '0')}</span>
        <span>{title}</span>
      </h2>
      {children}
    </section>
  );
}

export function PolicyCallout({
  variant = 'soft',
  children,
}: {
  variant?: 'soft' | 'warn';
  children: ReactNode;
}) {
  const cls =
    variant === 'warn'
      ? 'bg-accent-red/10 ring-accent-red/40'
      : 'bg-cream-50 ring-ink-900';
  return (
    <div className={`mt-4 rounded-2xl px-4 py-3 ring-2 ${cls} text-[15px] text-ink-700`}>
      {children}
    </div>
  );
}
