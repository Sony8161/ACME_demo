# Demo pictures, by MVP item

Taken from the running demo by `cd frontend && npm run screenshots` (see [`docs/MVP.md`](../MVP.md) for what each item proves, the
endpoints behind it and the tests that cover it). Use them as the backup walkthrough if the live demo fails.

| MVP item | Pictures |
|---|---|
| **1. Sign in with 3 roles** | `1a` the sign-in page. `1b` a wrong password is refused. `1c` admin home. `1d` manager home: only their own projects. `1e` employee home: only their work, no money. `1f` an employee who opens an admin page is sent back to their own |
| **2. Admin creates users and projects** | `2a` people list. `2b` new person form. `2c` generated username and one-time password. `2d` new project form with exactly one manager. `2e` the project created |
| **3. Milestones with dates and deliverables** | `3a` add a milestone with dates, hours and budget. `3b` a milestone with its task checklist. `3c` completing is switched off, with the reason, while a task is open |
| **4. Assign people, no double booking** | `4a` assign a person. `4b` double booking refused, naming the clash. `4c` several people on one milestone |
| **5. Hours and cost from the calendar** | `5a` planned against expected hours and cost on a milestone. `5b` the team table: hours so far, expected hours, cost so far, expected cost and the rate it was planned at. `5c` budget: labor plus other costs |
| **6. Risk status with reasons** | `6a` projects ranked by urgency. `6b` an overdue project. `6c` an at-risk project. `6d` why it is at risk. `6e` why it is overdue |
| **7. Archive instead of delete** | `7a` a completed milestone moves to the archive, with its review note. `7b` archive asks first and says nothing is deleted. `7c` the archive page, visible to admins only. `7d` restored: nothing was lost |
| **8. A basic screen for each role** | `8a` admin, `8b` manager and `8c` employee, each on a phone (the desktop views are `1c`, `1d`, `1e`) |
| **Extra: history (audit)** | `h1` who did what and when. `h2` an entry opened to show exactly which fields changed. `h3` filtered to one person. `h4` a project's own History tab (folder `extra-history-and-audit`) |
| **Extra: tables** | `p1` People: sorted by name, three people ticked, role and reports-to filters, 25 a page. `p2` Projects as a table: two ticked, sorted by end date. `p3` one project's tasks as a list sorted by priority (folder `extra-tables`) |
| **Extra: export and bulk actions** | `q1` the export dialog: choose the columns, see the file name. `q2` two tasks ticked, with Move to and Set owner (folder `extra-export`) |
| **Extra: PDF** | `r1` the project report: tick the sections that go in the PDF (folder `extra-pdf`). The export dialog's CSV or PDF choice is in `extra-export` |
| **Extra: search** | `s1` the search box in the top bar, open: results in groups (Projects, People, Tasks) (folder `extra-search`) |
| **Extra: workload** | `t1` People > Workload: every person by week, shaded by hours booked, with a free-week summary and a legend (folder `extra-workload`). The manager's dashboard (`1d`) shows the "Since you last visited" card when others changed something |
| **Extra: comments and dark mode** | `u1` a task opened, with its comment thread and the box to write. `u2` the dashboard in dark mode. `u3` the workload heatmap in dark mode (folder `extra-comments-and-dark-mode`) |

Deployment (item 9) is not pictured: the same app runs in AWS (see `docs/DEPLOYMENT.md`).
