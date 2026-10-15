// Takes the demo pictures, one folder per MVP item (docs/demo-screenshots/mvp1-.../), by driving the real stack.
//
//   ./bin/demo-postgres.sh && ./bin/start-dev.sh      # the stack (LocalStack), in its own terminal
//   ./bin/demo-ready.sh                               # the sample company and the logins used below
//   cd frontend && npm run screenshots                # about 3 minutes
//   ./bin/demo-ready.sh                               # the script creates a person and a project, so reset afterwards
//
// OUT changes the output folder, BASE_URL the site address. Pictures are only taken after the screen shows what the step proves.
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const URL = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = path.resolve(process.env.OUT ?? '../docs/demo-screenshots')
const PASSWORD = 'Demo1234!'

const MVPS = {
  1: 'mvp1-sign-in-three-roles',
  2: 'mvp2-admin-creates-people-and-projects',
  3: 'mvp3-milestones-dates-deliverables',
  4: 'mvp4-assign-people-no-double-booking',
  5: 'mvp5-hours-and-cost',
  6: 'mvp6-risk-status-with-reasons',
  7: 'mvp7-archive-instead-of-delete',
  8: 'mvp8-a-screen-for-each-role',
  10: 'extra-history-and-audit',
  11: 'extra-tasks-board',
  12: 'extra-timeline',
  13: 'extra-dependencies',
  14: 'extra-assistant',
  15: 'extra-tables',
  16: 'extra-export',
  17: 'extra-pdf',
  18: 'extra-search',
}

