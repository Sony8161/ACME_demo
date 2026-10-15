# Demo guide: ACME Project Tracker on LocalStack

A rehearsed, 10-minute demo (with a 5-minute cut) that runs on LocalStack, a local copy of AWS. Every step below was
run in a real browser and passes. The demo data is loaded by one command and dated relative to today, so the story
is the same on any day.

```
browser :3000 (React) --> proxy :3001 --> Lambda (FastAPI, in LocalStack/Docker) --> PostgreSQL (Docker, 172.17.0.1:5432)
```

## 1. Get ready (30 minutes before)

```sh
docker ps --format '{{.Names}}'     # expect: localstack-main, pm-demo-postgres, and a ...lambda-coding-workshop-pm-api... container
```

If any is missing (after a reboot, or LocalStack was restarted), start everything again (about 3 minutes):

```sh
./bin/demo-postgres.sh      # PostgreSQL 17 in Docker, reachable from the Lambda container; no sudo
./bin/start-dev.sh          # LocalStack, deploys the API with Terraform, proxy, then the website (leave it running)
```

Then, every time before you present or practise:

```sh
./bin/demo-ready.sh         # about 5 seconds: empties the database, loads the sample company, sets the logins below
```

Finally open http://localhost:3000, sign in as `admin1` once and sign out. That starts the API container, which
is slow on its first request (up to a minute), so it never happens in front of people.

Window at 1280 px wide and 100% zoom. Close chat and mail notifications. Have this page open on a second screen.

## 2. The accounts

| Username | Password | Who | Used for |
|---|---|---|---|
| `admin1` | `Demo1234!` | System Admin (admin) | Company view, archive and restore |
| `maria1` | `Demo1234!` | Maria Lopez (manager) | Website Redesign: assign, tick, complete |
| `james1` | `Demo1234!` | James Carter (manager) | The overdue and at-risk projects |
| `alex01` | `Demo1234!` | Alex Kim (employee) | "My work", no money shown |
| `nina01` | `Welcome123!` | Nina Park (new hire) | First sign-in forces a new password (works once) |
| `hann01` | `Demo1234!` | Hannah Weiss (manager) | Payments, the chatbot (at risk), the partner kit: a second manager's view |
| `dieg01` | `Demo1234!` | Diego Alvarez (manager) | Warehouse, the overdue security audit, analytics |
| `priya1` `sofia1` `tom001` `lena01` `omar01` | `Demo1234!` | More employees | Not needed in the script |
| `noor01` `kenj01` `mei01` ... | `Demo1234!` | The other 20 employees | Every new person is the first four letters of the first name + `01` (`02` on a clash) |

The company: four managers, 27 employees (26 plus Nina) and twelve projects, dated relative to today. The script below uses the
first four projects; the other eight make the lists, the timeline, availability and exports look like a real company.

| Project | Manager | State | Why |
|---|---|---|---|
| Mobile App Launch | James | **Overdue** | The end date has passed and both milestones are late |
| Data Platform Migration | James | **At risk** | Spending is far ahead of the calendar, and the planned staffing costs more than the budget |
| Website Redesign | Maria | On track | About two thirds of the time used, a bit over a third of the budget |
| Customer Portal | Maria | On track (planned) | Starts in two weeks |

The other eight, for the lists and the timeline:

| Project | Manager | State |
|---|---|---|
| Security Compliance Audit | Diego | **Overdue** (ended five days ago, remediation late) |
| Customer Support Chatbot | Hannah | **At risk** (staffing will cost more than the budget) |
| Payments Gateway Upgrade, Warehouse Automation, Analytics Dashboard | Hannah, Diego, Diego | On track |
| HR Self-Service Portal, Partner Onboarding Kit | James, Hannah | Planned |
| Brand Refresh | Maria | Completed |

## 3. The script

Say the one-line idea first: **"We replaced timesheets with a calendar, so the system always knows who is on what, what it
costs, and whether it is late."**

### Act 1. The company at a glance (admin, 2 min)

1. Sign in as `admin1` / `Demo1234!`. You land on the **Dashboard**.
2. Read the heading (*4 of 12 projects need attention*), then the project list. **Say:** "Ranked by urgency: overdue first, then at risk. Each project
   says why, in one line."
3. Point at one pulse bar. **Say:** "The fill is work done, the dark marker is today. Fill behind the marker means behind schedule."
4. Click **Data Platform Migration**, then **Why?** under the progress bar: spending is ahead of the calendar, and the planned
   staffing will cost more than the budget. **Say:** "Notice the work is actually ahead of the calendar here. The money is
   going faster, and the system caught it. Nobody set this status; it is calculated from dates and assignments."
