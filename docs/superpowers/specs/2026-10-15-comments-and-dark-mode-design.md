# Slice 7: task comments and dark mode

Branch `feature/export-and-scale`. Slice 7 of 7 (the last).

## A. Task comments

**Why**: a task today is a title, an owner, a date and a status. People need a place to say "waiting on the bank" or "needs the new logo" next to the task itself.

**Data**: migration `007_task_comments.sql`: table `task_comments(id, deliverable_id → deliverables, author_id → users, body text 1-2000 characters,
created_at, archived_at)` and an index on `deliverable_id`. A comment is archived, never deleted (the repo's rule). Comments are **not** written to the
history log (its record kinds are fixed); the thread is its own record, newest comments last.

**API** (nested under the task, like deliverables):
- `GET /projects/{pid}/milestones/{mid}/deliverables/{did}/comments`: the live comments, oldest first, each `{ id, author_id, author_name, body, created_at, can_remove }`.
- `POST …/comments` with `{ body }` (1 to 2000 characters after trimming, else 400): add a comment; 201 with the same shape.
- `POST …/comments/{cid}/archive`: remove a comment from view. Allowed for its author, the project's manager and admins; anyone else 403.
- Who may read and write: **everyone who may see the project** (admin, the project's manager, an employee currently working on it); a person who cannot see the project gets
  404 (as for every project route). The task must be live (not archived, milestone not archived), else 404.
- The task list answers (`/projects/{id}/tasks`, `/tasks/mine`, search) gain `comment_count` (live comments).

**Screen**: clicking a task's name (board card, list row, My tasks row) opens a **task dialog** for everyone: name, status, priority, owner, due date, description, and below
them the **comment thread** with a box to write ("Add a comment", up to 2000 characters, a counter near the limit) and **Post**. Your own comments, and any when you manage the
project, have a **Remove** button (asks nothing: a removed comment is hidden, not erased: the row stays in the database (`archived_at`) but there is no screen to bring it back, so the label says "Remove"). Cards and rows show a small "3 comments" count when there are
some. The manager's **Edit** (details dialog) stays in the task's ⋯ menu and still works as before.

## B. Dark mode

**What**: a theme switch in the account menu: **Appearance: System, Light or Dark**. System (the default) follows the computer. The choice is kept in this browser (local storage; if storage
is unavailable, System). Nothing is sent to the server.

**How**: the MUI theme is built for the chosen mode from the same teal brand colours; the few hard-coded colours (app bar white, heatmap greens, the selection bar, chips) move
to theme tokens so they follow the mode. Every colour pair must still pass the axe contrast rule in **both** modes: the browser test scans the main screens in dark mode as well.

## Out of scope

Comments with mentions, edits, reactions, attachments or notifications; comments in the history log or search; per-user theme on the server; high-contrast mode.

## Tests

Backend: add, read in order, the 2000-character limit and blank body, scoping (outside employee/other manager get 404; employee on the project may comment; only the author, the manager
or an admin may remove), archived and finished tasks, `comment_count` on the task lists, no DELETE verb. Postman folder. Frontend: dialog contents and permissions, posting and
removing, counts on cards and rows, character counter; theme: mode switch and persistence, system default, storage failure, tokens used. Browser: comment as employee and manager,
axe on the dialog; dark mode scans of the dashboard, projects table, People, workload heatmap, project page and the dialogs; pictures in dark.
