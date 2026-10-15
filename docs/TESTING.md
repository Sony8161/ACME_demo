# Testing: commands, results and known gaps

Everything below was run on 2026-10-14 against the code in this repository. "Where" says what each test needs.
The structure follows the Testing Expectations in [full-stack.md](./full-stack.md).

## Summary

| Layer | What | Command | Result |
|---|---|---|---|
| Backend unit + integration + error tests | Business rules against a **real PostgreSQL** | `./bin/test-backend.sh` | **278 tests pass**, 97.5% coverage (gate 80%) |
| Backend lint and security | `ruff` and `bandit` (same scan as CI) | `./bin/test-backend.sh` | clean |
| Frontend component + API integration tests | React Testing Library with the API mocked | `cd frontend && npm run test:coverage` | **520 tests pass**, 98.4% statements, 97.2% branches (gate 80%) |
| Frontend static checks | ESLint, TypeScript, production build, `npm audit` | `npm run lint && npm run typecheck && npm run build && npm audit` | clean, 0 vulnerabilities |
| End-to-end | The demo journey through browser, proxy, Lambda and PostgreSQL, plus accessibility scans | `cd frontend && npm run e2e` | **62 of 62 checks pass** (50 in the demo journey incl. 15 axe scans; 12 in `e2e/sample-data.mjs`, incl. 3 axe scans) |
| API contract, every endpoint | 203 requests with 839 assertions (Postman/Newman); all 55 operations of the API | `npx newman run docs/postman/acme-pm-api.postman_collection.json -e docs/postman/localstack.postman_environment.json` | **0 failures** locally and on LocalStack; saved as `docs/postman/results/postman-results-localstack.json` |
| Demo pictures | 46 pictures, one folder per MVP item (and the history, tasks, timeline and dependencies and assistant extras) | `cd frontend && npm run screenshots` | Retaken from the running demo; indexed in `docs/demo-screenshots/README.md` and `docs/MVP.md` |
| Performance | Artillery load test | `npx artillery run docs/load/artillery.yml` | see Load test below |

## Backend

```sh
./bin/test-backend.sh                  # ruff, bandit (tracked files, like CI), pytest with a coverage gate
./bin/test-backend.sh -k reports       # any pytest arguments are passed on
```

Needs a local PostgreSQL (`postgres` / `postgres123` on `localhost:5432`); tests create and use a throwaway `pm_test` database
and skip themselves if PostgreSQL is not reachable. "Today" is frozen to Wednesday 2026-03-11 so date maths is repeatable.

| The guide asks for | What covers it |
|---|---|
| Unit tests of functions in isolation | `test_metrics.py` (risk rules), `test_security.py` (passwords, tokens), `test_workdays.py` (Monday-Friday maths), `test_db_transactions.py` (commit and rollback) |
| Integration tests with a real database | one file per domain: auth, users, projects, milestones, deliverables, team, costs, reports, admin seed |
| Error handling and validation tests | every domain has refusal cases (400, 401, 403, 404, 409); `test_error_handling.py` covers the 409, 503 and 500 safety nets and the single error shape |
| Role rules and privilege escalation | role matrix in each domain's tests: a manager cannot change role or salary, an admin cannot change their own role, hidden things are 404, an employee never receives money |
| "Archive, never delete" | `test_no_deletes.py` asserts the API has no DELETE operation and that archived records are admin-only |
| Observability | `test_observability.py`: one access-log line per request, request id returned, tokens and search text never logged |
| Rate limiting and the account lock | `test_ratelimit.py`: the limiter (window, per person, per address, forged forwarding header, health check exempt), the real app refusing a flood with 429 and `Retry-After`, five wrong passwords locking an account even for the right one, the count surviving the request's rollback, unlock after 15 minutes or by an admin reset |
| Precalculated hours and cost | `test_precalculated.py`: the stored expected hours, cost and rate; recomputed when dates change; project and milestone totals add up the stored fields; a raise changes future work and never the past; and migration 003 run on data written by the old version |

