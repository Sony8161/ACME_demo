# Slice 2: smart tables (tick, sort, filter, page)

Branch `feature/export-and-scale`. Part of the roadmap in `2026-10-14-sample-company-design.md` (slice 2 of 7). Approved by the
user ("yes lets do all of these"; the sort/filter/page and bulk-selection choices were made in the feature list).

## Why

With 12 projects, 30 people and 100+ tasks the lists are long and unordered: People shows one unsorted table, Projects only cards,
the task list cannot be sorted. Slice 3 (export, bulk actions) needs rows that can be ticked. This slice makes the three lists
usable at that size and adds the selection model slice 3 builds on. It changes no API.

## What changes

A small shared kit in `frontend/src/table/` and three screens that use it:

| Screen | Change |
|---|---|
| **People** (`/people`) | Tick box on every row; sortable columns (Name, Role, Username, Reports to, Hourly cost for admins); a **Role** filter and a **Reports to** filter next to the search box; 25 rows per page. |
| **Projects** (`/projects`) | New **Table** view next to Cards and Timeline (`?view=table`): Project, Manager, Health, Milestones (x of y), Budget used (only where the person may see money), Ends. Sortable, tick boxes, 25 per page. It uses the same search, Status and Health filters as the cards. Cards stay the default. |
| **Tasks** (project Tasks tab, List view) | Tick boxes, sortable columns (Task, Status, Priority, Owner, Due), 25 per page. The existing owner and milestone filters stay. |

Kit:
- `sortRows(rows, getValue, direction)`: stable; text compared case-insensitively with numbers inside text in natural order
  ("Task 2" before "Task 10"); numbers numerically; empty values (null, undefined, empty text) always last, whatever the direction.
- `useSort(initialKey, initialDirection)`: the active key and direction; clicking a header sorts ascending, then descending, then
  ascending again on another key.
- `usePaged(rows, pageSize, resetKey)`: current page and its rows; back to page 1 when `resetKey` (the filters) changes.
- `useSelection(rows)`: ticked ids; **drops ids that are no longer in `rows`**, so a filter never leaves hidden rows ticked (nothing
  hidden is ever exported or changed); `toggle(id)`, `toggleMany(ids, on)`, `clear()`, `selectAll()`.
- `SortHead`: a header cell with a sort button and `aria-sort`.
- `SelectCell` / `SelectAllCell`: 44 px tick boxes; labels `Select <row name>` and `Select all <n> on this page`; the header box is
  half-ticked when some rows are.
- `SelectionBar`: "3 selected" with **Clear**, and **Select all 31** when more rows match than are ticked (across pages). Slice 3
  puts its Export and bulk actions in it.

## Out of scope

Server-side sorting and paging (the lists are fetched whole: `/users` has no paging, `/projects` is asked for 100); saved views;
column choice (slice 3 chooses columns for the export); sorting the employee's own "My tasks" list.

## Tests

Pure and hook tests for the kit (ordering, empties last, natural numbers, stable ties, selection dropped on filter, page reset).
Component tests for each screen: sort by clicking, tick one and all, the bar and Clear, filters narrow and keep selection honest,
paging, role differences (no money column for employees). Browser: axe on the three tables, keyboard (Space ticks, Enter sorts).