// Only the picture folders are cleared: the README beside them is written by hand.
for (const dir of Object.values(MVPS)) {
  rmSync(path.join(OUT, dir), { recursive: true, force: true })
  mkdirSync(path.join(OUT, dir), { recursive: true })
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
const taken = []

const iso = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shot = async (mvp, name, target = page) => {
  await page.waitForTimeout(350)
  const file = path.join(OUT, MVPS[mvp], `${name}.png`)
  if (target !== page) {
    await target.screenshot({ path: file })
  } else if (await page.locator('[role="dialog"]').count()) {
    await page.screenshot({ path: file }) // a dialog is centred on the screen, so take the screen as it is
  } else {
    // A tall page: make the window as tall as the page, so the fixed header stays at the top of the picture.
    const size = page.viewportSize()
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.setViewportSize({ width: size.width, height: Math.max(size.height, Math.min(height, 2600)) })
    await page.waitForTimeout(250)
    await page.screenshot({ path: file })
    await page.setViewportSize(size)
  }
  taken.push(`${MVPS[mvp]}/${name}.png`)
}
const projectLink = (name) => page.getByRole('link', { name, exact: true }).first()
const projectRow = (name) => page.locator('div.MuiPaper-root', { has: projectLink(name) }).last()
const more = async (item) => { await page.getByRole('button', { name: 'More' }).first().click(); await page.getByRole('menuitem', { name: item }).click() }
const menuOf = async (milestone, item) => { await page.getByRole('button', { name: `Milestone actions: ${milestone}` }).click(); await page.getByRole('menuitem', { name: item }).click() }
const expand = async (milestone) => {
  const head = page.getByRole('button', { name: milestone, exact: true })
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click()
}
const card = (name) => page.locator('div.MuiPaper-root').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()
const dialog = () => page.getByRole('dialog')
const pick = async (label, option) => {
  await dialog().getByLabel(label).click()
  await page.getByRole('option', { name: option }).click()
}
async function signIn(user, pass = PASSWORD) {
  await page.goto(URL + '/login')
  await page.getByLabel('Username').fill(user)
  await page.getByLabel(/^Password/).fill(pass)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
async function signOut() {
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL('**/login')
}
const dashboardLoaded = () => page.locator('main a[href^="/projects/"]').first().waitFor()
const openProject = async (name) => {
  await projectLink(name).click()
  await page.getByRole('tab', { name: 'Plan' }).waitFor()
  await page.waitForTimeout(900)
}

// ---------------------------------------------------------------------------------------------------------------- MVP 1
await page.goto(URL + '/login')
await page.getByLabel('Username').waitFor()
await shot(1, '1a-sign-in-page')
await page.getByLabel('Username').fill('admin1')
await page.getByLabel(/^Password/).fill('not-the-password')
await page.getByRole('button', { name: 'Sign in' }).click()
await page.getByText('Invalid username or password').waitFor()
await shot(1, '1b-wrong-password-is-refused')

// The other two roles and the phone layout come first, while the sample company is exactly as loaded.
// ----------------------------------------------------------------------------------------------- manager and employee
await signIn('maria1')
await dashboardLoaded()
await shot(1, '1d-manager-home-only-their-own-projects')
await signOut()
await signIn('alex01')
await page.getByText('My milestones').waitFor()
await shot(1, '1e-employee-home-no-money-only-their-work')
await page.goto(URL + '/people')
await page.waitForURL('**/my-work')
await shot(1, '1f-employee-cannot-open-an-admin-page')
await signOut()

// MVP 8: a screen for each role, on a phone as well
await page.setViewportSize({ width: 390, height: 844 })
for (const [user, name, ready] of [
  ['admin1', '8a-admin-on-a-phone', dashboardLoaded],
  ['maria1', '8b-manager-on-a-phone', dashboardLoaded],
  ['alex01', '8c-employee-on-a-phone', () => page.getByText('My milestones').waitFor()],
]) {
  await signIn(user)
  await ready()
  await shot(8, name)
  await signOut()
}
await page.setViewportSize({ width: 1280, height: 800 })

// ---------------------------------------------------------------------------------------------------------------- admin
await signIn('admin1')
await dashboardLoaded()
await page.waitForTimeout(600)
await shot(1, '1c-admin-home')
await shot(6, '6a-dashboard-projects-ranked-by-urgency')
await shot(6, '6b-overdue-project-card', projectRow('Mobile App Launch'))
await shot(6, '6c-at-risk-project-card', projectRow('Data Platform Migration'))

// MVP 2: admin creates a person
await page.getByRole('link', { name: 'People', exact: true }).first().click()
await page.getByRole('heading', { name: 'People', exact: true }).waitFor()
await page.getByRole('cell', { name: /Maria Lopez/ }).first().waitFor()
await shot(2, '2a-people-list')
await page.getByRole('button', { name: 'New person' }).click()
await dialog().getByLabel('Full name').fill('Dana Reyes')
await dialog().getByLabel('Email').fill('dana.reyes@demo.acme.example')
await dialog().getByLabel('Job title').fill('Business Analyst')
await dialog().getByLabel(/Hourly cost/).fill('48')
await pick(/Reports to/, /Maria Lopez/)
await shot(2, '2b-new-person-form')
await page.getByRole('button', { name: 'Create account' }).click()
await page.getByText('One-time password').waitFor()
await shot(2, '2c-generated-username-and-one-time-password')
await page.getByRole('button', { name: 'I have saved them' }).click()

// MVP 2: admin creates a project for one manager
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await page.getByRole('button', { name: 'New project' }).click()
await dialog().getByLabel('Project name').fill('Office Move')
await dialog().getByLabel('Description').fill('Move the Boston team to the new office')
await pick('Manager', /Maria Lopez/)
await dialog().getByLabel(/Total hours/).fill('300')
await dialog().getByLabel(/Budget/).fill('40000')
await shot(2, '2d-new-project-form-one-manager')
await page.getByRole('button', { name: 'Create project' }).click()
await projectLink('Office Move').waitFor()
await shot(2, '2e-project-created')

// MVP 3: milestones with dates and deliverables
await openProject('Office Move')
await page.getByRole('button', { name: 'Add milestone' }).click()
await dialog().getByLabel('Name').fill('Planning')
await dialog().getByLabel('What is this milestone for?').fill('Floor plan and vendor choice')
await dialog().getByLabel('Due').fill(iso(30))
await dialog().getByLabel('Planned hours').fill('120')
await dialog().getByLabel(/Budget/).fill('9000')
await shot(3, '3a-add-milestone-with-dates-hours-budget')
await page.getByRole('button', { name: 'Add milestone' }).last().click()
await page.getByRole('heading', { name: 'Planning', exact: true }).waitFor()
await expand('Planning')
for (const item of ['Floor plan', 'Vendor shortlist', 'Move schedule']) {
  await card('Planning').getByLabel('New task').fill(item)
  await card('Planning').getByRole('button', { name: 'Add', exact: true }).click()
  await card('Planning').getByRole('checkbox', { name: item }).waitFor() // the checklist row, not the description text
}
await card('Planning').getByRole('checkbox', { name: 'Floor plan' }).click()
await page.waitForFunction(() => /Tasks \(1 of 3 done\)/i.test(document.body.innerText))
await shot(3, '3b-milestone-with-dates-and-deliverable-checklist')

// MVP 4: assign people; no double booking
await menuOf('Planning', 'Assign a person')
await pick(/^Employee/, /Alex Kim/)
await shot(4, '4a-assign-a-person')
await page.getByRole('button', { name: 'Assign', exact: true }).click()
await page.getByRole('dialog').getByText(/already on milestone 'Build'/).waitFor()
await shot(4, '4b-double-booking-refused-with-the-clash-named')
await page.getByRole('button', { name: 'Cancel' }).click()
await menuOf('Planning', 'Assign a person')
await pick(/^Employee/, /Dana Reyes/)
await page.getByRole('button', { name: 'Assign', exact: true }).click()
await card('Planning').getByText(/Dana Reyes/).waitFor()
await menuOf('Planning', 'Assign a person')
await pick(/^Employee/, /Priya Shah/)
await page.getByRole('button', { name: 'Assign', exact: true }).click()
await card('Planning').getByText(/Priya Shah/).waitFor()
await shot(4, '4c-several-people-on-one-milestone')

// MVP 5: hours and cost
await shot(5, '5a-planned-against-expected-hours-and-cost', card('Planning'))
await page.getByRole('tab', { name: 'Team & costs' }).click()
await page.getByText('Total').first().waitFor()
await shot(5, '5b-team-expected-hours-cost-and-rate')
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Website Redesign')
await page.getByRole('tab', { name: 'Team & costs' }).click()
await page.getByText('Total spent').waitFor()
await shot(5, '5c-budget-labor-plus-other-costs')

// MVP 3 (continued) and MVP 6: the milestone sign-off and the risk reasons
await page.getByRole('tab', { name: 'Plan' }).click()
await page.getByRole('button', { name: 'Milestone actions: Build' }).click()
await page.getByText('Every task must be done first').waitFor()
await shot(3, '3c-sign-off-is-switched-off-while-a-task-is-open')
await page.keyboard.press('Escape')
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Data Platform Migration')
await page.getByRole('button', { name: /^Why\?/ }).click()
await page.getByText(/Planned staffing will cost/).waitFor()
await shot(6, '6d-why-this-project-is-at-risk')
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Mobile App Launch')
await page.getByText(/past the end date/).first().waitFor()
await shot(6, '6e-why-this-project-is-overdue')

// MVP 7: archive instead of delete
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Website Redesign')
// Extra: dependencies. Launch waits for Build, so it cannot be started yet.
await card('Launch').getByText('Waiting for 1').waitFor()
await menuOf('Launch', 'Mark as started')
await card('Launch').getByText(/cannot be started yet: it is waiting for Build/).waitFor()
await shot(13, 'm1-a-milestone-that-waits-cannot-be-started', card('Launch'))
await menuOf('Launch', 'Add dependency')
await page.getByRole('dialog').waitFor()
await page.getByRole('combobox', { name: /Waits for this milestone/ }).click()
await page.getByRole('option').first().waitFor()
await shot(13, 'm2-choose-what-it-waits-for')
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await card('Build').getByRole('checkbox', { name: 'Dashboard' }).click()
await page.waitForFunction(() => /2 of 2 tasks done/i.test(document.body.innerText))
await page.getByRole('button', { name: 'Ready to sign off' }).click()
await dialog().getByLabel('Review note').fill('Reviewed with the client; both screens signed off')
await page.getByRole('button', { name: 'Sign off and complete' }).click()
await page.getByText('Completed, archived').first().waitFor()
await shot(7, '7a-completed-milestone-moves-to-the-archive')
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Customer Portal')
await page.getByRole('button', { name: 'Project actions' }).click()
await page.getByRole('menuitem', { name: 'Archive project' }).click()
await page.getByRole('dialog').waitFor()
await shot(7, '7b-archive-asks-first-and-says-nothing-is-deleted')
await page.getByRole('button', { name: 'Archive', exact: true }).last().click()
await page.waitForTimeout(700)
await more('Archive')
await page.getByRole('cell', { name: /^Customer Portal/ }).waitFor()
await shot(7, '7c-archive-page-admins-only')
await page.getByRole('button', { name: 'Restore Customer Portal' }).click()
await page.getByRole('cell', { name: /^Customer Portal/ }).waitFor({ state: 'detached' })
await shot(7, '7d-restored-nothing-was-lost')

// Extra: the history (audit trail) of everything done above
await more('History')
await page.getByText('Signed off milestone Build').first().waitFor()
await shot(10, 'h1-history-who-did-what-and-when')
await page.getByRole('button', { name: /Show details: Signed off milestone Build/ }).click()
await page.getByText(/→ Completed/).first().waitFor()
await shot(10, 'h2-an-entry-opened-to-show-exactly-what-changed')
await page.getByRole('combobox', { name: 'Person' }).click()
await page.getByRole('option', { name: 'System Admin' }).click()  // this script acts as the admin, so the admin is who the history credits
await page.waitForTimeout(700)
await page.getByText('Signed off milestone Build').first().waitFor()
await shot(10, 'h3-filtered-to-one-person')
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Website Redesign')
await page.getByRole('tab', { name: 'History' }).click()
await page.getByText('Signed off milestone Build').first().waitFor()
await shot(10, 'h4-a-project-has-its-own-history-tab')
await signOut()

// Extra: tasks, a board and a list for the manager, and "my tasks" for an employee
await signIn('maria1')
await dashboardLoaded()
await openProject('Website Redesign')
await page.getByRole('tab', { name: 'Tasks' }).click()
await page.getByRole('group', { name: /^To do/ }).waitFor()
await shot(11, 'k1-a-board-with-owners-priorities-and-due-dates')
await page.getByRole('button', { name: 'Task actions: Launch announcement' }).click()
await page.getByRole('menuitem', { name: 'Move to In progress' }).waitFor()
await shot(11, 'k2-every-card-has-a-menu-so-it-works-without-a-mouse')
await page.getByRole('menuitem', { name: 'Move to In progress' }).click()
await page.getByRole('button', { name: 'List', exact: true }).click()
await page.getByRole('table', { name: 'Tasks' }).waitFor()
await shot(11, 'k3-the-same-tasks-as-a-list')
await signOut()
await signIn('omar01')
await page.getByText('My milestones').waitFor()
await page.getByRole('heading', { name: 'My tasks', exact: true }).waitFor()
await page.getByRole('button', { name: 'Pause Data copied' }).waitFor()
await shot(11, 'k4-an-employee-sees-only-their-own-tasks')
await signOut()

// Extra: the timeline
await signIn('admin1')
await dashboardLoaded()
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await page.getByRole('button', { name: 'Timeline', exact: true }).click()
await page.getByRole('list', { name: 'All projects' }).waitFor()
await shot(12, 'l1-every-open-project-on-one-calendar')
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await openProject('Data Platform Migration')
await page.getByRole('tab', { name: 'Plan' }).waitFor()
await page.getByRole('button', { name: 'Timeline', exact: true }).click()
await page.getByRole('list', { name: 'Project timeline' }).waitFor()
await shot(12, 'l2-one-project-with-its-tasks-as-diamonds')

// Extra: tables you can tick, sort and page
await page.getByRole('link', { name: 'People', exact: true }).first().click()
await page.getByRole('checkbox', { name: 'Select Alex Kim' }).waitFor()
for (const who of ['Aisha Khan', 'Alex Kim', 'Chloe Dubois']) await page.getByRole('checkbox', { name: `Select ${who}` }).check()
await page.getByText('3 selected', { exact: true }).waitFor()
await shot(15, 'p1-people-sorted-filtered-and-ticked')
await page.getByRole('button', { name: 'Export 3 selected' }).click()
await page.getByRole('dialog', { name: 'Export 3 people' }).waitFor()
await shot(16, 'q1-choose-what-goes-in-the-file')
await page.getByRole('button', { name: 'Cancel' }).click()
await page.getByRole('dialog').waitFor({ state: 'detached' })
await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
await page.getByRole('button', { name: 'Table', exact: true }).click()
await page.getByRole('table', { name: 'Projects' }).waitFor()
for (const what of ['Security Compliance Audit', 'Mobile App Launch']) await page.getByRole('checkbox', { name: `Select ${what}` }).check()
await page.getByRole('button', { name: 'Ends', exact: true }).click()
await shot(15, 'p2-projects-as-a-table')
await page.getByRole('link', { name: 'Payments Gateway Upgrade', exact: true }).click()
await page.getByRole('tab', { name: 'Tasks' }).click()
await page.getByRole('group', { name: 'Task view' }).getByRole('button', { name: 'List', exact: true }).click()
await page.getByRole('table', { name: 'Tasks' }).waitFor()
await page.getByRole('button', { name: 'Priority', exact: true }).click()
await shot(15, 'p3-a-projects-tasks-sorted-by-priority')
for (const what of ['Regression suite', 'Retire the old gateway']) await page.getByRole('checkbox', { name: `Select ${what}` }).check()
await page.getByRole('button', { name: 'Move to' }).waitFor()
await shot(16, 'q2-act-on-ticked-tasks-move-or-set-owner')
await page.getByRole('button', { name: 'Project actions' }).click()
await page.getByRole('menuitem', { name: 'Project report (PDF)' }).click()
await page.getByRole('dialog', { name: 'Project report' }).waitFor()
await shot(17, 'r1-a-project-report-pick-the-sections')
await page.getByRole('button', { name: 'Cancel' }).click()
await page.getByRole('dialog').waitFor({ state: 'detached' })

// Extra: the search box
await page.getByRole('combobox', { name: 'Search projects, people, tasks' }).fill('ma')
await page.getByRole('listbox').waitFor()
await shot(18, 's1-search-finds-projects-people-and-tasks')
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')

// Extra: the assistant
await page.getByRole('button', { name: 'Ask the assistant' }).click()
const assistant = page.getByRole('complementary', { name: 'Assistant' })
await assistant.getByRole('button', { name: 'What is late?' }).waitFor()
await shot(14, 'n1-a-chat-box-on-every-screen-with-questions-to-try')
await assistant.getByRole('button', { name: 'What is late?' }).click()
await assistant.getByText(/Mobile App Launch/).first().waitFor()
await page.waitForTimeout(400)
await shot(14, 'n2-it-answers-from-what-the-person-may-see')
await page.keyboard.press('Escape')
await signOut()

await browser.close()
console.log(`${taken.length} pictures written to ${OUT}`)
taken.forEach((t) => console.log('  ' + t))
