# ACME Project Tracker: the short version

What is built, how it was tested, how it is put together, and what to do next. Figures are from 2026-10-14 on the final code.

## 1. What is built

A project-tracking system that answers three questions without timesheets: **which projects are healthy, which are at risk, and who is
working on what.** Every Monday to Friday on a milestone is an 8-hour shift, so hours and cost come from the calendar.

| Area | What it does |
|---|---|
| Three roles | Admin (everything), manager (their own projects), employee (only their own work, never any money). What a person may not see is `404`, not `403` |
| People and projects | Admin creates people (generated username and one-time password) and projects (exactly one manager each) |
| Milestones | The unit of work: dates, planned hours and budget that must fit inside the project; a deliverable checklist; sign-off needs every item ticked and a review note |
| Teams | Several people per milestone, but one milestone per person per day across all projects (a double booking is refused and names the clash) |
| Hours and cost | Expected hours and cost are stored when the work is planned, at that day's rate, by a database trigger; "so far" is calculated. A raise never reprices the past |
| Risk | On track, at risk or overdue, always with the reasons (dates, hours, budget, forecast staffing cost) |
| Archive, never delete | The API has no `DELETE`. Archived things are visible to admins, who can restore them |
| **Tasks (new)** | A deliverable is a task with an owner, a priority, a due date and a status. A board (drag a card between To do, In progress and Done) and a list per project, and "My tasks" for employees. An owner starts or pauses their own task; only a manager or admin finishes it. Every move is in the history |
| **Assistant (new)** | A chat box on every screen. It answers from read-only lookups run as the person asking, so it cannot see more than they can. Built-in answers with no setup; with an `ANTHROPIC_API_KEY` a model chooses the lookups. It cannot change anything |
| **Dependencies** | A milestone (in any project you manage) or a project can wait for another. The later one cannot be started or completed until the earlier is completed, loops are refused, and the screens say what is waiting on what. Links are archived, never deleted, and are in the history |
| **Timeline** | Every open project on one calendar, with its milestones; and one project's milestones with each task as a diamond on its due date. Same colours as everywhere else, a line for today, readable by a screen reader as a list |
| **History** | Who created, edited, archived or restored what, and when, with the exact fields that changed. Admins read all of it, a manager reads their own project's; it cannot be edited or removed |
| Protection | bcrypt, 8-hour tokens that can be revoked, forced first password change, request limits per person and per address, a lock after five wrong passwords |
| Web app | React + TypeScript + MUI, one app for all roles, works on a phone |

Not built: real-time updates, background tasks, MongoDB and a progressive web app. The assistant answers from built-in rules and can use an AI model when a key is set (no real AI request has been made yet). The Terraform was applied to the workshop AWS account on 2026-10-14; the demo also runs on LocalStack.

## 2. How it was tested

| Check | Result |
|---|---|
| Backend, on a real PostgreSQL (rules through HTTP, plus unit tests) | **322 pass**, 97.5% coverage (gate 80%); ruff and bandit clean |
| Frontend (every page, dialog and role difference, API mocked at the axios adapter) | **731 pass**, 98.1% statements, 96.2% branches (gate 80%); lint, types, build and `npm audit` clean |
| API contract, every endpoint (Postman/Newman on LocalStack) | **231 requests, 960 assertions, 0 failed, 61 of 61 operations** (run against the API under uvicorn on this branch) |
| End to end in a real browser (browser, proxy, Lambda, PostgreSQL) | **126 of 126 checks** (114 in the demo journey, 12 in the sample-data run), including 39 accessibility scans |
| Load, realistic (about 19 requests a second across three people) | 1,197 requests, **0 failed**, median 20 ms, 95th percentile 35 ms |

How: **tests run on a real database, not a mock**, because most of the risk is in rules that cross layers (who may see a project, overlap
checks and their row lock, SQL date maths). Every rule has a test that fails without it. An independent review of the whole branch found
seven real defects (for example a removed employee who could still read a project); each was reproduced first, fixed, and given a test.
The first accessibility scan found a real problem too, and a later one caught a colour-contrast failure in the new history page.

Honest limits: the stress profile stalls LocalStack on a 2-CPU machine (its log says `Too many open files`), so it measures the emulator and not AWS;
no test uses two real connections to prove the lock that stops simultaneous double booking; the CI workflow has never run on GitHub.

## 3. Architecture and modularity

```
browser -> CloudFront -> S3 (React)           local demo: browser -> Vite :3000 -> proxy :3001 -> Lambda (in LocalStack)
                      -> Lambda (FastAPI) -> PostgreSQL / Aurora
```

