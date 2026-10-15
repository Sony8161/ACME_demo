# Slice 1: a bigger sample company

Branch `feature/export-and-scale` (from `feature/timeline-months`). Status: **draft, waiting for review**.

## Roadmap this belongs to

The request was: export to PDF/CSV with a way to pick items, a much fuller sample company (10+ projects, 25+ employees) and more
UI/UX features. It was split into seven slices, each with its own spec, tests and commit, each usable on its own:

| # | Slice | Backend change |
|---|---|---|
| 1 | **Bigger sample data** (this spec) | seed only |
| 2 | Smart tables: tick rows, sort, filter, page (Projects, People, Tasks) | none |
| 3 | CSV export of ticked rows/columns, bulk actions | one bulk endpoint |
| 4 | Project report PDF with tick-box sections | none |
| 5 | Search box in the top bar (projects, people, tasks) | one search endpoint |
| 6 | "Since you last visited" card, workload heatmap | two read endpoints |
| 7 | Dark mode, task comments | one table + migration |

Slice 1 comes first because every later slice needs a company big enough to show why it exists.

## What the user asked for

> "more populated around 10+, and 25+ employees"

Success: sign in as the admin, click **Load sample data**, and see a dashboard, timeline, people list and availability view that
look like a real company: **12 projects, 30 people (4 managers, 26 employees), about 100 tasks**, every health state present,
a few people free today. The original four projects and eight people stay exactly as they are, so the walkthrough in
`docs/DEMO.md`, the pictures and Postman keep working.

## Design

### Data

- **People**: add two managers (Hannah Weiss, Diego Alvarez) and 20 employees. Totals: 4 managers + 26 employees = 30 accounts
  (plus the admin). Each employee reports to one manager (the existing rule). Hourly rates vary (35 to 85).
- **Projects**: add eight, for 12 in total, with this health mix (dates are relative to today so the data never goes stale):

| Health | Projects |
|---|---|
| On track (4) | Website Redesign*, Payments Gateway Upgrade, Warehouse Automation, Analytics Dashboard |
| At risk (2) | Data Platform Migration*, Customer Support Chatbot |
| Overdue (2) | Mobile App Launch*, Security Compliance Audit |
| Planned (3) | Customer Portal*, HR Self-Service Portal, Partner Onboarding Kit |
| Completed (1) | Brand Refresh |

  (* = existing.) Each manager runs three projects.
- **Milestones and tasks**: two to four milestones per new project and three to six tasks per milestone. Mixed statuses
  (to do, in progress, done), priorities and due dates (some late, some unassigned, some without a date), so the board, the
  filters and later the exports have something to show. Target: at least 100 tasks in total.
- **Staffing**: nobody works two overlapping milestones (the server rule). At least five employees are free today, so
  "Free today" and availability are not empty. A few people work two milestones one after the other.
- **Costs and dependencies**: two to four cost lines per active project; three new dependencies (one milestone link inside Payments,
  HR portal waits for the Security audit, Partner kit waits for Payments).

### Code

- New `backend/pm-api/app/seed_company.py` holds the extra people and projects as plain data tables plus one small builder that
  reuses the repositories (as `seed.py` does today). `seed.py` keeps the original code unchanged and calls it. This keeps `seed.py`
  readable and puts the numbers where a person can edit them.
- Two idempotent layers, each with its own marker, so the AWS site (which already has the original eight people) can top up:
  - core: any user with the demo email domain exists, as today;
  - extended: the marker user `hannah.weiss@demo.acme.example` exists.
  `POST /admin/seed-demo` creates whatever layer is missing. `created` is true if anything was created; `accounts` lists only the new
  logins. Response shape does not change.
- Passwords stay random and one-time, as today. About 30 bcrypt hashes take roughly 8 s on the Lambda; the Lambda timeout is 300 s
  and CloudFront waits 60 s, so this fits. A test asserts the whole seed finishes within 20 s locally.

### Screens

- **Credentials dialog**: new **Download CSV** button next to "Copy all" (30 logins do not fit on a screen). A small shared helper
  `frontend/src/export/csv.ts` builds and downloads the file. It quotes cells properly and neutralises spreadsheet formulas
  (a cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe). Slice 3 reuses it.
- **Admin menu**: **More > Sample data** asks for confirmation, calls the same endpoint and shows the credentials dialog, or a toast
  ("Sample data is already loaded") when nothing was missing. This is how the AWS site gets the larger company without wiping anything.
- The empty-dashboard **Load sample data** button keeps working and now loads everything.
- **Dashboard**: with 12 project rows the page is long, so projects are ordered most urgent first (overdue, at risk, on track, planned,
  completed). Nothing else changes in slice 1.

### Demo scripts

- `bin/demo-ready.sh` sets readable usernames for everyone, not just the first nine: the original ones are unchanged
  (`maria1`, `alex01`, ...), new people get the first four letters of the first name plus `01` (`hann01`, `dieg01`), with a
  number bump on a clash. Passwords stay `Demo1234!` locally. The summary table prints the new managers.
- `bin/demo-local.sh` (branch demo) inherits the change through the same seed call.

### What does not change

The 8 original accounts and 4 projects (names, managers, dates, health) and the usernames used by the e2e scripts. No schema
change, no migration. Nothing is written to AWS by this slice.

## Tests (written first)

Backend (integration, real database):
1. A fresh seed returns 30 accounts (4 managers, 26 employees), 12 projects, at least 100 tasks.
2. Each project has the health in the table above, checked through `/reports/overview`.
3. No person has two live assignments that overlap; at least five employees are free today.
4. Top-up: with only the core layer present, the endpoint creates exactly the 22 missing accounts and the original eight are untouched;
   a third call creates nothing.
5. The seed completes inside 20 s.
6. Existing seed tests are updated from 8 accounts / 4 projects to the new numbers; the original four projects keep their health,
   dependencies and names.

Frontend (Vitest): CSV helper (quotes, commas, newlines, formula neutralising, empty list); credentials dialog download;
More > Sample data (confirm, created, already-loaded); dashboard ordering by urgency.

Browser: the e2e script loads sample data, sees 12 projects and the Download CSV button, and passes axe on the dialog and the new
menu item. Postman: seed checks updated (accounts 30), whole collection rerun. Pictures: dashboard, projects, people, availability
and timeline retaken; `docs/DEMO.md` and the READMEs updated with the new counts.

## Risks

- **Tuning "at risk" and "overdue"** needs numbers that really trip the existing risk rules; the health tests catch a wrong guess.
- **A longer demo dashboard** is slower to scan; the urgency ordering is the answer, and slice 2's filters add the rest.
- **Public AWS site**: more fake people with `@demo.acme.example` emails on a public site. They are clearly fictional and the
  accounts need a password change at first sign-in.
