# Show password + bigger sample company: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a "Show password" control on the sign-in and change-password screens, and a sample company of 12 projects / 30 people / 100+ tasks that an admin can load or top up.

**Architecture:** one shared `PasswordField` component; a declarative data module `seed_company.py` plus a builder that reuses the existing repositories; two idempotent seed layers behind the unchanged `POST /admin/seed-demo`; a small shared `export/csv.ts` helper (reused by slice 3).

**Tech Stack:** FastAPI + psycopg + pytest (real Postgres), React 19 + MUI + Vitest + Playwright/axe.

**Spec:** `docs/superpowers/specs/2026-10-14-sample-company-design.md` (the show-password control is a small addition requested after the spec; it is Task 1).

## Global Constraints

- Test before change and after: run the named test first and watch it fail or (for refactors) pass, then pass after the change. Baseline before this plan: backend 267 passed (97.5%), frontend 498 passed (45 files), ruff/bandit/eslint/tsc clean.
- Original 4 projects and 8 people keep names, managers, health, dependencies and the usernames used by e2e (`maria1`, `james1`, `alex01`, `priya1`, `tom001`, `lena01`, `omar01`, `sofia1`, `nina01`, `admin1`).
- Dates relative to today (UTC); money as before; snake_case JSON; no schema change; no secrets in files, pictures or docs.
- Frontend: no raw Axios messages, optional chaining on API data, `npm run build` before commit, axe clean on every new screen/dialog, targets at least 44 px.
- Commits: `git commit -s`, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. A "Show password" button inside a form must not submit it, must not break the tests/e2e that look the field up by label (`/password/i`, `getByLabel('Password')`), and the field is hidden again whenever the page is re-opened.
2. The marker user for the extended layer is archived or renamed by an admin: top-up must not try to create the layer again or crash (marker lookup ignores `archived_at`).
3. Two admins press "Sample data" at once: only one set of 22 accounts is created (advisory lock around the check).
4. CSV cells with commas, quotes, newlines, accents, and a leading `=`, `+`, `-`, `@` (formula injection); Excel needs a UTF-8 byte-order mark to show accents.
5. The credentials CSV is a plaintext password file: the dialog must say to keep it safe and delete it afterwards.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/PasswordField.tsx` (+test) | text field with a show/hide button |
| `frontend/src/export/csv.ts` (+test) | `toCsv(rows)`, `downloadCsv(filename, rows)` |
| `backend/pm-api/app/seed_company.py` | people and project data tables + `seed_extended(conn, admin_id, ctx)` builder |
| `backend/pm-api/app/seed.py` | split into `seed_core` / layers, `seed_demo` calls both |
| `frontend/src/pages/DashboardPage.tsx` | order projects by urgency |
| `frontend/src/layout/AppShell.tsx`, `nav.ts` | admin More > Sample data |
| `bin/demo-ready.sh`, `docs/*`, e2e, Postman | readable usernames, counts, pictures |

---

### Task 1: Show password on sign-in and change-password

**Files:** Create `frontend/src/components/PasswordField.tsx`, `PasswordField.test.tsx`. Modify `pages/LoginPage.tsx`, `pages/ChangePasswordPage.tsx`, their tests, `frontend/e2e/*.mjs` and `frontend/e2e/mvp-screenshots.mjs` (label lookups).

**Interfaces:**
- Produces: `PasswordField(props: TextFieldProps & { label: string })` renders a `TextField` that starts as `type="password"`; an end-adornment `IconButton` (`type="button"`, 44 px, `aria-label` `Show <label lowercased>` / `Hide <label lowercased>`, `aria-pressed`) toggles it to `type="text"`.

- [ ] **Step 1: Baseline.** `cd frontend && npx vitest run src/pages/LoginPage.test.tsx src/pages/ChangePasswordPage.test.tsx` passes.
- [ ] **Step 2: Failing tests** in `PasswordField.test.tsx`: starts hidden (`getByLabelText('Password')` has `type=password`); clicking `Show password` makes it `type=text` and the button becomes `Hide password` with `aria-pressed=true`; clicking again hides; the button has `type=button` and clicking it inside a `<form onSubmit>` does not call the handler; typing keeps the value after toggling. In `LoginPage.test.tsx`: `Show password` reveals the typed text. In `ChangePasswordPage.test.tsx`: three toggles exist (`Show current password`, `Show new password`, `Show repeat new password`). Run: FAIL (component missing).
- [ ] **Step 3: Implement** `PasswordField`; use it for the Password field on the login page and the three fields on the change-password page. Keep `autoComplete` values. Update existing lookups `getByLabelText(/password/i)` to the exact label (`'Password'`, `'Current password'`, ...).
- [ ] **Step 4: Run** the three test files, then `npm run lint && npm run typecheck`. Expected: pass.
- [ ] **Step 5: Browser check:** `getByLabel('Password', { exact: true })` in the e2e and screenshot scripts; add an axe scan of the login page with the toggle (it exists already; keep it passing).
- [ ] **Step 6: Commit** `Sign-in: show or hide the password`.

### Task 2: CSV helper and "Download CSV" on the credentials dialog

**Files:** Create `frontend/src/export/csv.ts`, `csv.test.ts`. Modify `components/CredentialsDialog.tsx`, `CredentialsDialog.test.tsx`.

**Interfaces:**
- Produces: `toCsv(rows: (string | number | null | undefined)[][]): string` (CRLF line ends, UTF-8 BOM first, cells quoted when they hold `,` `"` CR or LF, quotes doubled, a cell starting `=`, `+`, `-` or `@` gets a leading `'`, null/undefined become empty); `downloadCsv(filename: string, rows: ...[][]): void` (Blob + temporary link click + `URL.revokeObjectURL`).

- [ ] **Step 1: Failing tests** `csv.test.ts`: `toCsv([['a,b','say "hi"'],['x\ny','é']])` equals BOM + `"a,b","say ""hi"""\r\n"x\ny",é`; `=SUM(A1)` becomes `'=SUM(A1)`; `-5` as a *number* stays `-5` but as the string `'-5'` gets the apostrophe; null is empty; empty input is the BOM only. `CredentialsDialog.test.tsx`: a `Download CSV` button calls `downloadCsv('acme-logins.csv', [header row, ...one row per account])` with columns Name, Role, Username, Password; the dialog text tells people to keep the file safe and delete it afterwards.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** both; the dialog's note is one sentence appended to the existing warning.
- [ ] **Step 4: Run** tests + lint + typecheck: pass. axe scan of the dialog is covered by the e2e in Task 7.
- [ ] **Step 5: Commit** `Credentials dialog: download the logins as a CSV file`.

### Task 3: The extended company data (backend)

**Files:** Create `backend/pm-api/app/seed_company.py`. Modify `backend/pm-api/app/seed.py`. Test `backend/pm-api/tests/test_admin_seed.py` (update) and new `tests/test_seed_company.py`.

**Interfaces:**
- Produces in `seed.py`: `seed_demo(conn, admin_id) -> dict` unchanged signature, now `core` then `extended`; `_has_core(conn) -> bool` (any user with the demo email domain), `_has_extended(conn) -> bool` (email `hannah.weiss@demo.acme.example` exists, archived or not).
- Produces in `seed_company.py`: `seed_extended(conn, admin_id, make_user, ctx) -> None` where `make_user(name, role, title, salary, manager_id=None)` and a `SeedContext` (today, helpers `make_project`, `make_milestone`, `link`, `add_cost`, the existing managers/employees by first name) are passed in from `seed.py`, so the builder reuses the exact helpers the core uses. People and projects are module-level tuples.

- [ ] **Step 1: Failing tests** (`test_seed_company.py`, integration, real DB):
  - `test_fresh_seed_has_30_accounts_12_projects_100_tasks`: accounts 30 (`manager`: 4, `employee`: 26); `/projects` returns 12; sum of tasks over all milestones at least 100.
  - `test_every_project_has_the_planned_health`: `/reports/overview` → the table in the spec (4 on track, 2 at risk, 2 overdue, 3 planned incl. status `planned`, 1 `completed`).
  - `test_nobody_is_booked_twice_and_five_are_free`: for every employee no two live assignments overlap; `available_people >= 5`.
  - `test_top_up_adds_only_the_missing_layer`: seed core only via `seed._seed_core(...)` then call the endpoint: 22 accounts returned, the original eight unchanged, third call `created=False`.
  - `test_archived_marker_does_not_recreate`: archive Hannah, call again: `created=False`, no error.
  - `test_seed_finishes_in_20_seconds`.
  - Update `test_admin_seed.py`: accounts 30, project names 12, original four keep health and dependencies.
- [ ] **Step 2: Run** `./bin/test-backend.sh -k "seed"`: new tests FAIL, old ones fail on counts.
- [ ] **Step 3: Implement.** In `seed.py` extract the current body into `_seed_core(conn, admin_id) -> list[account]` returning the helpers it created; `seed_demo` takes `pg_advisory_xact_lock(DEMO_SEED_LOCK_ID)` (new constant next to `MIGRATION_LOCK_ID`), runs `_seed_core` if `not _has_core`, then `seed_extended` if `not _has_extended`, and returns `created` true when any ran, message `Demo data created` / `Added the larger sample company` / `Demo data already exists`. The data follows the spec table: managers Hannah Weiss (Product Manager, 72) and Diego Alvarez (Program Manager, 74); 20 employees with rates 35-85 spread over the four managers; eight projects, three to four milestones each, three to six tasks per milestone (statuses `todo`/`in_progress`/done, priorities, some late/unassigned/undated). Tune project numbers until the health test passes (at risk = spending ahead of calendar or staffing over budget; overdue = end date passed with open milestones; completed = every milestone signed off then `projects_repo.set_status(..., "completed")`). Staff each person on at most one milestone per date range; leave at least five employees unassigned today.
- [ ] **Step 4: Run** the seed tests then the whole backend gate `./bin/test-backend.sh`: expect all pass, coverage at least 97%, ruff/bandit clean.
- [ ] **Step 5: Commit** `Sample data: a company of 12 projects and 30 people`.

### Task 4: Dashboard shows the urgent projects first

**Files:** Modify `frontend/src/pages/DashboardPage.tsx`, `DashboardPage.test.tsx`.

- [ ] **Step 1: Failing test:** with projects given as `on_track`, `completed`, `overdue`, `planned`, `at_risk` the rows render in the order overdue, at risk, on track, planned, completed (ties keep API order). Run: FAIL.
- [ ] **Step 2: Implement** a pure `byUrgency(projects)` in the page file using `summary.riskLevel` and `status`.
- [ ] **Step 3: Run** the page test + lint + typecheck: pass. **Step 4: Commit** `Dashboard: most urgent projects first`.

### Task 5: More > Sample data (admin)

**Files:** Modify `frontend/src/layout/AppShell.tsx` (and `nav.ts` if the menu is declared there) and tests.

- [ ] **Step 1: Failing tests:** an admin sees `Sample data` in the More menu; managers and employees do not; choosing it opens a confirmation (`Add sample people and projects?`); confirming posts `/admin/seed-demo`; a created response opens the credentials dialog; `created:false` shows the toast `Sample data is already loaded`; a failed call shows the server sentence.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement** with the existing `ConfirmDialog`, `useToast` and `CredentialsDialog`; move the seed call used by the dashboard into one small hook `useSeedDemo()` (`frontend/src/api/useSeedDemo.ts`) both places share (DRY).
- [ ] **Step 4: Run** tests, lint, typecheck, build. **Step 5: Commit** `Admin menu: add sample data to a live site`.

### Task 6: Demo scripts, docs and Postman

**Files:** `bin/demo-ready.sh`, `docs/DEMO.md`, `docs/OVERVIEW.md`, `docs/TESTING.md`, `docs/CONTEXT.md`, READMEs, `docs/postman/build_collection.py` (regenerate the collection).

- [ ] **Step 1: Failing check:** run `./bin/demo-ready.sh` against the branch demo and `curl` `maria1`, `hann01` sign-in: `hann01` fails.
- [ ] **Step 2: Implement** readable usernames for every demo-domain user not already named (first four letters of the first name + `01`, `02` on a clash); print the new managers in the table. Update counts everywhere (8 people / 4 projects → 30 / 12 where it describes the sample company; keep "the original four" wording in the Acts). Postman: seed check `accounts` length 30; rebuild the collection.
- [ ] **Step 3: Run** `DEMO_API_PORT=8010 DEMO_WEB_PORT=3010 DEMO_PG_PORT=55433 ./bin/demo-local.sh reset`, sign in as `admin1`, `maria1`, `hann01`; run the Postman collection against it. Expected: all assertions pass.
- [ ] **Step 4: Commit** `Docs and scripts for the larger sample company`.

### Task 7: Slice gate (QA)

- [ ] `./bin/test-backend.sh` (all pass, 97%+ coverage); `cd frontend && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm audit` (all clean, 80%+ gate).
- [ ] `BASE_URL=http://localhost:3010 npm run e2e` (existing checks plus: load sample data → 12 projects, Download CSV present, show-password toggle on login; axe clean on the dialog, the new menu item and the login toggle). Fix what fails.
- [ ] Phone width 390 px by hand through the e2e viewport: dashboard with 12 rows, no horizontal scroll.
- [ ] `npm run screenshots`; update changed pictures. Commit `Slice 1: gate green, pictures retaken`.

---

Self-review: every spec section has a task (data → 3, code layers → 3, credentials CSV → 2, admin menu → 5, dashboard order → 4, scripts → 6, tests/gate → 7); the show-password request is Task 1; the five Review Focus lines have a test in Tasks 1, 2 and 3 (concurrency is covered by the advisory lock in Task 3 and a test that runs the endpoint twice in parallel threads).
