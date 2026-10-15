# Task comments and dark mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** a comment thread on every task, and a System/Light/Dark appearance switch.

**Architecture:** a new `comments` domain (migration 007, repository, service, router) under the deliverables path; `comment_count` added to the task query; a `TaskDialog`-style detail dialog on the frontend; a `ThemeModeProvider` that builds the MUI theme per mode, with the hard-coded colours turned into tokens.

**Tech Stack:** FastAPI + psycopg + pytest (real DB), React 19 + MUI 9 + Vitest, Playwright/axe, Postman generator.

**Spec:** `docs/superpowers/specs/2026-10-15-comments-and-dark-mode-design.md`

## Global Constraints

- Before this plan: backend 309 tests 97.5%; frontend 686 tests (66 files); Postman 220/917; e2e 96 + 12. Run each task's tests before and after.
- Migrations are additive and idempotent (`IF NOT EXISTS`). Timestamps UTC. snake_case JSON. No DELETE endpoint. Targets 44 px. Axe clean in light **and** dark.
- Commits signed off with the Claude trailer; never push.

## Review Focus

1. Someone who cannot see the project must learn nothing about its tasks' comments (404, never 403, no count).
2. A comment body is text: markup typed into it is shown as typed, never run; whitespace-only and over-long bodies are refused.
3. Removing a comment: only the author, the project's manager or an admin; a removed comment never comes back in a list or a count.
4. In dark mode every text/background pair on the main screens passes the contrast rule, including chips, the selection bar, the heatmap and dialogs.
5. Theme choice survives a reload, follows the system when set to System, and a browser without storage still works.

### Task 1: Comments API
**Files:** create `app/migrations/007_task_comments.sql`, `app/domains/comments/{__init__,schemas,repository,service,router}.py`, `tests/test_comments.py`; modify `app/main.py`, `app/domains/tasks/{repository,schemas}.py` (`comment_count`), `tests/conftest.py` (drop table), `docs/postman/build_collection.py`.
**Interfaces (produces):** the three endpoints in the spec; `TaskOut.comment_count: int`.
- [ ] Failing tests (spec Tests, backend). Implement. `./bin/test-backend.sh` PASS. Postman folder `06d Comments`, regenerate, Newman. Commit `Comments: a thread on every task`.

### Task 2: The task dialog with comments
**Files:** create `components/TaskDetailDialog.tsx` (+test); modify `components/{TaskCard,TaskBoard,TaskTable}.tsx`, `pages/{TasksTab,MyTasksPage}.tsx`, `api/types.ts` and their tests.
- [ ] Failing tests (dialog contents, post, remove, permissions, counter, counts on cards/rows/My tasks, opening from each place, edit still in the menu). Implement. Commit `Tasks: open a task to read and write comments`.

### Task 3: Dark mode
**Files:** create `ThemeModeProvider.tsx` (+test), modify `theme.ts`, `main.tsx`, `components/AccountMenu.tsx` (+test), `layout/AppShell.tsx` (app bar colour), `components/{WorkloadHeatmap,SelectionBar,...}.tsx` and any other hard-coded colours found by `grep`.
- [ ] Failing tests (mode switch in the account menu, persistence, system default via `matchMedia`, storage failure, theme tokens). Implement. Commit `Appearance: system, light or dark`.

### Task 4: Slice gate
- [ ] e2e: comment as employee and manager, remove own, count on the card; dark mode scans (dashboard, projects table, people, heatmap, project page, task dialog, export dialog, search results) with axe; fix what it finds. Full gates, sample-data e2e, pictures (`u1`, `u2`, a dark dashboard), docs counts, Postman. Commit `Slice 7 gate`.

Self-review: spec A → Tasks 1-2, B → Task 3, tests → each task and Task 4; the five Review Focus lines have tests in Tasks 1-4.