5. Click the **Team & costs** tab. **Say:** "Nobody types hours. Every Monday to Friday on a milestone is an 8-hour shift, so hours and cost
   come from the calendar."
6. Sign out (the initials button, top right, then **Sign out**).

### Act 2. What an employee sees (1 min)

1. Sign in as `alex01` / `Demo1234!`. You land on **My work**.
2. **Say:** "Alex sees today's milestone, hours this week out of 40, and their own tasks. Alex never sees a dollar."
   Click the project: only Alex's project is visible, and no money appears.
3. Sign out.

### Act 3. A manager at work (maria1, 4 min)

1. Sign in as `maria1` / `Demo1234!`. **Say:** "Maria sees only her two projects, not James's."
2. Open **Website Redesign**. The **Launch** milestone (nobody is assigned) is already open, because it is waiting.
3. Open its **...** menu, click **Assign a person**, choose **Sofia Rossi**, leave the dates empty, click **Assign**.
   - **You see:** a red message: *Sofia Rossi is already on milestone 'Discovery' of 'Customer Portal' from ... to ...*
   - **Say:** "One person, one milestone per day, even across projects. The server refuses and names the clash. That makes
     over-allocation impossible, not just reported."
4. Cancel, open **Assign a person** again, choose **Priya Shah**, click **Assign**. Priya appears in the team.
5. In the **Build** milestone open the **...** menu.
   - **You see:** **Complete milestone** is greyed out: *Every task must be done first*
   - **Say:** "A milestone is signed off only after the manager has reviewed every task, so the button is off until they are all ticked."
6. Close the menu. Tick the **Dashboard** checkbox. A **Ready to sign off** button appears: click it, type a note such as
   *Reviewed with the client; both screens signed off*, click **Sign off and complete**.
   - **You see:** Build leaves the list, and the summary line reads **2 of 3 milestones**.
   - **Say:** "It moved to the archive but still counts toward progress, and Alex is free from tomorrow."
7. Sign out.

### Act 4. A new hire (1 min)

1. Sign in as `nina01` / `Welcome123!`. You are sent to **Choose a new password**.
2. **Say:** "Generated passwords work once. Nina must choose her own before she sees anything."
   Enter the current password, a new one such as `Welcome456!` twice, click **Save new password**. She lands on **My work**
   with no milestone yet.
3. Sign out.

### Act 5. Nothing is ever deleted (admin, 1.5 min)

1. Sign in as `admin1`. Open **Website Redesign**.
2. **Say:** "Admins still see the milestone Maria completed, marked *Completed, archived*, with her review note. Managers and
   employees no longer do."
3. Go to **Projects**, open **Customer Portal**, open the **...** menu next to the title, click **Archive project**, confirm. Open **More > Archive**: it is listed.
4. Click **Restore**. **Say:** "There is no delete anywhere in the API; a test proves it. Archive, then restore."

### Act 6. Who did what, and when (admin, 1.5 min)

1. Still as `admin1`, open **More > History**. **Say:** "Everything that changes is recorded by the database itself, in the same
   transaction as the change, so nothing can forget to log it and a refused request leaves no trace. It cannot be edited or deleted."
2. Open the entry **Signed off milestone Build**: **Status: In progress → Completed** and Maria's review note. The person shown is the
   one who did it (after the practice run you will see Maria Lopez; the sample company itself was loaded by the admin).
3. Filter **Person** to Maria Lopez, then **Clear filters**. Open **Website Redesign** and click its **History** tab: managers see this
   for their own projects only.
4. **Say:** "Passwords are never in it: a password change is recorded as the word 'changed'."

### Act 7. Tasks: a board for the work (maria1 then omar01, 2 min)

1. Sign in as `maria1`, open **Website Redesign**, click the **Tasks** tab. **Say:** "Every task has an owner, a priority,
   a due date and a status. Same data as the checklist, so the sign-off rule is unchanged."
2. Type a name in **Add a task** under To do and press Enter. Drag **Launch announcement** from To do to **In progress** (or use its **...** menu, the keyboard route),
   then click **Undo** in the message at the bottom. Switch to **List**.
3. Sign in as `omar01`; **My work** has a **My tasks** section. **Say:** "Employees see only their own tasks. Omar can start or pause his task, but only a manager can
   finish it, because a manager reviews the work." Click **Pause Data copied** then **Start Data copied**. Every move is in the **History**.

### Act 8. The timeline (admin1, 1 min)

1. Sign in as `admin1`, open **Projects** and switch to **Timeline**. **Say:** "Every open project on one calendar, coloured the same way as everywhere else:
   green on track, amber at risk, red overdue, grey signed off. The header names every month with its year and numbers each week by its Monday; the labelled line is today, and the filled part of a bar is the work done. A long range scrolls sideways, and the names column stays put."
