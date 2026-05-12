import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useLogout, useSession } from '../lib/session';
import { useSseStatus } from '../lib/sseStatus';
import type { BoardResponse, LeaderboardResponse } from '../lib/types';
import { KanbanDesktop } from '../desktops/KanbanDesktop';
import { FamilyDashboard } from '../desktops/FamilyDashboard';
import { BudgetDesktop } from '../desktops/BudgetDesktop';
import { MemberDashboard } from '../desktops/MemberDashboard';
import { ChampionBanner } from '../ui/ChampionBanner';
import { PageTag, Wordmark } from '../ui/primitives';
import { Menu, MenuDivider, MenuItem, MenuLabel } from '../ui/Popover';
import { TVMode } from './TVMode';

type Desktop =
  | { kind: 'kanban' }
  | { kind: 'family' }
  | { kind: 'budget' }
  | { kind: 'member'; type: 'user' | 'kid'; id: string; name: string; color?: string };

export function Desktops() {
  const session = useSession();
  const logout = useLogout();
  const params = useParams<{ idx?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tvMode = searchParams.get('tv') === '1';

  const board = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get<BoardResponse>('/api/board'),
    refetchInterval: 60_000,
  });

  const leaderboard = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.get<LeaderboardResponse>('/api/stats/leaderboard'),
    refetchInterval: 60_000,
  });

  const desktops = useMemo<Desktop[]>(() => {
    const list: Desktop[] = [{ kind: 'kanban' }, { kind: 'family' }, { kind: 'budget' }];
    if (board.data) {
      for (const k of board.data.kids) {
        list.push({ kind: 'member', type: 'kid', id: k.id, name: k.name, color: k.color });
      }
      for (const u of board.data.parents) {
        list.push({ kind: 'member', type: 'user', id: u.id, name: u.name });
      }
    }
    return list;
  }, [board.data]);

  const total = desktops.length;
  const idx = Math.max(0, Math.min(total - 1, Number(params.idx ?? 0) || 0));
  const desktop = desktops[idx];

  const setIdx = (n: number) => {
    const clamped = Math.max(0, Math.min(total - 1, n));
    navigate(clamped === 0 ? '/' : `/desktop/${clamped}`);
  };

  // Arrow-key + swipe navigation. Inputs and contentEditable elements get
  // a pass so typing $ values doesn't change desktop.
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  useEffect(() => {
    const isTypable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypable(e.target)) return;
      if (e.key === 'ArrowRight') setIdx(idx + 1);
      else if (e.key === 'ArrowLeft') setIdx(idx - 1);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (isTypable(e.target)) return;
      touchStartX.current = e.touches[0]?.clientX ?? null;
      touchStartY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - (touchStartY.current ?? 0);
      touchStartX.current = null;
      touchStartY.current = null;
      // Only treat as a horizontal swipe if vertical motion is small.
      if (Math.abs(dx) > 90 && Math.abs(dy) < 60) setIdx(idx + (dx < 0 ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [idx, total]);

  const isParent = session.data?.kind === 'parent';
  const pendingApprovalCount = isParent
    ? (board.data?.instances ?? []).filter((i) => i.status === 'pending').length
    : 0;

  const tag = (() => {
    if (!desktop) return { label: 'BOARD', title: 'The board' };
    if (desktop.kind === 'kanban') return { label: 'KANBAN', title: 'The board' };
    if (desktop.kind === 'family') return { label: 'AMBIENT TV', title: 'Family dashboard' };
    if (desktop.kind === 'budget') return { label: 'BUDGET', title: 'Pocket money goals' };
    return { label: 'MEMBER', title: `Member dashboard · ${desktop.name}` };
  })();

  // TV mode short-circuits the entire desktop chrome.
  if (tvMode) {
    return (
      <TVMode
        onExit={() => {
          const next = new URLSearchParams(searchParams);
          next.delete('tv');
          setSearchParams(next, { replace: true });
        }}
      />
    );
  }

  const goTv = () => {
    const next = new URLSearchParams(searchParams);
    next.set('tv', '1');
    setSearchParams(next, { replace: false });
  };

  return (
    <div className="flex min-h-screen flex-col safe-pb">
      <TopBar
        familyName={board.data?.family.name}
        payoutAt={leaderboard.data?.payoutAt ?? null}
        onLogout={() => logout.mutate()}
        showAdmin={isParent}
        pendingApprovalCount={pendingApprovalCount}
        index={idx + 1}
        tagLabel={tag.label}
        tagTitle={tag.title}
        onTv={goTv}
      />

      <DotIndicator desktops={desktops} idx={idx} onPick={setIdx} />

      <main id="cb-main" className="flex-1 overflow-hidden">
        {desktop?.kind === 'kanban' && (
          <KanbanDesktop board={board.data} loading={board.isLoading} />
        )}
        {desktop?.kind === 'family' && (
          <FamilyDashboard leaderboard={leaderboard.data} board={board.data} />
        )}
        {desktop?.kind === 'budget' && (
          <BudgetDesktop board={board.data} payoutAt={leaderboard.data?.payoutAt ?? null} />
        )}
        {desktop?.kind === 'member' && (
          <MemberDashboard
            member={{
              type: desktop.type,
              id: desktop.id,
              name: desktop.name,
              color: desktop.color,
            }}
            board={board.data}
          />
        )}
      </main>

      <ChampionBanner />

      <LegalFooter />
    </div>
  );
}

/**
 * Tiny chrome strip with the legal links. Sits below ChampionBanner so it's
 * the very last thing on the page. Hidden in ambient/TV modes so the kitchen
 * wall stays uncluttered (those modes set `data-tv` / `data-ambient` on body
 * and the rule lives in index.css).
 */
function LegalFooter() {
  return (
    <footer
      data-chrome="legal"
      className="border-t border-ink-900/10 bg-cream-100/60 px-4 py-2 text-center text-[11px] text-ink-500 sm:px-7"
    >
      <nav
        aria-label="Legal"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
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
          support
        </a>
      </nav>
    </footer>
  );
}

function TopBar({
  familyName,
  payoutAt,
  onLogout,
  showAdmin,
  pendingApprovalCount,
  index,
  tagLabel,
  tagTitle,
  onTv,
}: {
  familyName?: string;
  payoutAt: string | null;
  onLogout: () => void;
  showAdmin: boolean;
  pendingApprovalCount: number;
  index: number;
  tagLabel: string;
  tagTitle: string;
  onTv: () => void;
}) {
  const navigate = useNavigate();
  const sseStatus = useSseStatus();
  // Tick the countdown so the "pays out in 2h" pill ages without a full refetch.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      data-chrome="topbar"
      className="safe-pt sticky top-0 z-30 border-b-2 border-ink-900 bg-cream-100/85 px-4 py-3 backdrop-blur-md sm:px-7 sm:py-4"
    >
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Wordmark size="md" />
          {familyName && (
            <span className="hidden truncate text-xs font-semibold uppercase tracking-wide text-ink-500 sm:block">
              · {familyName}
            </span>
          )}
          {/* Tiny live-status dot. Visible on every page so a parent can tell
              at a glance whether real-time updates are flowing or if the
              network's dropped. Only the dot shows on phone; the label
              appears from sm: up. */}
          <span
            title={
              sseStatus === 'open'
                ? 'Real-time updates active'
                : sseStatus === 'connecting'
                  ? 'Reconnecting…'
                  : 'Real-time updates offline'
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:px-2 ${
              sseStatus === 'open'
                ? 'text-money'
                : sseStatus === 'connecting'
                  ? 'text-accent-orange'
                  : 'text-accent-red'
            }`}
            aria-live="polite"
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                sseStatus === 'open'
                  ? 'bg-money'
                  : sseStatus === 'connecting'
                    ? 'bg-accent-orange'
                    : 'bg-accent-red'
              } ${sseStatus === 'open' ? 'animate-pulse' : ''}`}
            />
            <span className="hidden sm:inline">
              {sseStatus === 'open' ? 'Live' : sseStatus === 'connecting' ? 'Sync' : 'Offline'}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {pendingApprovalCount > 0 && (
            <span className="pill-pending whitespace-nowrap">
              {pendingApprovalCount}
              <span className="hidden sm:inline">
                {' '}pending approval{pendingApprovalCount === 1 ? '' : 's'}
              </span>
            </span>
          )}
          {payoutAt && (
            <span className="pill hidden whitespace-nowrap md:inline-flex">
              Pays out {formatPayoutShort(payoutAt)}
            </span>
          )}

          {/* Desktop: explicit buttons. Mobile: overflow menu. */}
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={onTv}
              className="btn-secondary"
              title="Open the kitchen-wall TV view"
              aria-label="Open TV mode"
            >
              <span aria-hidden>📺</span>
              <span>TV</span>
            </button>
            {showAdmin && (
              <Link to="/admin" className="btn-ghost">
                Admin
              </Link>
            )}
            <button className="btn-ghost" onClick={onLogout}>
              Sign out
            </button>
          </div>

          <div className="sm:hidden">
            <Menu
              align="end"
              width={220}
              trigger={(open, setOpen) => (
                <button
                  type="button"
                  aria-label="Menu"
                  onClick={() => setOpen(!open)}
                  className="btn-icon ring-2 ring-ink-900 bg-paper shadow-paper-sm"
                >
                  <span className="text-lg leading-none">≡</span>
                </button>
              )}
            >
              {(close) => (
                <div>
                  {familyName && <MenuLabel>{familyName}</MenuLabel>}
                  {payoutAt && (
                    <div className="px-3 pb-1 text-xs text-ink-500">
                      Pays out {formatPayoutShort(payoutAt)}
                    </div>
                  )}
                  <MenuDivider />
                  <MenuItem
                    onClick={() => {
                      close();
                      onTv();
                    }}
                  >
                    📺 TV mode · Kitchen wall
                  </MenuItem>
                  {showAdmin && (
                    <MenuItem
                      onClick={() => {
                        close();
                        navigate('/admin');
                      }}
                    >
                      Admin · Family controls
                    </MenuItem>
                  )}
                  <MenuDivider />
                  <MenuItem
                    onClick={() => {
                      close();
                      navigate('/privacy');
                    }}
                  >
                    Privacy policy
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      navigate('/terms');
                    }}
                  >
                    Terms of service
                  </MenuItem>
                  <MenuDivider />
                  <MenuItem
                    destructive
                    onClick={() => {
                      close();
                      onLogout();
                    }}
                  >
                    Sign out
                  </MenuItem>
                </div>
              )}
            </Menu>
          </div>

          <PageTag index={index} label={tagLabel} title={tagTitle} className="ml-1" />
        </div>
      </div>
    </header>
  );
}

