# MVP checklist: what is built, and where to see it

Each row is one minimum viable product item: why it matters, its status, and the evidence for it. The pictures are in
[`demo-screenshots/`](./demo-screenshots) (taken by `cd frontend && npm run screenshots` on the running demo). The API results
are in [`postman/results/`](./postman/results) (203 requests, 839 assertions, 55 of 55 API operations, all passing on LocalStack).

| # | MVP item | Why it matters | Status | Pictures | API (see `/docs`) | Proven by |
|---|---|---|---|---|---|---|
| 1 | Sign in with 3 roles (admin, manager, employee) | Without it there is no access control | Done | `mvp1-...` (6) | `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/change-password` | `test_auth.py`, `test_security.py`, `test_ratelimit.py` (account lock); Postman folders 01 and 11; `LoginPage`, guard tests; end-to-end test |
| 2 | Admin creates users and projects | Gets data into the system | Done | `mvp2-...` (5) | `POST /users`, `POST /projects`, `PATCH /users/{id}`, `POST /users/{id}/reset-password` | `test_users.py`, `test_projects.py`; Postman folders 02, 03; `PeoplePage`, `ProjectsPage` tests |
| 3 | Milestones with dates and deliverables | The building blocks of every project | Done | `mvp3-...` (3) | `POST /projects/{id}/milestones`, `.../deliverables`, `.../complete` | `test_milestones.py`, `test_deliverables.py`; Postman folders 04, 05, 09; `MilestoneCard` tests |
| 4 | Assign people to milestones (no double booking) | Answers "who is working on what" | Done | `mvp4-...` (3) | `POST .../milestones/{id}/team`, `GET /projects/{id}/team` | `test_team.py` (overlap across projects), `test_precalculated.py`; Postman folder 06; end-to-end test |
| 5 | Hours and cost calculated from the calendar | Answers "how much budget is used" | Done | `mvp5-...` (3) | `GET .../team` (expected and so-far hours and cost), `GET /projects/{id}` (`summary`), `GET /projects/{id}/costs` | `test_workdays.py`, `test_precalculated.py` (stored fields, migration on old data), `test_reports.py`; Postman folders 06, 07, 08 |
| 6 | Risk status with reasons | Answers "which projects are in trouble" | Done | `mvp6-...` (5) | `GET /projects`, `GET /projects/{id}` (`risk_level`, `risk_reasons`), `GET /reports/overview` | `test_metrics.py` (every rule), `test_reports.py`; Postman folders 03, 08, 10 |
| 7 | Archive instead of delete | A hard requirement in the brief | Done | `mvp7-...` (4) | `POST .../archive`, `POST .../unarchive` on projects, people, milestones, deliverables, costs, assignments | `test_no_deletes.py` (no DELETE operation exists; archived records are admin-only); Postman folder 09 |
| 8 | A basic screen for each role | People can use it without Postman | Done (demo scale) | `mvp8-...` (3, on a phone) and `mvp1-...` | `GET /reports/overview`, `GET /reports/my-dashboard` | 351 frontend tests (98.7% coverage), end-to-end test with accessibility scans |
| 9 | Deployed where users can reach it | Not viable until someone can use it | **LocalStack only, not AWS yet** | n/a | n/a | The same Postman collection passes on LocalStack; the AWS Terraform validates but has not been applied. Left for later |
| + | Tasks: a deliverable with an owner, priority, due date and status, on a board and in a list, plus "my tasks" (an extra, toward a Jira/Asana-style tool) | Answers "what is everyone working on, and what is late" | Done | `extra-tasks-board` (4) | `GET /projects/{id}/tasks`, `GET /tasks/mine`, `PATCH .../deliverables/{id}` (status, owner, due date, priority) | `test_tasks.py` (15 tests: owners must be on the milestone, an owner starts but a manager finishes, the status and the tick stay in step, no past access); Postman folder 06b; `TasksTab`, `TaskBoard`, `MyTasksPage` tests; end-to-end test |
| + | Assistant: a chat box on every screen that answers questions about the projects, milestones and tasks the person may see (an extra) | Answers questions in plain words without opening five screens | Done (built-in); AI mode untested against the real service | `extra-assistant` (2) | `GET /assistant/status`, `POST /assistant/chat` | `test_assistant.py` (22 tests: scoped to the caller, no money for employees, the model's tool loop, fallback, rate limit), `test_assistant_client.py`; `AssistantChat` tests; Postman folder 10b; end-to-end test |
| + | Dependencies: a milestone (in any project you manage) or a project can wait for another; the later one cannot be started or completed until the earlier is completed; loops are refused; links are archived, never deleted (an extra, toward a Jira/Asana-style tool) | Answers "what is waiting on what" | Done | `extra-dependencies` (2) | `GET/POST .../milestones/{id}/dependencies`, `GET/POST /projects/{id}/dependencies`, `POST .../{dep}/archive` | `test_dependencies.py` (16 tests: blocking, loops, who may link what, masked names, the timeline, audit); `DependencyPanel` tests; Postman folder 06c; end-to-end test |
| + | Timeline: every open project on one calendar, and one project with its milestones and each task as a diamond on its due date (an extra, toward a Jira/Asana-style tool) | Answers "what is when, and what is late" | Done | `extra-timeline` (2) | `GET /reports/timeline` | `test_timeline.py` (6 tests: scope by role, signed-off kept, cancelled left out, late); `timeline.ts`, `TimelineChart`, `TimelinePage`, `ProjectTimeline` tests; Postman folder 08; end-to-end test |
| + | History: who changed what, and when (an extra, beyond the nine) | Answers "what happened, and who did it" | Done | `extra-history-and-audit` (4) | `GET /audit`, `GET /projects/{id}/history` | `test_audit.py` (22 tests: triggers, secrets never copied, append-only, who may read); Postman folder 12; `HistoryPage` tests; end-to-end test |

## What "calculated from the calendar" means now

Every Monday to Friday of an assignment is an 8-hour shift. When a person is put on a milestone, the hours and cost of the whole range
are worked out once and stored on the assignment (`expected_hours`, `expected_cost`, at the `hourly_rate` of that day), by a database
trigger. Hours and cost so far depend on today's date, so they are calculated on request, at the stored rate. A raise applies to work
that has not started and never reprices the past. Project and milestone totals add up the stored fields.

## Re-taking the pictures and the results

```sh
./bin/demo-ready.sh && (cd frontend && npm run screenshots) && ./bin/demo-ready.sh   # the pictures
./bin/demo-reset.sh && npx newman run docs/postman/acme-pm-api.postman_collection.json -e docs/postman/localstack.postman_environment.json \
    --reporters cli,json --reporter-json-export /tmp/newman-localstack.json
(cd backend/pm-api && source .venv/bin/activate && python ../../docs/postman/report.py /tmp/newman-localstack.json localstack http://localhost:3001/api/pm-api)
./bin/demo-ready.sh
```
