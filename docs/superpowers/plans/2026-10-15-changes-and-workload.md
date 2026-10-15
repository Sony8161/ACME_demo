# Changes card and workload heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** a "Since you last visited" card on the dashboard and a Workload heatmap on the People page.

**Architecture:** two read-only endpoints in the reports domain (`/reports/changes` over the audit log, `/reports/workload` over assignments); two small frontend pieces reading them.

**Tech Stack:** FastAPI + psycopg + pytest (real DB), React 19 + MUI + Vitest, Playwright/axe, Postman generator.

**Spec:** `docs/superpowers/specs/2026-10-15-changes-and-workload-design.md`

## Global Constraints

- Before this plan: backend 289 tests 97.5%; frontend 660 tests (63 files); Postman 211/875; e2e 89 + 12. Run each task's tests before and after.
- Scoping on the server. No money anywhere in these answers. snake_case JSON. UTC everywhere (dates and times). Targets 44 px. Axe clean.
- Commits signed off with the Claude trailer; never push.

## Review Focus

1. A manager must never see another manager's project in the changes feed, nor account changes; an employee gets 403 from both.
2. `since` in the future, far in the past, malformed, or without a time zone: bounded, rejected with the usual 400, never a slow query.
3. A week that is only partly booked, or a booking that starts mid-week or ends on a Wednesday, counts only its working days.
4. The "Got it" time is per person in this browser; a different person on the same browser does not inherit it; unavailable storage does not break the page.
5. Colour is never the only signal in the heatmap (hours are written), and the first column stays reachable by keyboard.

### Task 1: GET /reports/changes
**Files:** modify `app/domains/audit/repository.py` (`changes_since`), `app/domains/reports/{schemas,service,router}.py`, `tests/test_reports_changes.py`, `docs/postman/build_collection.py`.
**Interfaces (produces):** `audit.repository.changes_since(conn, *, since, project_ids: list[UUID] | None, exclude_actor, limit) -> (rows, total, projects)`; `reports.schemas.Changes { since: datetime, total: int, projects: int, items: list[AuditEntry] }`.
- [ ] Failing tests per the spec's "Tests" (backend part). Run: FAIL. Implement. Run `./bin/test-backend.sh`: PASS. Commit `Reports: what changed since you last looked`.

### Task 2: GET /reports/workload
**Files:** modify `app/domains/reports/{schemas,service,router}.py` (and a small query in `assignments/repository.py`), `tests/test_reports_workload.py`.
**Interfaces (produces):** `assignments.repository.weekly_hours(conn, user_ids, week_starts) -> list[rows]`; `reports.schemas.Workload`.
- [ ] Failing tests (partial weeks, two milestones in one week, outside the window, scoping, validation). Implement. PASS. Postman folder `08c Reports: changes and workload`, regenerate, Newman. Commit `Reports: workload by week`.

### Task 3: The dashboard card
**Files:** create `components/ChangesCard.tsx`, `lastVisit.ts` (+tests); modify `pages/DashboardPage.tsx` and its test, `api/types.ts`.
**Interfaces (produces):** `lastVisitKey(userId)`, `readLastVisit(userId, now?) -> Date` (7 days back when none), `markVisited(userId, now?)`; `ChangesCard()`.
- [ ] Failing tests (spec screen section, plus the storage cases). Implement. Commit `Dashboard: since you last visited`.

### Task 4: The workload heatmap
**Files:** create `components/WorkloadHeatmap.tsx` (+test); modify `pages/PeoplePage.tsx` and its test, `api/types.ts`.
- [ ] Failing tests (cells, levels, legend, summary, filter, focus, toggle `?view=workload`). Implement. Commit `People: a workload heatmap`.

### Task 5: Slice gate
- [ ] e2e on the real data (the card as admin and manager, Got it hides it and a reload keeps it hidden; the heatmap shows Kenji's weeks and a free person) plus axe; full gates; Postman; sample-data e2e; pictures `t1`, `t2`; docs counts. Commit `Slice 6 gate`.

Self-review: spec A → Tasks 1 and 3, spec B → Tasks 2 and 4, tests → each task and Task 5; the five Review Focus lines have tests in Tasks 1-4.
