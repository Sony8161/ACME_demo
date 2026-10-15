# Export and bulk actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** CSV export of picked (or all matching) rows from the People, Projects and Tasks tables, and bulk archive / move / set owner.

**Architecture:** column definitions per table; one generic `ExportDialog`; a small `runBulk` helper and `BulkResultDialog`; wiring in the three table components. No API change.

**Tech Stack:** React 19, MUI, Vitest, Playwright/axe. Uses `export/csv.ts` from slice 1 and the `table/` kit from slice 2.

**Spec:** `docs/superpowers/specs/2026-10-15-export-and-bulk-design.md`

## Global Constraints

- Before this plan: frontend 576 tests (54 files), 98.45%/97.5%; backend 278. Run each task's tests before and after.
- No money or hourly cost in a file unless the screen shows it to that person. UTC date in file names. Targets 44 px. Axe clean.
- Commits signed off with the Claude trailer; never push.

## Review Focus

1. A column that is null for this person (money for employees, cost for managers) is not offered, and is not in the file.
2. Nothing ticked exports everything matching the filters; ticked exports only the ticked rows, in the order shown.
3. Cell text that starts like a formula, contains commas, quotes, newlines or accents is exported safely.
4. Bulk: one row failing must not stop the others; failures show the server's sentence; rows that succeeded are not retried.
5. A manager cannot see the bulk Archive; an employee sees no table tools beyond sorting.

### Task 1: Columns and the export dialog
**Files:** create `frontend/src/export/columns.ts` (+test), `frontend/src/components/ExportDialog.tsx` (+test).
**Interfaces (produces):** `interface ExportColumn<T> { key: string; label: string; get: (row: T) => string | number | null }`;
`peopleColumns(opts: { admin: boolean; nameOf: (id: string | null) => string | undefined }): ExportColumn<User>[]`;
`projectColumns(opts: { money: boolean }): ExportColumn<Project>[]`; `taskColumns(): ExportColumn<Task>[]`;
`exportFileName(kind: 'people' | 'projects' | 'tasks', now?: Date): string`;
`ExportDialog<T>({ open, noun: string, rows: T[], columns: ExportColumn<T>[], filename: string, onClose, onExported(count: number) })`.
- [ ] Failing tests: each column list returns the right cells for a sample row (dates ISO, Late `Yes`/`No`, Why = first risk reason); cost absent for non-admin; money columns absent when `money` is false; file name `acme-people-2026-10-15.csv` from a fixed UTC date; dialog lists all columns ticked, `Download CSV` is disabled when none is ticked, calls `downloadCsv(filename, [header, ...rows])` with only ticked columns in column order, then `onExported(rows.length)` and closes. Run: FAIL.
- [ ] Implement. Run tests, eslint, tsc: PASS. Commit `Export: columns and a dialog to choose them`.

### Task 2: Bulk runner and result dialog
**Files:** create `frontend/src/table/bulk.ts` (+test), `frontend/src/components/BulkResultDialog.tsx` (+test).
**Interfaces (produces):** `runBulk<T>(items: T[], act: (item: T) => Promise<unknown>, label: (item: T) => string): Promise<{ done: T[]; failed: { item: T; name: string; message: string }[] }>` (sequential, never throws; a failure's message is `errorText(err)`); `BulkResultDialog({ open, title, done: number, failed: { name: string; message: string }[], onClose })`.
- [ ] Failing tests: all succeed; the middle one fails and the rest still run and the order is kept; the failure carries the server sentence; empty list; dialog says "Archived 2." and lists "Ada Admin: reason" for failures, and nothing about failures when none. Run: FAIL. Implement. PASS. Commit `Bulk: run an action over ticked rows and report each`.

### Task 3: People, Projects and Tasks
**Files:** modify `PeoplePage.tsx`, `ProjectsTable.tsx`, `TaskTable.tsx`, `TasksTab.tsx` and their tests.
- [ ] Failing tests per table: `Export all N` / `Export M selected` label; opening the dialog shows the right noun and count; the download receives only ticked rows (or all matching when none) in table order; People bulk **Archive** for an admin (confirm text, calls `POST /users/:id/archive` for each, result dialog, reload; absent for a manager); Tasks bulk **Move to** and **Set owner** for people who may manage (calls `PATCH …/deliverables/:id` with `status` or `assignee_id`; absent for employees/owners without manage rights; failures listed). Run: FAIL.
- [ ] Implement with Tasks 1-2. Run tests, eslint, tsc, build: PASS. Commit `Export and bulk actions on the three tables`.

### Task 4: Slice gate
- [ ] e2e additions (`demo-flow.mjs`): tick three people, Export, untick one column, download and read the CSV (header, rows, no hourly cost for a manager sign-in; present for admin), Projects `Export all 12`, Tasks export of one ticked task, admin bulk Archive of two throwaway people created in the run then restore via Archive page (or only assert the confirm dialog and cancel to keep data stable), axe on both dialogs and the result dialog.
- [ ] Full gates: backend `./bin/test-backend.sh` (unchanged 278); frontend lint, types, coverage, build, audit; `./bin/demo-local.sh ready` then e2e; phone 390 px; screenshots (add `q1`, `q2`); docs counts. Commit `Slice 3 gate`.

Self-review: spec export → Tasks 1 and 3; bulk → Tasks 2 and 3; tests → each task and 4; the five Review Focus lines are tests in Tasks 1-3.
