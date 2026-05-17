import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatPayoutShort } from '../lib/time';
import { useLogout, useSession } from '../lib/session';
import { useSseStatus } from '../lib/sseStatus';
import type { BoardResponse, LeaderboardResponse } from '../lib/types';
import { KanbanDesktop } from '../desktops/KanbanDesktop';
import { FamilyDashboard } from '../desktops/FamilyDashboard';
import { BudgetDesktop } from '../desktops/BudgetDesktop';
import { MemberDashboard } from '../desktops/MemberDashboard';
import { CalendarDesktop } from '../desktops/CalendarDesktop';
import { HistoryDesktop } from '../desktops/HistoryDesktop';
import { ChampionBanner } from '../ui/ChampionBanner';
import { LevelUpCelebrator } from '../ui/LevelUpCelebrator';
import { MilestoneBanner } from '../ui/MilestoneBanner';
import { MemberAvatar, PageTag, Wordmark } from '../ui/primitives';
import { Menu, MenuDivider, MenuItem, MenuLabel } from '../ui/Popover';
import { TVMode } from './TVMode';

type Desktop =
  | { kind: 'kanban' }
  | { kind: 'family' }
  | { kind: 'budget' }
  | { kind: 'calendar' }
  | { kind: 'history' }
  | {
      kind: 'member';
      type: 'user' | 'kid';
      id: string;
      name: string;
      color?: string;
      gender?: import('../lib/types').StatedGender;
    };

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
    const list: Desktop[] = [
      { kind: 'kanban' },
      { kind: 'family' },
      { kind: 'budget' },
      { kind: 'calendar' },
      { kind: 'history' },
    ];
    if (board.data) {
      for (const k of board.data.kids) {
        list.push({
          kind: 'member',
          type: 'kid',
          id: k.id,
          name: k.name,
          color: k.color,
          gender: k.gender,
        });
      }
      for (const u of board.data.parents) {
        list.push({
          kind: 'member',
          type: 'user',
          id: u.id,
          name: u.name,
          color: u.color,
          gender: u.gender,
        });
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
  // a pass so typing $ values doesn't change desktop. We're also careful
  // to ignore swipes that "belong" to something else on the page:
  //   - touches that started on a dnd-kit draggable (long-press → card drag)
  //   - touches that started inside a horizontally-scrollable container
  //     (the kanban column row, any internal horizontal scroller). Those
  //     gestures are scrolling within that container, not paging desktops.
  //   - any touch fired while a drag is in flight (body[data-dragging='1']).
  //
  // We also gate on a mix of distance + velocity (~minimum px/ms) so a slow
  // accidental drag doesn't flip pages, but a confident flick does.
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartT = useRef<number>(0);
  const touchValid = useRef<boolean>(false);
  useEffect(() => {
    const isTypable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    // Walks up from `el` looking for the first ancestor that can scroll
    // horizontally — that ancestor "owns" any horizontal touch motion.
    const hasHorizontalScrollAncestor = (el: EventTarget | null): boolean => {
      let node: HTMLElement | null = el instanceof HTMLElement ? el : null;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const ox = style.overflowX;
        const canScroll = ox === 'auto' || ox === 'scroll';
        if (canScroll && node.scrollWidth > node.clientWidth + 1) return true;
        node = node.parentElement;
      }
      return false;
    };
    const isInDraggable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      // `data-no-swipe="1"` is the opt-out for any future surface that owns
      // its own touch input — the whiteboard canvas, for instance, where a
      // horizontal finger drag is a brush stroke, not a desktop swipe.
      return !!el.closest('[data-dnd-draggable], [data-droppable="1"], [data-no-swipe="1"]');
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypable(e.target)) return;
      if (e.key === 'ArrowRight') setIdx(idx + 1);
      else if (e.key === 'ArrowLeft') setIdx(idx - 1);
    };
    const onTouchStart = (e: TouchEvent) => {
      touchValid.current = false;
      // Multi-touch (pinch/zoom) is never a desktop swipe.
      if (e.touches.length !== 1) return;
      if (isTypable(e.target)) return;
      // Don't compete with @dnd-kit or with horizontal scrollers.
      if (isInDraggable(e.target)) return;
      if (hasHorizontalScrollAncestor(e.target)) return;
      touchStartX.current = e.touches[0]?.clientX ?? null;
      touchStartY.current = e.touches[0]?.clientY ?? null;
      touchStartT.current = e.timeStamp;
      touchValid.current = true;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchValid.current || touchStartX.current == null) return;
      // If a drag started between touchstart and touchend, abandon. This
      // also catches the case where the user long-pressed a card and the
      // page-swipe handler shouldn't fire on the release.
      if (document.body.dataset.dragging === '1') {
        touchValid.current = false;
        return;
      }
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - (touchStartY.current ?? 0);
      const dt = Math.max(1, e.timeStamp - touchStartT.current);
      const vx = Math.abs(dx) / dt; // px per ms
      touchStartX.current = null;
      touchStartY.current = null;
      touchValid.current = false;
      // Two routes to a valid swipe:
      //   1. Long, deliberate horizontal drag (≥ 110px, low vertical).
      //   2. Quick flick (≥ 60px and ≥ 0.5 px/ms with low vertical).
      const mostlyHorizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
      const longSwipe = Math.abs(dx) > 110 && Math.abs(dy) < 70 && mostlyHorizontal;
      const flick = Math.abs(dx) > 60 && vx > 0.5 && mostlyHorizontal;
      if (longSwipe || flick) setIdx(idx + (dx < 0 ? 1 : -1));
    };
    const onTouchCancel = () => {
      touchStartX.current = null;
      touchStartY.current = null;
      touchValid.current = false;
    };
    window.addEventListener('keydown', onKey);
    // Passive listeners — we never preventDefault() on these, so this lets
    // the browser optimize scrolling and avoids the "non-passive" warning.
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
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
    if (desktop.kind === 'calendar') return { label: 'CALENDAR', title: 'Family canvas' };
    if (desktop.kind === 'history') return { label: 'HISTORY', title: 'The story so far' };
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
        timezone={board.data?.family.timezone ?? 'UTC'}
        onLogout={() => logout.mutate()}
        showAdmin={isParent}
        pendingApprovalCount={pendingApprovalCount}
        index={idx + 1}
        tagLabel={tag.label}
        tagTitle={tag.title}
        onTv={goTv}
      />

      <DesktopTabs desktops={desktops} idx={idx} onPick={setIdx} />

      <main id="cb-main" className="min-h-0 flex-1 overflow-hidden">
        {desktop?.kind === 'kanban' && (
          <KanbanDesktop board={board.data} loading={board.isLoading} />
        )}
        {desktop?.kind === 'family' && (
          <FamilyDashboard leaderboard={leaderboard.data} board={board.data} />
        )}
        {desktop?.kind === 'budget' && (
          <BudgetDesktop board={board.data} payoutAt={leaderboard.data?.payoutAt ?? null} />
        )}
        {desktop?.kind === 'calendar' && (
          <CalendarDesktop family={board.data?.family} />
        )}
        {desktop?.kind === 'history' && (
          <HistoryDesktop board={board.data} />
        )}
        {desktop?.kind === 'member' && (
          <MemberDashboard
            member={{
              type: desktop.type,
              id: desktop.id,
              name: desktop.name,
              color: desktop.color,
              gender: desktop.gender,
            }}
            board={board.data}
          />
        )}
      </main>

      <ChampionBanner />
      <LevelUpCelebrator />
      <MilestoneBanner />

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
  timezone,
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
  timezone: string;
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
              Pays out {formatPayoutShort(payoutAt, timezone)}
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
                      Pays out {formatPayoutShort(payoutAt, timezone)}
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

