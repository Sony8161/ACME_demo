# Slice 5: a search box in the top bar

Branch `feature/export-and-scale`. Slice 5 of 7.

## What the user asked for

> "instead of control k search lets just add a search feature on top for everything"

A **search box that is always visible in the top bar** and finds projects, people and tasks in one go. No keyboard shortcut needed.

## Design

### API: `GET /search?q=<text>&limit=<n>`

- `q` 2 to 100 characters (shorter, or a limit outside 1-10, is a 400 with the usual error shape); `limit` 1 to 10 per group, default 5.
- Returns `{ query, projects: [...], people: [...], tasks: [...] }`, each list at most `limit` long, each item the few fields a result row needs:
  project `{ id, name, manager_name, status, risk_level }`; person `{ id, name, job_title, role }`; task `{ id, name, project_id, project_name, milestone_name, status, assignee_name }`.
- **What each role may find** (the same rules the screens already apply, reusing their queries):
  - admin: every project, every active person, every live task;
  - manager: their own projects; every active non-admin person; tasks of their projects;
  - employee: projects they work on; **no people** (they cannot list people today); only their own tasks.
- Archived people, archived projects and cancelled or completed milestones' tasks are not found. Text is matched case-insensitively anywhere in
  the name (people: also email, username, job title; projects: also description and manager name). `%` and `_` typed by the person are
  matched literally for tasks.
- Salary and money are never in a search result.

### Screen

- A text box with a search icon in the top bar (desktop: between the menu and the account button; phone: an icon that opens a full-width box
  under the bar). Placeholder "Search projects, people, tasks".
- After 250 ms of typing (at least 2 characters) it asks the server and opens a results list under the box, in three groups
  (**Projects**, **People**, **Tasks**; a group with no hits is left out). "No results for 'xyz'." when all are empty.
- It is an accessible **combobox**: the arrow keys move through the results, Enter opens one, Esc closes the list (and a second Esc clears the box), the
  active result is announced; each result is a link, so middle-click and "open in new tab" work.
- Opening a result: a project goes to `/projects/<id>`; a person to `/people?q=<their name>` (the People page reads `?q=`); a task to
  `/projects/<project id>?tab=tasks`. The list closes and the box clears.
- Stale answers are dropped: only the latest request may fill the list. Errors show "Search is not available right now." in the list.

## Out of scope

Searching milestones, comments, history or costs; fuzzy matching or typo tolerance; recent searches; a keyboard shortcut to focus the box.

## Tests

Backend (real DB): each role finds exactly what it may and nothing else (employee: no people, only own tasks; manager: not another
manager's project or admins; admin: all); matching in names and the extra fields; `%` literal in tasks; limit and group caps; 400 for a
one-letter query (400); archived things hidden; no salary field; unauthenticated 401. Postman: a "13 Search" folder. Frontend: debounce, minimum
length, grouping, the combobox keyboard model, navigation targets, stale responses ignored, error and empty states, phone overlay;
browser: type, arrow, Enter on a project, a person and a task; axe on the open list.
