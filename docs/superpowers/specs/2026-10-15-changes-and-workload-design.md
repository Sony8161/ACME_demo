# Slice 6: "Since you last visited" and the workload heatmap

Branch `feature/export-and-scale`. Slice 6 of 7.

## What the user asked for

Two of the extra UI/UX features they picked: **"Since you last visited"** (a dashboard card built from the history) and a **workload heatmap**
(people by week, coloured by hours booked).

## A. Since you last visited

**API** `GET /reports/changes?since=<ISO UTC datetime>&limit=<1-50, default 20>` (admin and manager; an employee gets 403).
- Returns `{ since, total, projects, items: [AuditEntry...] }`: the newest `limit` history entries recorded **after** `since`,
  made by **other people** (your own changes are not news to you), plus how many entries and how many different projects there were in all.
- Admin sees every entry (including people-and-account changes). A manager sees entries of their own projects only.
- `since` is clamped to between 30 days ago and now, so the query is always bounded and a future time gives an empty answer.
- Items use the same shape as `/audit` entries (who, what in one sentence, the project, when), so the History screens and this card agree.

**Screen**: a card at the top of the dashboard, for admins and managers, only when there is something new:
"**14 changes in 5 projects** since Oct 12" + the newest 5 as one-line rows ("Maria Lopez · Moved task 'Login page' to Done · Website Redesign · 2 days ago", each a
link to the project) + **See everything** (admin: History page; manager: nothing extra, the rows link to the projects) + **Got it** (hides the card and
remembers "now"). The time of the last "Got it" is kept **in this browser** (per person, in local storage); the first time ever the card looks back 7 days.
It does not disappear on a refresh, only when you press Got it. If the browser has no storage it shows the last 7 days each time.

## B. Workload heatmap

**API** `GET /reports/workload?weeks=<1-12, default 8>` (admin and manager). Starting from this week's Monday, for each employee the person may see
(the same people as the availability view), the hours booked each week (Monday to Friday of an assignment is 8 hours a day) and which work it was:
`{ capacity_per_week: 40, weeks: ["2026-10-12", ...], people: [{ user_id, name, job_title, manager_name, hours: [..], work: [[{project_name, milestone_name}], ...] }] }`.
By the server's rule one person works one milestone a day, so a cell is 0 to 40 hours; the map shows **how busy and how free** people are, week by week.

**Screen**: **People > Workload** (third toggle next to People and Availability): a table, one row per person, one column per week (week
starting date), each cell showing its hours ("32 h"; 0 shown as a dash) on a colour scale (none, light, medium, full), with a legend. The first column
stays in view when scrolling sideways. A summary line above says "7 people have a free week in the next 4 weeks". Hover or focus on a cell shows what
the work is. The colour is never the only signal: the hours are written in the cell. Sorted by name; a filter field narrows by name.

## Out of scope

Notifications, unread counts per project, per-device "last visit" kept on the server, hours of work actually done, leave and holidays, editing
assignments from the heatmap, an employee's own view.

## Tests

Backend (real DB): changes are after `since`, exclude my own, scoped (a manager never sees another manager's project or an account change),
clamped, limited with the right totals, 403 for employees; workload hours are right for partial weeks, across two milestones, none for future
or past work, weeks and limits validated, scoped people, no money. Postman. Frontend: card appears only with news, text and links, Got it hides and stores,
refresh keeps it, first visit looks back 7 days, errors stay quiet; heatmap cells, colours by level, legend, summary line, filter, keyboard focus, and the
toggle in the People page. Browser: both on the real data, axe on both.
