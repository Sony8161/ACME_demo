# Smart tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** tick, sort, filter and page the People, Projects (new Table view) and project Tasks lists.

**Architecture:** a small `table/` kit of pure functions, hooks and cells, used client-side by each screen over the lists it already fetches.

**Tech Stack:** React 19, MUI, Vitest + Testing Library, Playwright/axe.

**Spec:** `docs/superpowers/specs/2026-10-14-smart-tables-design.md`

## Global Constraints

- Baseline before this plan: frontend 520 tests, 98.4% / 97.2%; lint, typecheck, build, audit clean. Run each task's tests before and after.
- No API change. Targets 44 px. No raw Axios messages. Money columns only where `summary.budgetPct` is not null (never for employees).
- Commits signed off with the Claude trailer; never push.

## Review Focus

1. Ticked rows that a filter or search hides are dropped, so they can never be exported or changed unseen.
2. Sorting with empty values, equal values (stable), and mixed case or numbers inside text.
3. A page that no longer exists after the list shrinks (last page emptied by a filter) falls back to a valid page.
4. Select-all on a page vs. across pages; the half-ticked header box.
5. Keyboard: Space ticks, Enter or Space on a header sorts; `aria-sort` is announced.

### Task 1: The table kit
**Files:** create `frontend/src/table/{sort.ts,useSort.ts,usePaged.ts,useSelection.ts,SortHead.tsx,SelectCells.tsx,SelectionBar.tsx}` and a test beside each.
**Interfaces (produces):** `type Direction = 'asc' | 'desc'`; `sortRows<T>(rows: T[], get: (row: T) => string | number | null | undefined, dir: Direction): T[]`;
`useSort<K extends string>(key: K, dir?: Direction): { key: K; dir: Direction; toggle(k: K): void }`;
`usePaged<T>(rows: T[], pageSize: number, resetKey: string): { page: number; pages: number; setPage(p: number): void; pageRows: T[] }`;
`useSelection<T extends { id: string }>(rows: T[]): { ids: ReadonlySet<string>; count: number; has(id: string): boolean; toggle(id: string): void; toggleMany(ids: string[], on: boolean): void; selectAll(): void; clear(): void }`;
`SortHead({ label, active, dir, onSort, align? })`; `SelectCell({ label, checked, onChange })`; `SelectAllCell({ pageIds, ticked, total, onChange })`; `SelectionBar({ count, total, onSelectAll, onClear, children? })`.
- [ ] Write failing tests for every behaviour in the spec's kit list (names state the behaviour; e.g. `empty values sort last in both directions`, `natural order: Task 2 before Task 10`, `selection drops ids that leave the rows`, `page falls back to the last page when the list shrinks`, `header box is half ticked when some rows are`). Run: FAIL (modules missing).
- [ ] Implement minimal code. Run the kit tests: PASS. Run lint + typecheck.
- [ ] Commit `Tables: a small kit for sorting, ticking and paging`.

### Task 2: People
**Files:** modify `pages/PeoplePage.tsx` and its test.
- [ ] Failing tests: clicking `Name`/`Role`/`Username`/`Reports to` sorts (and `Hourly cost` for an admin, absent for a manager); a Role filter and a Reports-to filter narrow the rows; tick one row shows `1 selected`; the header box ticks the page; `Clear` unticks; with 31 people the first page has 25 rows and a Pager; a filter that hides a ticked person drops it from the count; the actions menu button keeps working. Run: FAIL.
- [ ] Implement with the kit (client-side filters over `list.items`, reports-to names from the fetched list). Run the page tests, lint, typecheck: PASS. Commit `People: sort, filter, tick and page`.

### Task 3: Projects table view
**Files:** modify `pages/ProjectsPage.tsx`, create `components/ProjectsTable.tsx` (+tests).
- [ ] Failing tests: `?view=table` shows the table with columns Project, Manager, Health, Milestones, Budget used, Ends; the budget column is absent when budget percentages are null; sort by Ends and by Health (overdue first); tick and the bar; the view toggle offers Cards, Table (and Timeline for managers/admins) and keeps the search, Status and Health filters; paging at 25. Run: FAIL.
- [ ] Implement. Run tests, lint, typecheck: PASS. Commit `Projects: a sortable, tickable table view`.

### Task 4: Tasks list
**Files:** modify `components/TaskTable.tsx`, `pages/TasksTab.tsx` and tests.
- [ ] Failing tests: sort by Task, Status (to do, in progress, done), Priority (urgent first), Owner (unassigned last), Due (late first among dated, undated last); tick, bar, Clear; 25 per page; the row menu and drag/drop board unaffected. Run: FAIL.
- [ ] Implement. Run tests, lint, typecheck: PASS. Commit `Tasks: sort, tick and page the list view`.

### Task 5: Slice gate
- [ ] Add to `e2e/demo-flow.mjs` (and ledger the new total): People table sorts by Name, tick two rows shows `2 selected`, Projects Table view loads with 12 rows, Tasks list sorts; axe on the three tables; keyboard tick with Space.
- [ ] Full gates: `./bin/test-backend.sh`; `cd frontend && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm audit`; `BASE_URL=http://localhost:3010 npm run e2e` after `./bin/demo-local.sh ready`; phone width 390 px with no horizontal page scroll; `npm run screenshots`; update docs counts. Commit `Slice 2 gate`.

Self-review: spec table rows map to Tasks 2-4, kit list to Task 1, tests to each task and Task 5; the five Review Focus lines are tests in Tasks 1-4.
