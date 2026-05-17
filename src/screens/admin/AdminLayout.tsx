import { Link, NavLink, Outlet } from 'react-router-dom';
import { PageTag, Wordmark } from '../../ui/primitives';

export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col safe-pb">
      <header className="safe-pt sticky top-0 z-30 flex items-center justify-between gap-3 border-b-2 border-ink-900 bg-cream-100/85 px-4 py-3 backdrop-blur-md sm:px-7 sm:py-4">
        <Wordmark size="md" />
        <div className="flex items-center gap-2 sm:gap-4">
          <Link to="/" className="btn-secondary">
            <span className="hidden sm:inline">← Back to board</span>
            <span className="sm:hidden">← Board</span>
          </Link>
          <PageTag index={5} label="ADMIN" title="Family controls" />
        </div>
      </header>
      <nav
        className="sticky z-20 overflow-x-auto border-b-2 border-ink-900/15 bg-cream-100/85 backdrop-blur-md"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
        aria-label="Admin sections"
      >
        <div className="flex min-w-max gap-2 px-4 py-2.5 sm:px-7 sm:py-3">
          <Tab to="chores">Chore catalog</Tab>
          <Tab to="family">Family &amp; members</Tab>
          <Tab to="ledger">Ledger &amp; payout</Tab>
          <Tab to="milestones">Milestones</Tab>
          <Tab to="notifications">Notifications</Tab>
          <Tab to="billing">Billing</Tab>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto p-4 sm:p-7 2xl:p-10">
        <Outlet />
      </main>
      <footer className="border-t border-ink-900/10 bg-cream-100/60 px-4 py-3 text-xs text-ink-500 sm:px-7">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} ChoreBoard · made in Australia</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
            <Link to="/privacy" className="hover:text-ink-900 hover:underline">
              Privacy policy
            </Link>
            <Link to="/terms" className="hover:text-ink-900 hover:underline">
              Terms of service
            </Link>
            <a
              href="mailto:support@choreboard.io"
              className="hover:text-ink-900 hover:underline"
            >
              support@choreboard.io
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
          isActive
            ? 'bg-ink-900 text-cream-50 shadow-paper-sm'
            : 'text-ink-700 hover:bg-ink-900/5'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
