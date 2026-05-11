# ChoreBoard Web

The web client for **ChoreBoard** — a family-dashboard SaaS where members claim
and complete household chores in a shared real-time view.

See `../ChoreBoard-Api/spec.md` for the v1 product spec; this repo implements
the SPA described in §4 ("The screens") and §11 ("Real-time sync").

## Stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** for styling
- **TanStack Query** for server state (cache, invalidation, retries)
- **React Router** for routing (board, member desktops, /admin)
- **dnd-kit** for the Kanban drag-and-drop (touch + mouse + keyboard)
- **EventSource (SSE)** consumer that invalidates relevant queries on family events

## Multi-desktop SPA

The home route renders a single SPA with a row of dot indicators at the top.
Desktops in order:

1. **Board** — Kanban (`Available` | per-member lanes | `Pending` | `Completed today`)
2. **Family** — leaderboard, weekly totals, payout countdown, ambient stats
3+. **Members** — one per family member (kid first, then parents) with stats,
   recent activity, badge case, and (for parents) an approval queue

Navigation: click a dot · arrow keys · swipe left/right on touch · click the
admin link in the top bar (parents only).

## Setup

1. Install Node 20+.
2. `npm install`
3. Make sure the API is running on `http://localhost:4000` (see
   `../ChoreBoard-Api/README.md`).
4. `npm run dev` — the dev server runs on port 5173 with `/api` proxied to
   the backend.

## Project layout

```
src/
  main.tsx                bootstrap, React Query provider, Router
  App.tsx                 top-level routes (auth → desktops / admin)
  index.css               Tailwind + global components
  lib/
    api.ts                fetch wrapper, throws ApiError on non-2xx
    types.ts              hand-maintained response types
    format.ts             money/time formatting + cadence prose
    session.ts            useSession / useLogout hooks
    useFamilyEvents.ts    SSE → React Query invalidator
  screens/
    AuthScreen.tsx        parent login + signup
    KidPinScreen.tsx      family pick + kid avatar grid + PIN pad
    Desktops.tsx          multi-desktop shell, dot indicator, swipe/arrow nav
    admin/
      AdminLayout.tsx     tabbed /admin shell (parents only)
      AdminChores.tsx     chore catalog CRUD + cadence editor
      AdminFamily.tsx     family settings + kids/parents management
      AdminLedger.tsx     unpaid totals, mark-paid, CSV export
  desktops/
    KanbanDesktop.tsx     dnd-kit Kanban: claim/submit/approve via drag
    FamilyDashboard.tsx   leaderboard + totals + ambient stats
    MemberDashboard.tsx   per-member stats + recent + badges + approval queue
```

## How the Kanban actions map to the API

| User action                                      | What happens                                          |
| ------------------------------------------------ | ----------------------------------------------------- |
| Drag `Available` card → a member column          | `POST /api/board/instances/:id/claim`                 |
| Drag your claimed card → `Available`             | `POST /api/board/instances/:id/unclaim`               |
| Drag your claimed card → `Pending approval`      | `POST /api/board/instances/:id/submit`                |
| (Parent) Drag pending card → `Completed today`   | `POST /api/board/instances/:id/approve`               |
| (Parent) Click *Reject* on pending card          | `POST /api/board/instances/:id/reject`                |

Kids can only drag their own cards; parents can drag anyone's. The server is
the source of truth for these rules — the UI guards just hide impossible
moves.

## Real-time

`useFamilyEvents` opens an `EventSource` to `/api/events`. Each family event
(`instance.claimed`, `instance.submitted`, `instance.approved`, `chore.updated`,
`week.closed`, etc.) invalidates the `board`, `leaderboard`, and `member`
queries so the UI catches up within ~one round trip.

## Build for production

```bash
npm run build
```

Outputs to `dist/`. Point the API's `WEB_DIST_DIR` at this folder and the
Fastify server will serve the SPA at `/` alongside the API at `/api/*` — single
origin, single deploy.