2. Open **Data Platform Migration**; on the **Plan** tab switch **List** to **Timeline**: the milestones as bars, each task a diamond on its due date. Switch **Show tasks** off and on.

### Act 9. Dependencies (maria1, then admin1, 1.5 min)

1. As `maria1`, open **Website Redesign**. **Launch** carries a **Waiting for 1** tag, and its expanded card says it waits for **Build**.
   Open its **...** menu and click **Mark as started**. **Say:** "A milestone can wait for another, in this project or another one you manage. The server refuses and names what it is waiting for."
2. Complete **Build** (Act 3). **Say:** "The moment Build is signed off, Launch is free: the tag is gone."
3. As `admin1`, open **Customer Portal** and click its **Waiting for 1** tag: the project waits for **Website Redesign**, so it cannot be completed until then.
   Try **Add dependency** on a milestone's **...** menu: it lists only what makes sense, never the item itself and never what is already linked. Loops are refused, and every link is in the **History**.

### Act 10. The assistant (admin1, 1 min)

1. Click the round chat button at the bottom right. **Say:** "A chat box on every screen. It can only read, and it answers from the same lookups as the
   screens, run as the person asking, so a manager hears about their own projects and an employee never hears about money."
2. Click **What is late?**, then type **What is blocked?**. Note **Looked at: ...** under each answer. With an AI key set on the server a model chooses the lookups;
   without one the built-in engine answers and nothing leaves the machine.
3. Optional: sign in as `alex01` and ask the same question: only Alex's own work, no money.

### Close (30 seconds)

"The API behind this passes 198 tests and a 161-request Postman run with no failures, both locally and on LocalStack.
What is left: the AWS deployment, and growing this demo UI into the full app."

### 5-minute cut

Act 1 (steps 1 to 4), Act 3 steps 3, 5 and 6 only, then Act 5 steps 3 and 4 and Act 6 step 1 and 2.

## 4. After each run

```sh
./bin/demo-ready.sh         # puts everything back, including Maria's completed milestone and Nina's password
```

## 5. If something goes wrong

| What you see | What to do |
|---|---|
| First click after a pause is slow | The API container is waking up. Wait, then continue. Avoid it by signing in once beforehand |
| "Cannot reach the server" | `curl http://localhost:3001/api/pm-api/health`. If there is no answer, run `./bin/start-dev.sh` (3 minutes) |
| A login is refused, or the data looks wrong | `./bin/demo-ready.sh` (5 seconds) |
| The site does not load at all | `./bin/start-dev.sh` restarts the proxy and website |
| LocalStack was restarted or the machine rebooted | `./bin/demo-postgres.sh`, `./bin/start-dev.sh`, then `./bin/demo-ready.sh` |
| The browser offers to save a password | Dismiss it |
| Everything fails on stage | Walk through `docs/demo-screenshots/` (46 pictures, one folder per MVP item and one for the history; see `docs/MVP.md`), then show the saved responses in the Postman collection and `docs/postman/results/` |

## 6. Other commands

| Command | What it does |
|---|---|
| `./bin/demo-reset.sh` | Empties all data (first admin only, `admin1` / `ChangeMe123!`, forced password change) |
| `./bin/demo-postgres.sh --reset` | Throws away the whole database volume |
| `./bin/demo-postgres.sh --stop` | Stops the database container |
| `npx newman run docs/postman/acme-pm-api.postman_collection.json -e docs/postman/localstack.postman_environment.json` | Full API test (run `./bin/demo-reset.sh` first, and `./bin/demo-ready.sh` after). Expect 151 requests, 611 assertions, 0 failures |

### Without LocalStack (for example on a Mac)

```sh
./bin/demo-local.sh            # needs Python 3.11+ and Node 20+; uses Docker for PostgreSQL if it is running
./bin/demo-local.sh ready      # put the sample company back between runs
./bin/demo-local.sh stop
```

It serves http://localhost:3000 with the same accounts as above. Without Docker, start a local PostgreSQL and set
`DEMO_USE_DOCKER=0` (it then uses `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASS`). On a Mac:
`brew install python@3.13 node`. It was tested on Linux, with both database options and the end-to-end browser test;
it has not been run on a Mac, so try it once before relying on it there.

## 7. Why it is set up this way

The Lambda container reaches the host at `172.17.0.1`, but the system PostgreSQL listens on `127.0.0.1` only, and changing
that needs `sudo`. The Docker database sits on the Docker bridge instead and leaves the system database untouched.
`start-dev.sh` accepts a database reachable there. The sample company is created through the real API
(`POST /admin/seed-demo`), so the demo data goes through the same rules as real data; only the usernames and passwords
are then set to memorable values by `demo-ready.sh`.
