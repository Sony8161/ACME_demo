# ACME Project Tracker: frontend

React + TypeScript + Material UI single-page app for the `pm-api` backend. One app, three roles: the menu and
the pages each person sees follow their role, and the server enforces the same rules.

| Role | Opens to | Can do |
|---|---|---|
| Admin | Dashboard | Everything: create projects and people, archive and restore, read the history of every change, load sample data |
| Manager | Dashboard | Run their projects: milestones, tasks, team, costs, completion; read their project's history |
| Employee | My work | See their milestone, hours this week and their own tasks. No money is ever shown |

## Run it

```sh
cd frontend && npm install
# 1. start the API (see ../backend/pm-api): POSTGRES_NAME=pm_dev uvicorn app.main:app --port 8000
# 2. start the site; /api/pm-api is forwarded to the API, so no CORS setup is needed
npm run dev          # http://localhost:3000
```

First sign-in: `admin1` / `ChangeMe123!` (you must choose a new password), then **Load sample data** on the
dashboard. It creates two managers, six employees and four projects and shows their one-time passwords once.

`VITE_API_URL` (empty by default) is the address of the API when it is not on the same host as the site.
`VITE_PROXY_TARGET` changes where `npm run dev` forwards API calls (default `http://127.0.0.1:8000`).
`./bin/start-dev.sh` and `./bin/deploy-frontend.sh` set these for LocalStack and AWS.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Type check, then production build into `dist/` |
| `npm test` | Vitest and React Testing Library: 498 tests across the API client, every page and dialog, role guards, session refresh |
| `npm run test:coverage` | The same with an 80% gate on statements, branches, functions and lines (currently 98% statements / 97% branches) |
| `npm run screenshots` | Re-takes the 46 demo pictures in `docs/demo-screenshots/` (one folder per MVP item) from the running demo |
| `npm run e2e` | Playwright through the real stack (see `docs/TESTING.md`): the demo journey for all three roles plus axe accessibility scans |
| `npm run lint` | ESLint (TypeScript, React hooks rules) |

## Layout

```
src/
  api/         client.ts (one axios instance with interceptors: token, error shape, 401), case.ts (snake_case <-> camelCase),
               types.ts (response shapes), useApi.ts (load data for a screen)
  auth/        AuthProvider (token + user, kept in localStorage), route guards
  layout/      AppShell: top navigation on a laptop (Dashboard, Projects, People; admins also get a More menu with History and Archive), a bottom bar of at most four entries on a phone, an account menu, toasts with Undo
  components/  PulseBar (the signature progress bar), RiskChip, ProjectCard (one compact row), MilestoneCard (one collapsible row), Stat, EmptyState, ConfirmDialog, AccountMenu, ToastProvider, HistoryList, Pager, TaskBoard, TaskCard, TaskTable, TimelineChart, DependencyPanel, AssistantChat,
               FormDialog (every "fill in and confirm" action), CredentialsDialog, Async
  pages/       Login, ChangePassword, Dashboard, Projects, ProjectDetail (four tabs: Plan with a List/Timeline switch, Tasks, Team & costs, History; dependencies open from the tag or the ... menu), People (with an Availability view), History (admin), Archive (admin, one list), MyWork (employees; includes their tasks); Projects has a List/Timeline switch for managers and admins
```

## Design rules

- One question per screen. Colour means status only (green on track, amber at risk, red overdue, grey done). Teal is the brand: navigation, focus and the main action.
- **Look:** a flat, square-edged teal design in Plus Jakarta Sans (self-hosted through `@fontsource/plus-jakarta-sans`, so it works offline): a top navigation bar instead of a side menu, hairline borders instead of shadows, small rectangular buttons and tags, and 12 px bold labels over every figure and column. Health is shown once, by the tag (no coloured edges); each milestone is one collapsible row with a single ... menu for its actions. The accent teal is too pale for text, so links and text use a deeper teal. Everything lives in `src/theme.ts` and `src/layout/AppShell.tsx`; the end-to-end test's accessibility scan enforces 4.5:1 text contrast on it.
- The **pulse bar** shows work done (the fill) against the calendar (the dark marker): fill short of the marker means behind.
- Plain words, a confirmation that says what will happen before anything is archived or completed, and every server error shown as the sentence the server wrote.
- **Less to look at:** one health signal per card; explanations live behind an info icon, not in paragraphs; sections with nothing in them are left out; each screen has one primary button. A task is called a task everywhere (the API still says "deliverable").
- **Feedback:** a message at the bottom says what just happened, with **Undo** for moving a task, starting a milestone, removing a dependency. Buttons that cannot work yet are switched off with the reason (Complete milestone until every task is done).
- The current tab and view live in the address (`?tab=tasks`, `?view=timeline`), so refresh, back and shared links work. `/timeline` and `/my-tasks` redirect.
- Phone first: the menu becomes a bottom bar of at most four entries, dialogs fill the screen, forms stack, touch targets are at least 44 px.

## Known limits (demo scope)

- Data is loaded with a small `useApi` hook. A production version would add a cache (TanStack Query) and, for the
  project page, one endpoint that returns milestones with their checklists instead of one request per milestone.
- Not built yet: editing your own profile, editing a project's fields, moving an employee to another manager,
  restoring archived milestones, pagination controls on the project and people lists (the History pages are paged).