function formatPayoutShort(iso: string): string {
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days[d.getDay()] ?? '';
  const hour = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: d.getMinutes() ? '2-digit' : undefined,
  });
  return `${day} ${hour}`;
}

function DotIndicator({
  desktops,
  idx,
  onPick,
}: {
  desktops: Desktop[];
  idx: number;
  onPick: (n: number) => void;
}) {
  return (
    <nav
      data-chrome="dots"
      className="sticky z-20 flex items-center justify-center gap-2 border-b-2 border-ink-900/15 bg-cream-100/85 px-4 py-2.5 backdrop-blur-md sm:py-3"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
      aria-label="Desktops"
    >
      <div className="flex max-w-full items-center gap-2 overflow-x-auto px-2 py-1">
        {desktops.map((d, i) => {
          const active = i === idx;
          const color = d.kind === 'member' ? d.color ?? undefined : undefined;
          const label = labelFor(d);
          return (
            <button
              key={i}
              onClick={() => onPick(i)}
              className="group relative flex items-center px-1 py-1.5 tap-target"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`rounded-full transition-all ${
                  active ? 'h-3 w-8 sm:h-3.5 sm:w-10' : 'h-3 w-3'
                }`}
                style={{
                  backgroundColor: active ? color ?? '#10182B' : 'rgba(16,24,43,0.25)',
                }}
              />
              <span
                className={`pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-ink-700 transition-opacity sm:top-8 ${
                  active ? 'opacity-90' : 'opacity-0 group-hover:opacity-60'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function labelFor(d: Desktop): string {
  if (d.kind === 'kanban') return 'Board';
  if (d.kind === 'family') return 'Family';
  if (d.kind === 'budget') return 'Budget';
  return d.name;
}