A **modular monolith**: one deployable, one Lambda, one transaction per request. Inside, each feature (`auth`, `users`, `projects`,
`milestones`, `deliverables`, `assignments`, `costs`, `reports`, `admin`, `audit`) is a module with the same four layers, and dependencies point one way:

`router` (URLs) -> `schemas` (validation) -> `service` (the rules) -> `repository` (the SQL)

Why not microservices: assigning a person checks the person, the milestone, the project and their other work in **one transaction**; splitting
those would need distributed transactions for no gain at this size. The module boundary is the seam if a part ever has to be split out
(reports and notifications are the likely first ones). The history module was added as one new folder plus one migration, and touched
existing code in two places (the current-user dependency and the router list), which is the test of whether the boundaries are real.

## 4. Database architecture

PostgreSQL, plain SQL through psycopg 3, migrations as numbered SQL files applied once under a lock.

| Table | Holds | Notable rules |
|---|---|---|
| `users` | people, role, manager, hourly rate | unique username and lower-cased email; a counter that revokes old tokens |
| `projects` | name, one manager, dates, hours, budget | unique active name; end not before start |
| `milestones` | dates, planned hours and budget, status, review note | belongs to one project |
| `milestone_assignments` | a person on a milestone for a date range | **stored** hourly rate, expected hours and cost, filled by a trigger |
| `deliverables`, `project_costs` | the checklist, now also the tasks (status, owner, priority, due date); non-labor spend | archived, never deleted; a trigger keeps the tick and the status in step |
| `audit_log` | the history | written by triggers; no foreign keys; `UPDATE` and `DELETE` refused |

Three triggers carry rules that must never be forgotten: `set_updated_at`, `assignment_precalculate` and `audit_row`. Everything uses
`timestamptz` in UTC, money is `numeric`, and no row is ever deleted (`archived_at` instead). The old time-tracking tables are renamed and kept.

## 5. Scalability

The website (S3 and CloudFront) scales without work. The API is stateless (signed tokens, no session in memory), so Lambda adds a container per
concurrent request. **The first limit is database connections**: each container holds one, and the stress run opened 41 containers and 39 connections.

| When | Do this |
|---|---|
| Before go-live (cheap) | One call for the project page, cache headers on hashed files, a database snapshot, a WAF rate rule, alarms, a load test on AWS |
| About 50 concurrent users, or "too many connections" | RDS Proxy and reserved Lambda concurrency |
| Slow reports, or database CPU above 70% | A read replica and precomputed reports |
| A feature that takes seconds, or a wish for live updates | A queue and a worker, then server-sent events or WebSockets |

The history table grows with every change. At this size that is irrelevant; at tens of millions of rows partition it by month (the time index is
already in place) and move old months to cold storage. Paging is mandatory (100 at most) and every filter is indexed.

## 6. What to improve, and how to optimise

| # | Item | Why | Size |
|---|---|---|---|
| 1 | One endpoint for the project page (milestones with checklist and team) | About 27 requests for 12 milestones today | Small |
| 2 | Page every list (people, costs, deliverables); the overview stops at 500 | Predictable response size | Small |
| 3 | A browser data cache (TanStack Query) | Fewer calls between screens | Medium |
| 4 | Bound dates and compute working days directly | A year-9999 typo should not slow everyone | Small |
| 5 | Edge rate rule (WAF); today the request limit counts per container | A limit that holds across containers | Small |
| 6 | Apply the Terraform to AWS and run the same Postman collection there | The deployment is the largest unproven part | Medium |
| 7 | A final database snapshot before changes; lock the history table down with database privileges | The app user could still drop the table | Small |
| 8 | Read real slow queries (`pg_stat_statements`, `EXPLAIN`) before adding any more indexes | Add only what is used | Small |
| 9 | About 20 lesser review findings: a milestone-name unique index, a last-admin race, a manager overview that shows other managers' project names, zero-budget overspend not flagged | Listed in `docs/CONTEXT.md` | Mixed |

Then, in order: milestone dependencies ("blocked by"), a holiday and leave calendar, notifications, and only if wanted the guide's extras
(real-time, background tasks, PWA, AI).

## 7. Where to look

| For | Open |
|---|---|
| Run and present it | [DEMO.md](./DEMO.md) |
| Every test command and result | [TESTING.md](./TESTING.md) |
| What each MVP item maps to | [MVP.md](./MVP.md) |
| Decisions, open items, what is not done | [CONTEXT.md](./CONTEXT.md) |
| Pictures (36, with the history screens in `extra-history-and-audit/`) | [demo-screenshots/](./demo-screenshots) |
