# Slice 3: export ticked rows to CSV, and act on them

Branch `feature/export-and-scale`. Slice 3 of 7 (roadmap in `2026-10-14-sample-company-design.md`). Builds on the ticked rows of slice 2.

## What the user asked for

> "export pdf/csv file option and the option to pick certain ones to do"

This slice does the **CSV** half and the picking; slice 4 adds PDF (the same dialog gets a format choice, plus the project report).

## Design

### Export (CSV)

- A button above each of the three tables: **Export all 32** when nothing is ticked, **Export 3 selected** when something is. "All" means
  everything that matches the current search and filters (never rows the person cannot see).
- It opens an **Export dialog**: what is being exported ("3 people"), a tick list of **columns** (all ticked to start; at least one
  must stay ticked), and a **Download CSV** button. The file name is `acme-<people|projects|tasks>-<YYYY-MM-DD>.csv` (UTC date).
- Built in the browser from rows the API already sent to this person. Nothing new is requested, so nothing the person may not see
  can reach the file: hourly cost is a column only for admins, money columns only when the server sent money.
- Spreadsheet-safe (slice 1 helper): quoted, formula-neutralised, UTF-8 with byte-order mark. Dates are ISO `YYYY-MM-DD`; yes/no as
  `Yes`/`No`; money as plain numbers.
- Columns: **People** Name, Email, Job title, Role, Username, Reports to, Hourly cost (admin). **Projects** Project, Manager, Status,
  Health, Start, End, Milestones done, Milestones total, Budget, Spent, Budget used %, Hours allocated, Hours worked, Why (first
  risk reason). **Tasks** Task, Project, Milestone, Status, Priority, Owner, Due, Late, Done on.
- After the download a toast says "Exported 3 people".

### Bulk actions (on ticked rows)

- Done in the browser by calling the **existing** endpoints one row at a time and reporting per row. No new API: every permission,
  rule and history entry is the one a single click would have produced. (A bulk endpoint was in the roadmap; this is simpler and
  safer, at the cost of one request per row, fine up to the lists' size.)
- **People (admin): Archive.** Asks first ("Archive 3 people? They can no longer sign in. You can restore them from the Archive page."),
  then reports "Archived 2. 1 could not be archived: Ada Admin, <the server's reason>."
- **Tasks (admin and the project's manager): Move to** To do / In progress / Done, and **Set owner** (from the project's team or
  Unassigned). Same report.
- Projects: export only (no bulk change).
- The result dialog lists failures with the server's own sentence; the table reloads either way and ticks stay on the rows that failed.

## Out of scope

PDF (slice 4); a bulk undo; bulk actions for employees; server-side export of more rows than the screen holds.

## Tests

Pure column tests (what each column returns, money and cost omitted when null/non-admin); dialog tests (columns, at least one,
file name, download called with the right rows, nothing ticked means all, ticked means only those); bulk runner (all succeed, some
fail with the server sentence, order kept, stops nothing); each table's export and bulk wiring; role differences; browser e2e
(download a People CSV with 3 picked rows and read it, archive-bulk refused for a manager) plus axe on both dialogs.
