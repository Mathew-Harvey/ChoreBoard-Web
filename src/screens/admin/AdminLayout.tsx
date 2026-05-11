import { Link, NavLink, Outlet } from 'react-router-dom';
import { PageTag, Wordmark } from '../../ui/primitives';

export function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-start justify-between border-b-2 border-ink-900 px-5 py-3 sm:px-7 sm:py-4">
        <Wordmark size="md" />
        <div className="flex items-start gap-4">
          <Link to="/" className="btn-secondary">
            ← Back to board
          </Link>
          <PageTag index={5} label="ADMIN" title="Family controls" />
        </div>
      </header>
      <nav className="flex gap-2 border-b-2 border-ink-900/15 px-5 py-2.5 sm:px-7">
        <Tab to="chores">Chore catalog</Tab>
        <Tab to="family">Family & members</Tab>
        <Tab to="ledger">Ledger & payout</Tab>
      </nav>
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">
        <Outlet />
      </main>
    </div>
  );
}

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
          isActive
            ? 'bg-ink-900 text-cream-50'
            : 'text-ink-700 hover:bg-ink-900/5'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