/**
 * Horizontal desktop tab bar.
 *
 * Previously this was a row of unlabeled dots that only revealed labels on
 * hover or while active — at small sizes the active label collided with its
 * neighbor's hover label, and the elongated active pill visually clipped
 * its own text. We now show a chunky always-labeled tab per desktop: the
 * active one becomes a filled pill (tinted with the member color for
 * member tabs), inactive ones are quiet ghost buttons. Members get a small
 * avatar so you can identify whose desktop is whose at a glance.
 */
function DesktopTabs({
  desktops,
  idx,
  onPick,
}: {
  desktops: Desktop[];
  idx: number;
  onPick: (n: number) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the active tab in view when navigation happens via arrow keys or
  // swipe — otherwise users on narrow screens can lose track of where they
  // are in the carousel.
  useEffect(() => {
    const el = itemRefs.current[idx];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [idx]);

  return (
    <nav
      data-chrome="dots"
      className="sticky z-20 border-b-2 border-ink-900/15 bg-cream-100/85 backdrop-blur-md"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
      aria-label="Desktops"
    >
      <div className="mx-auto max-w-[1800px] px-2 sm:px-5">
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 sm:gap-2 sm:py-2.5">
          {desktops.map((d, i) => {
            const active = i === idx;
            const color = d.kind === 'member' ? d.color ?? undefined : undefined;
            const label = labelFor(d);
            const glyph = glyphFor(d);
            return (
              <button
                key={i}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                onClick={() => onPick(i)}
                aria-current={active ? 'page' : undefined}
                aria-label={`Open ${label}`}
                className={`group relative flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition tap-target sm:gap-2 sm:px-3.5 sm:text-[13px] ${
                  active
                    ? 'text-cream-50 ring-2 ring-ink-900 shadow-paper-sm'
                    : 'text-ink-700 ring-2 ring-transparent hover:bg-ink-900/5 hover:text-ink-900'
                }`}
                style={active ? { backgroundColor: color ?? '#10182B' } : undefined}
              >
                {d.kind === 'member' ? (
                  <MemberAvatar
                    name={d.name}
                    color={color}
                    size="xs"
                    className="!h-5 !w-5 !text-[10px] !ring-1"
                  />
                ) : (
                  <span aria-hidden className="text-sm leading-none">
                    {glyph}
                  </span>
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function labelFor(d: Desktop): string {
  if (d.kind === 'kanban') return 'Board';
  if (d.kind === 'family') return 'Family';
  if (d.kind === 'budget') return 'Budget';
  if (d.kind === 'calendar') return 'Calendar';
  if (d.kind === 'history') return 'History';
  return d.name;
}

function glyphFor(d: Desktop): string {
  if (d.kind === 'kanban') return '🗂';
  if (d.kind === 'family') return '🏡';
  if (d.kind === 'budget') return '💰';
  if (d.kind === 'calendar') return '📅';
  if (d.kind === 'history') return '📈';
  return '👤';
}
