import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useLogout, useSession } from '../lib/session';
import type { BoardResponse, LeaderboardResponse } from '../lib/types';
import { KanbanDesktop } from '../desktops/KanbanDesktop';
import { FamilyDashboard } from '../desktops/FamilyDashboard';
import { BudgetDesktop } from '../desktops/BudgetDesktop';
import { MemberDashboard } from '../desktops/MemberDashboard';
import { ChampionBanner } from '../ui/ChampionBanner';
import { PageTag, Wordmark } from '../ui/primitives';

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
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) > 90) setIdx(idx + (dx < 0 ? 1 : -1));
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

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        familyName={board.data?.family.name}
        payoutAt={leaderboard.data?.payoutAt ?? null}
        onLogout={() => logout.mutate()}
        showAdmin={isParent}
        pendingApprovalCount={pendingApprovalCount}
        index={idx + 1}
        tagLabel={tag.label}
        tagTitle={tag.title}
      />

      <DotIndicator desktops={desktops} idx={idx} onPick={setIdx} />

      <main className="flex-1 overflow-hidden">
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
            member={{ type: desktop.type, id: desktop.id, name: desktop.name, color: desktop.color }}
            board={board.data}
          />
        )}
      </main>

      <ChampionBanner />
    </div>
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
}: {
  familyName?: string;
  payoutAt: string | null;
  onLogout: () => void;
  showAdmin: boolean;
  pendingApprovalCount: number;
  index: number;
  tagLabel: string;
  tagTitle: string;
}) {
  // Tick the countdown so the "pays out in 2h" pill ages without a full
  // refetch.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex items-start justify-between border-b-2 border-ink-900 px-5 py-3 sm:px-7 sm:py-4">
      <div className="flex flex-col gap-1">
        <Wordmark size="md" />
        {familyName && (
          <span className="ml-9 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {familyName}
          </span>
        )}
      </div>
      <div className="flex items-start gap-4">
        {pendingApprovalCount > 0 && (
          <span className="pill-pending">
            {pendingApprovalCount} pending approval
            {pendingApprovalCount === 1 ? '' : 's'}
          </span>
        )}
        {payoutAt && (
          <span className="pill hidden sm:inline-flex">
            Pays out {formatPayoutShort(payoutAt)}
          </span>
        )}
        {showAdmin && (
          <Link to="/admin" className="btn-ghost">
            Admin
          </Link>
        )}
        <button className="btn-ghost" onClick={onLogout}>
          Sign out
        </button>
        <div className="ml-2">
          <PageTag index={index} label={tagLabel} title={tagTitle} />
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
    <nav className="flex items-center justify-center gap-2 border-b-2 border-ink-900/15 px-4 py-2.5">
      {desktops.map((d, i) => {
        const active = i === idx;
        const color =
          d.kind === 'member' ? d.color ?? undefined : undefined;
        const label = labelFor(d);
        return (
          <button
            key={i}
            onClick={() => onPick(i)}
            className="group relative flex items-center"
            aria-label={label}
          >
            <span
              className={`h-2.5 rounded-full transition-all ${
                active ? 'w-7' : 'w-2.5'
              }`}
              style={{
                backgroundColor: active ? color ?? '#10182B' : 'rgba(16,24,43,0.25)',
              }}
            />
            <span
              className={`pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-ink-700 transition-opacity ${
                active ? 'opacity-90' : 'opacity-0 group-hover:opacity-60'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function labelFor(d: Desktop): string {
  if (d.kind === 'kanban') return 'Board';
  if (d.kind === 'family') return 'Family';
  if (d.kind === 'budget') return 'Budget';
  return d.name;
}
