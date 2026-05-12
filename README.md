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

Outputs to `dist/`. The same `dist/` is the payload for both:

- **Web** at `https://app.choreboard.io` — point the API's `WEB_DIST_DIR` at
  this folder and the Fastify server serves the SPA at `/` alongside the API
  at `/api/*`. Same Render service, two CNAMEs (`app.` and `api.`).
- **Native iOS + Android** via Capacitor (see below).

## Native (iOS + Android)

We ship to the App Store and Play Store as **Capacitor** wrappers around this
exact SPA. There is no React Native rewrite. See `../ChoreBoard-Api/spec.md`
§16 for the full strategy (bundle IDs, store policy posture, billing).

### One-time scaffolding

`@capacitor/core`, the CLI, the iOS and Android platforms, and the runtime
plugins (`push-notifications`, `camera`, `haptics`, `preferences`, `app`,
`status-bar`, `splash-screen`) are already installed. Configuration lives in
`capacitor.config.ts`:

- **App ID:** `io.choreboard.app`
- **App name:** `ChoreBoard`
- **Web dir:** `dist`

The `ios/` and `android/` folders are not yet generated, because each one
requires platform-specific tooling that has to be installed locally:

| Platform | Generate with                  | Requires                        |
|----------|--------------------------------|---------------------------------|
| Android  | `npm run build && npx cap add android` | JDK 17+, Android Studio      |
| iOS      | `npm run build && npx cap add ios`     | macOS, Xcode 15+, CocoaPods  |

Run each `cap add` command once, on the right machine, then commit the
generated folder. From then on the workflow is:

```bash
npm run cap:sync           # vite build + cap sync (run on any OS)
npm run cap:open:android   # opens Android Studio (Win/Mac/Linux)
npm run cap:open:ios       # opens Xcode (Mac only)
```

### What the SPA needs to behave well inside Capacitor

- **Auth.** When `VITE_BUILD_TARGET=native`, the SPA uses
  `Authorization: Bearer <session>` instead of the cookie session, because
  cross-origin cookies from `capacitor://localhost` to `api.choreboard.io`
  are flaky on iOS WKWebView. The API accepts both transports.
- **Absolute API base.** Native builds load from `capacitor://localhost`, so
  `/api/...` relative URLs do not work. Set `VITE_API_BASE_URL=https://api.choreboard.io`
  for native builds.
- **Push.** Use `@capacitor/push-notifications` to register an APNs/FCM
  token on login and `POST /api/devices`. The same notification on the web
  build still uses Web Push.
- **Camera.** Use `@capacitor/camera` for chore photos; uploads still go
  direct to R2 via the existing pre-signed URL endpoint.
- **Drag-and-drop.** `dnd-kit` already supports touch sensors. Cards opt out
  of long-press selection (`-webkit-touch-callout: none; user-select: none;`)
  so iOS does not show the system context menu mid-drag.
- **Safe areas.** `index.html` sets `viewport-fit=cover`; CSS uses
  `env(safe-area-inset-*)` on the top bar and bottom dock.