Coverage: 97.5% overall (the audit history is covered by `test_audit.py`: 22 tests). All nine router files and `app/core/errors.py` (the error handlers) are at 100%. The lowest files are
`app/main.py` (94%, the health check's database-down branch) and `app/domains/users/service.py` (95%).

## API contract: every endpoint (Postman)

```sh
./bin/demo-reset.sh        # the collection needs an empty database: it signs in with the first-run password
npx newman run docs/postman/acme-pm-api.postman_collection.json -e docs/postman/localstack.postman_environment.json \
    --reporters cli,json --reporter-json-export /tmp/newman-localstack.json
(cd backend/pm-api && source .venv/bin/activate && python ../../docs/postman/report.py /tmp/newman-localstack.json localstack http://localhost:3001/api/pm-api)
./bin/demo-ready.sh        # put the demo back
```

11 folders walk the whole API in order. `report.py` compares the run with the API's own list of operations and writes
`docs/postman/results/postman-results-localstack.json`: for each request its expected and actual status, every assertion and its result, and
the time it took; and for each operation which requests exercised it. The raw Newman export is never committed because it holds tokens and
one-time passwords; the saved file holds none.

Result on 2026-10-14, LocalStack: **203 requests, 839 assertions, 0 failed, 55 of 55 operations exercised** (this run was against the API under uvicorn, saved as `postman-results-local.json`; the LocalStack run was not repeated for this branch). The one thing the collection does
not do is exceed the 600-requests-a-minute limit (that needs hundreds of requests); `test_ratelimit.py` covers it.

## Frontend

```sh
cd frontend
npm test                    # run once
npm run test:coverage       # with the 80% gate (statements, branches, functions, lines)
npm run lint && npm run typecheck && npm run build
```

520 tests in 48 files, using Vitest and React Testing Library (the guide names Jest; Vitest is the same API on Vite). The API is
mocked at the axios adapter (`src/test/mockApi.ts`), so tests exercise the real client code: key conversion, error mapping, the
401 handler. Covered: every page, the dialogs (busy, error and success states), role differences (employees see no money, no manager
buttons), route guards and redirects, the sliding session refresh, and the forced password change.
Excluded from the coverage figure: `main.tsx` (wiring) and `theme.ts` (colours).

## End-to-end and accessibility

```sh
./bin/demo-postgres.sh && ./bin/start-dev.sh     # the stack, in its own terminal
./bin/demo-ready.sh                              # sample company and logins
cd frontend && npm run e2e                       # SHOTS=/some/dir saves a screenshot per step
./bin/demo-ready.sh                              # the test completes a milestone and archives a project, so reset
```

The sample-data run starts from an empty database (it loads the sample company itself, saves the logins as a CSV and reads it):

```sh
./bin/demo-local.sh reset                        # first admin only
cd frontend && BASE_URL=http://localhost:3000 npm run e2e:sample
./bin/demo-local.sh ready                        # put the sample company back
```

50 checks drive a real browser through: sign-in (with the show-password button), the dashboard ranking, an employee with no money visible, a manager seeing only
their own projects, a refused double booking, a refused then accepted milestone sign-off, the forced first-login password change,
an admin seeing the archived milestone, archive then restore, and the history page crediting each of those to the right person
(with its filter and the project's own History tab), and the task board: a real drag of a card to In progress, the list view, an employee pausing and starting their own task, the timeline (every project on one calendar, then one project with its tasks as diamonds), and dependencies (a milestone that waits for another cannot be started and the refusal names it; finishing the first frees the second; a project that waits for another says so), and the assistant (a suggested question and a typed follow-up are answered from the real projects, and Escape closes it). The AI path is tested with a scripted stand-in for the model (the tool loop, the limits, the fallback) and the HTTP client with a patched network call; **no real AI request has been made**, so run it once with a key before relying on it. Fourteen screens are scanned with axe-core (sign-in, dashboard,
project detail, my work, a manager's project page, people, the archive, history, the task board, my tasks, the timeline, a project's timeline view, a project's dependencies dialog and the open assistant chat box); the test fails on any serious or critical issue. The first run found
one (a tooltip put an `aria-label` on a plain element); it is fixed and now guarded.

## Load test

```sh
./bin/demo-ready.sh
npx artillery run docs/load/artillery.yml                 # realistic: 5 new users a second, about 30 requests a second
npx artillery run docs/load/artillery.yml -e stress       # finds the limit; see the warning below
```

Read-only traffic as managers and an admin: overview, project list, one project, its milestones or team, people, health. Run on LocalStack on a
2-CPU, 8 GB cloud desktop with the API warm.

| Profile | Requests | Failed | Median | p95 | p99 | Max |
|---|---|---|---|---|---|---|
| Realistic, on the final code with rate limiting (5 new users/s across three people, about 19 requests/s observed) | 1,197 | **0** (all 200, no 429) | 20 ms | 35 ms | 49 ms | 62 ms |
| Stress, measured before the limiter was added (ramp to 15 users/s, about 90 requests/s offered) | 2,554 | 1,769 (HTTP 500 x1,228, 502 x96, timeouts x445) | 1.7 s | 5.1 s | 6.7 s | 7.9 s |

The scenario spreads the traffic over three people (maria1, james1, admin1) because the API now limits each person to 600 requests a minute;
a single login hammered at over 20 requests a second would, correctly, receive 429.

What the stress run means:
- The 500s are **not application errors**. LocalStack's own log says `Could not start new environment ... OSError(24, 'Too many open files')`:
  the emulator ran out of file handles while starting about 40 Lambda containers on a 2-CPU machine.
- It does show the design's scaling rule: every concurrent request gets its own Lambda container, and each container holds one
  database connection. 41 containers meant 39 open connections. On AWS the same rule applies (see the scalability plan in the
  presentation document: RDS Proxy and reserved concurrency).
- After a stress run LocalStack keeps replaying queued requests and recreating containers for several minutes. Wait for the container count
  (`docker ps | grep -c lambda`) to settle, remove them, and run `./bin/demo-ready.sh` before presenting.
- These figures say how the emulator copes on this machine, not how AWS behaves. Run the same file against a test stack on AWS
  (`-e` and `--target`) before quoting capacity.

## Manual validation

Walked through by hand and by the end-to-end script: UI to API to PostgreSQL for each role, on a laptop-width and a phone-width window.
The backup screenshots are in `docs/demo-screenshots/`.

## Logs and monitoring

Each request writes one JSON line (`method`, `path`, `status`, `ms`, `request_id`) and returns an `X-Request-Id` header.

```sh
# LocalStack
AWS_ENDPOINT_URL="http://localhost.localstack.cloud:4566" aws logs tail /aws/lambda/coding-workshop-pm-api-<app code> --follow --format short
# AWS
aws logs tail /aws/lambda/coding-workshop-pm-api-<app code> --follow --format short
curl http://localhost:3001/api/pm-api/health      # {"status":"ok","database":"ok",...}; 503 when the database is down
```

## Known gaps

- **Not run on AWS.** The Terraform validates but has not been applied, so the cloud path (CloudFront routing, Aurora over SSL, the
  generated secrets) is untested. The Postman collection and the load test are ready to run against a throwaway stack.
- **Load numbers are from an emulator** on a small machine, as explained above. No test measures database load or Aurora scaling.
- **The CI workflow has not run on GitHub yet** (`.github/workflows/ci.yml`); the same commands pass locally.
- **No automated test for concurrent assignment**: the row lock that stops two managers booking the same person at once has no test
  with two real connections, so deleting it would not fail a test. Listed in the review findings.
- **The history's triggers are tested through the API on a real PostgreSQL** (`test_audit.py`), not on data from a production-sized database; the table's growth over years is a plan (see `docs/OVERVIEW.md`), not a measurement.
- **Frontend tests mock the API**; only the end-to-end script runs the real stack, and it covers the demo journey, not every screen
  (editing a project, moving an employee between managers and costs are not driven end to end).
- **Open code-review findings** (about 20 lesser items, listed in `docs/OVERVIEW.md` section 6 and the presentation document, section 17). Login throttling and the account lock are done.
