import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { employeeProject, milestone, project, renderPage, signIn } from '../test/pmFixtures'
import { ProjectDetailPage } from './ProjectDetailPage'

// MUI dialogs are slow to open in jsdom on a busy machine.
vi.setConfig({ testTimeout: 30_000 })

const body = (c: InternalAxiosRequestConfig) => JSON.parse(c.data as string)
const milestones = (items: unknown[]) => ({ items, total: items.length, planned_hours: 100, planned_budget: 8000 })
const team = (laborCost: number | null = 2400) => ({
  items: [
    { assignment_id: 'a1', user_id: 'u1', name: 'Ann Designer', job_title: 'Designer', milestone_id: 'm1', milestone_name: 'Design', start_date: '2026-09-01', end_date: '2026-09-30', days_worked: 10, hours_worked: 80, labor_cost: laborCost === null ? null : 2400, expected_hours: 160, expected_cost: laborCost === null ? null : 4800, hourly_rate: laborCost === null ? null : 30 },
  ],
  total: 1, hours_worked: 80, labor_cost: laborCost, expected_hours: 160, expected_cost: laborCost === null ? null : 4800,
})
const costs = {
  items: [{ id: 'c1', category: 'license', description: 'Figma seats', amount: 900, incurred_on: '2026-09-15' }],
  total: 1, other_cost: 900, labor_cost: 2400, total_cost: 3300, budget_amount: 50000, budget_remaining: 46700,
}

/** Default answers for everything a project page asks for; `extra` replaces or adds routes. */
function serve(p: unknown = project(), extra: Record<string, unknown> = {}) {
  return mockRoutes({
    'GET /projects/:id': p,
    'GET /projects/:id/milestones': milestones([milestone()]),
    'GET /projects/:id/milestones/:id/deliverables': { items: [], total: 0, done: 0, ready_to_complete: false },
    'GET /projects/:id/milestones/:id/team': { items: [], total: 0, hours_worked: 0, labor_cost: 0, expected_hours: 0, expected_cost: 0 },
    'GET /projects/:id/team': team(),
    'GET /projects/:id/milestones/:id/dependencies': { blocked_by: [], blocks: [], is_blocked: false },
    'GET /projects/:id/dependencies': { blocked_by: [], blocks: [], is_blocked: false },
    'GET /projects/:id/costs': costs,
    'GET /projects/:id/tasks': { items: [], total: 0 },
    'GET /reports/timeline': { as_of: '2026-10-14', projects: [] },
    ...extra,
  })
}

const page = (path = '/projects/p1') => renderPage(<ProjectDetailPage />, path, '/projects/:projectId')

/** Shows where the router is, so a test can read the address bar (the tab and view live in it). */
function Here() {
  const { pathname, search } = useLocation()
  return <output data-testid="here">{pathname}{search}</output>
}
const pageAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <AuthProvider>
      <Routes>
        <Route path="/projects/:projectId" element={<><ProjectDetailPage /><Here /></>} />
        <Route path="/projects" element={<p>Projects list</p>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>,
)
const here = () => screen.getByTestId('here').textContent
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent)
const openActions = async () => userEvent.click(await screen.findByRole('button', { name: 'Project actions' }))
const menuItems = () => screen.getAllByRole('menuitem').map((m) => m.textContent)

afterEach(() => {
  restoreApi()
  localStorage.clear()
})

describe('Project detail: what everyone sees', () => {
  it('shows a spinner, then the breadcrumb, header, description and one summary strip', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    page()
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Website redesign' })).toBeInTheDocument()
    expect(screen.getByText(/Mia Manager · Sep 1, 2026 to Dec 31, 2026/)).toBeInTheDocument()
    expect(screen.getByText('New public site')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('On track')).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects')
    expect(within(crumbs).getByText('Website redesign')).toHaveAttribute('aria-current', 'page')

    // one line of facts instead of four tiles
    expect(screen.getByText('60 days left · 1 of 4 milestones · 120 h of 500 h · $15,000 of $50,000')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Work done 25 percent, calendar elapsed 40 percent' })).toBeInTheDocument()
  })

  it('counts days late when the project is behind', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project({}, { days_remaining: -5, milestones_overdue: 2 }))
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.getByText(/^5 days late · 1 of 4 milestones/)).toBeInTheDocument()
  })

  it('leaves money out of the facts for someone who may not see it', async () => {
    signIn('employee')
    serve(employeeProject())
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.getByText('60 days left · 1 of 4 milestones · 120 h of 500 h')).toBeInTheDocument()
  })

  it('shows the first risk reason with a Why? toggle for the rest when the project is at risk', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project({}, { risk_level: 'at_risk', risk_reasons: ['Hours are running ahead of progress', 'One milestone is due this week'] }))
    page()
    expect(await screen.findByText('Hours are running ahead of progress')).toBeInTheDocument()
    expect(screen.getByText('At risk')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('One milestone is due this week')).not.toBeInTheDocument()

    const why = screen.getByRole('button', { name: 'Why? (+1)' })
    expect(why).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(why)
    expect(await screen.findByText('One milestone is due this week')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(screen.queryByText('One milestone is due this week')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Why? (+1)' })).toBeInTheDocument()
  })

  it('counts every extra reason on the toggle', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project({}, { risk_level: 'at_risk', risk_reasons: ['One', 'Two', 'Three'] }))
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'Why? (+2)' }))
    expect(await screen.findByText('Two')).toBeInTheDocument()
    expect(screen.getByText('Three')).toBeInTheDocument()
  })

  it('shows a single reason without a toggle, and an overdue project with its reason', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project({}, { risk_level: 'overdue', risk_reasons: ['The end date has passed'] }))
    page()
    expect(await screen.findByText('The end date has passed')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Why/ })).not.toBeInTheDocument()
  })

  it('has no reason line when the project is on track', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.queryByRole('button', { name: /^Why/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server sentence with a retry when the project fails to load for a reason that may pass', async () => {
    signIn('manager')
    let up = false
    serve(undefined, { 'GET /projects/:id': () => (up ? project() : apiError(500, 'server_error', 'The database is waking up')) })
    page()
    expect(await screen.findByText('The database is waking up')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to projects' })).not.toBeInTheDocument()
    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Website redesign' })).toBeInTheDocument()
  })

  it.each([[404, 'not_found', 'Project not found'], [403, 'forbidden', 'You cannot see this project']])(
    'offers a way back, not a retry, when the project load answers %i',
    async (status, code, message) => {
      signIn('manager')
      serve(undefined, { 'GET /projects/:id': apiError(status, code, message) })
      page()
      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('link', { name: 'Back to projects' }))
      expect(await screen.findByText('Projects list')).toBeInTheDocument()
    },
  )

  it('shows the Plan tab first, with an empty state when there are no milestones', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project(), { 'GET /projects/:id/milestones': milestones([]) })
    page()
    expect(await screen.findByText('No milestones yet.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    // another manager cannot add one, so the empty state offers no button
    expect(screen.queryByRole('button', { name: 'Add the first milestone' })).not.toBeInTheDocument()
  })

  it('lets the project manager start the plan from the empty state', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(project(), { 'GET /projects/:id/milestones': milestones([]) })
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'Add the first milestone' }))
    expect(await screen.findByRole('dialog', { name: 'Add a milestone' })).toBeInTheDocument()
  })

  it('keeps the page and shows an error when only the milestone list fails', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project(), { 'GET /projects/:id/milestones': apiError(500, 'server_error', 'Milestones are unavailable') })
    page()
    expect(await screen.findByText('Milestones are unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Website redesign' })).toBeInTheDocument()
  })

  it('renders one card per milestone', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project(), { 'GET /projects/:id/milestones': milestones([milestone(), milestone({ id: 'm2', name: 'Build' })]) })
    page()
    expect(await screen.findByRole('heading', { name: 'Design' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Build' })).toBeInTheDocument()
  })

  it('shows who works on the project in the Team & costs tab', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    page()
    await userEvent.click(await screen.findByRole('tab', { name: 'Team & costs' }))
    expect(await screen.findByText('Ann Designer')).toBeInTheDocument()
    const row = screen.getByText('Ann Designer').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('Designer')
    expect(row).toHaveTextContent('Design')
    expect(row).toHaveTextContent('Sep 1, 2026 to Sep 30, 2026')
    expect(row).toHaveTextContent('80 h')
    expect(row).toHaveTextContent('$2,400')
    // what the whole range will take, worked out when the work was planned, and the rate it was planned at
    expect(row).toHaveTextContent('160 h')
    expect(row).toHaveTextContent('$4,800')
    expect(row).toHaveTextContent('at $30/h')
    expect(screen.getByText('Total').closest('tr')).toHaveTextContent('80 h160 h$2,400$4,800')
  })

  it('says nobody is assigned when the team is empty', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project(), { 'GET /projects/:id/team': { items: [], total: 0, hours_worked: 0, labor_cost: 0, expected_hours: 0, expected_cost: 0 } })
    page()
    await userEvent.click(await screen.findByRole('tab', { name: 'Team & costs' }))
    expect(await screen.findByText(/^Nobody is assigned yet\./)).toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('shows an error with retry when the team cannot be loaded', async () => {
    signIn('manager', { id: 'someone-else' })
    let fail = true
    serve(project(), { 'GET /projects/:id/team': () => (fail ? apiError(500, 'server_error', 'Team unavailable') : team()) })
    page()
    await userEvent.click(await screen.findByRole('tab', { name: 'Team & costs' }))
    expect(await screen.findByText('Team unavailable')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ann Designer')).toBeInTheDocument()
  })
})

describe('Project detail: employee', () => {
  beforeEach(() => signIn('employee'))

  it('sees Plan, Tasks and Team only, no Costs, no money and no actions menu', async () => {
    serve(employeeProject(), {
      'GET /projects/:id/milestones': milestones([milestone({ budget_amount: null, labor_cost: null, expected_cost: null, budget_pct: null })]),
      'GET /projects/:id/team': team(null),
    })
    const { container } = page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(tabNames()).toEqual(['Plan', 'Tasks', 'Team'])
    expect(screen.queryByRole('button', { name: 'Project actions' })).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Design' })
    expect(container.textContent).not.toContain('$')

    await userEvent.click(screen.getByRole('tab', { name: 'Team' }))
    await screen.findByText('Ann Designer')
    expect(screen.queryByText('Cost so far')).not.toBeInTheDocument()
    expect(screen.queryByText('Costs')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('$')
  })

  it('has no manager or admin buttons, even on an active project', async () => {
    const calls = serve(employeeProject())
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    for (const name of ['Mark project complete', 'Archive project', 'Add milestone', 'Assign a person', 'Complete milestone', 'Project actions']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('group', { name: 'Plan view' })).not.toBeInTheDocument()
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
  })
})

describe('Project detail: tabs and the address bar', () => {
  it('opens the tab named in the address, here Tasks', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(project(), { 'GET /projects/:id/tasks': { items: [{ id: 't1', milestone_id: 'm1', name: 'Wireframes', description: '', done: false, status: 'todo', priority: 'medium', due_date: null, assignee_id: null, done_at: null, project_id: 'p1', project_name: 'Website', milestone_name: 'Design', assignee_name: null, is_overdue: false }], total: 1 } })
    pageAt('/projects/p1?tab=tasks')
    expect(await screen.findByText('Wireframes')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'false')
    expect(within(screen.getByRole('tabpanel')).getByRole('group', { name: 'Task view' })).toBeInTheDocument()
    expect(screen.queryByText('Design', { selector: 'h3, h2, h6' })).not.toBeInTheDocument() // the milestone cards are not on this tab
  })

  it('writes the tab into the address when one is clicked, and drops it again for Plan', async () => {
    signIn('manager', { id: 'manager-1' })
    serve()
    pageAt('/projects/p1')
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(here()).toBe('/projects/p1')
    await userEvent.click(screen.getByRole('tab', { name: 'Tasks' }))
    expect(here()).toBe('/projects/p1?tab=tasks')
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Team & costs' }))
    expect(here()).toBe('/projects/p1?tab=team')
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(here()).toBe('/projects/p1?tab=history')
    await userEvent.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(here()).toBe('/projects/p1') // the default tab leaves the address clean
  })

  it('falls back to Plan for a tab that does not exist or that this person may not open', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    const first = pageAt('/projects/p1?tab=history') // History is for the project manager and admins
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    first.unmount()
    pageAt('/projects/p1?tab=nonsense')
    await waitFor(() => expect(screen.getAllByRole('tab', { name: 'Plan' })[0]).toHaveAttribute('aria-selected', 'true'))
  })

  it('gives the open tab as a tab panel labelled by it', async () => {
    signIn('manager', { id: 'manager-1' })
    serve()
    pageAt('/projects/p1?tab=tasks')
    const panel = await screen.findByRole('tabpanel')
    expect(panel).toHaveAccessibleName('Tasks')
    await userEvent.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Plan')
  })

  it('names the four tabs by what the person may see', async () => {
    signIn('admin')
    serve()
    const admin = pageAt('/projects/p1')
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(tabNames()).toEqual(['Plan', 'Tasks', 'Team & costs', 'History'])
    admin.unmount()
    localStorage.clear()

    signIn('manager', { id: 'manager-1' })
    const owner = pageAt('/projects/p1')
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(tabNames()).toEqual(['Plan', 'Tasks', 'Team & costs', 'History'])
    owner.unmount()
    localStorage.clear()

    signIn('manager', { id: 'someone-else' })
    const other = pageAt('/projects/p1')
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(tabNames()).toEqual(['Plan', 'Tasks', 'Team & costs'])
    other.unmount()
  })

  it('lets a manager switch the Plan between List and Timeline, kept in the address', async () => {
    signIn('manager', { id: 'manager-1' })
    const calls = serve()
    pageAt('/projects/p1')
    const view = await screen.findByRole('group', { name: 'Plan view' })
    expect(within(view).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Design' })).toBeInTheDocument()

    await userEvent.click(within(view).getByRole('button', { name: 'Timeline' }))
    expect(here()).toBe('/projects/p1?view=timeline')
    expect(within(view).getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('heading', { name: 'Design' })).not.toBeInTheDocument()
    await waitFor(() => expect(calls).toContain('GET /reports/timeline'))
    expect(screen.queryByRole('switch', { name: 'Show tasks' })).not.toBeInTheDocument() // this project is not on the timeline, so no chart

    await userEvent.click(within(view).getByRole('button', { name: 'List' }))
    expect(here()).toBe('/projects/p1')
    expect(await screen.findByRole('heading', { name: 'Design' })).toBeInTheDocument()
  })

  it('opens the timeline view from the address, and shows the chart when the project is on it', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(project(), { 'GET /reports/timeline': { as_of: '2026-10-14', projects: [{ id: 'p1', name: 'Website redesign', manager_name: 'Mia', status: 'active', start_date: '2026-09-01', end_date: '2026-12-31', risk_level: 'on_track', blocked_by_count: 0, milestones: [] }] } })
    pageAt('/projects/p1?view=timeline')
    expect(await screen.findByRole('switch', { name: 'Show tasks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has no Timeline view for people who do not manage the project, even if the address asks for it', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    pageAt('/projects/p1?view=timeline')
    expect(await screen.findByRole('heading', { name: 'Design' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Plan view' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Show tasks' })).not.toBeInTheDocument()
  })

  it('ignores the view on other tabs', async () => {
    signIn('manager', { id: 'manager-1' })
    serve()
    pageAt('/projects/p1?tab=tasks&view=timeline')
    await screen.findByRole('group', { name: 'Task view' })
    expect(screen.queryByRole('group', { name: 'Plan view' })).not.toBeInTheDocument()
  })
})

describe('Project detail: who can manage', () => {
  it('lets the project manager complete an active project from the menu, then refreshes', async () => {
    signIn('manager', { id: 'manager-1' })
    let status = 'active'
    const calls = serve(undefined, {
      'GET /projects/:id': () => project({ status }, status === 'completed' ? { risk_level: 'done' } : {}),
      'POST /projects/:id/complete': () => { status = 'completed'; return project({ status }) },
    })
    page()
    await openActions()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark project complete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mark this project complete?' })
    expect(dialog).toHaveTextContent('can no longer be edited')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark complete' }))

    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(calls).toContain('POST /projects/p1/complete')
    // a finished project can no longer be edited
    expect(screen.queryByRole('button', { name: 'Add milestone' })).not.toBeInTheDocument()
    await openActions()
    expect(menuItems()).toEqual(['Project dependencies'])
  })

  it('shows the server refusal inside the dialog when completing fails', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(undefined, { 'POST /projects/:id/complete': apiError(409, 'open_milestones', 'Finish or cancel the open milestones first') })
    page()
    await openActions()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark project complete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark complete' }))
    expect(await within(dialog).findByText('Finish or cancel the open milestones first')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('gives the project manager Mark complete and Dependencies in the menu, but not Archive', async () => {
    signIn('manager', { id: 'manager-1' })
    serve()
    page()
    await openActions()
    expect(menuItems()).toEqual(['Mark project complete', 'Project dependencies'])
  })

  it('gives an admin all three actions on an active project', async () => {
    signIn('admin')
    serve()
    page()
    await openActions()
    expect(menuItems()).toEqual(['Mark project complete', 'Project dependencies', 'Archive project'])
  })

  it('gives an admin only Dependencies and Archive on a completed project', async () => {
    signIn('admin')
    serve(project({ status: 'completed' }, { risk_level: 'done' }))
    page()
    await screen.findByText('Completed')
    await openActions()
    expect(menuItems()).toEqual(['Project dependencies', 'Archive project'])
  })

  it('gives another manager no actions menu and no buttons for a project they do not run', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.queryByRole('button', { name: 'Project actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add milestone' })).not.toBeInTheDocument()
  })

  it('lets an admin archive a project after confirming, with buttons that say what they do', async () => {
    signIn('admin')
    const calls = serve(undefined, { 'POST /projects/:id/archive': project({ status: 'archived' }) })
    page()
    await openActions()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive project' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archive this project?' })
    expect(dialog).toHaveTextContent('nothing is deleted')
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep project', 'Archive'])
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(calls).toContain('POST /projects/p1/archive'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not archive when the admin keeps the project', async () => {
    signIn('admin')
    const calls = serve()
    page()
    await openActions()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive project' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep project' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
  })

  it('asks for archived milestones only when an admin is looking', async () => {
    const seen: unknown[] = []
    const handler = (c: InternalAxiosRequestConfig) => { seen.push(c.params?.include_archived); return milestones([]) }
    signIn('admin')
    serve(undefined, { 'GET /projects/:id/milestones': handler })
    page()
    await screen.findByText(/No milestones yet/)
    expect(seen).toEqual(['true'])
    restoreApi()
    localStorage.clear()
    document.body.innerHTML = ''

    seen.length = 0
    signIn('manager', { id: 'manager-1' })
    serve(undefined, { 'GET /projects/:id/milestones': handler })
    page()
    await screen.findAllByText(/No milestones yet/)
    expect(seen).toEqual([undefined])
  })

  it('offers an admin nothing but Dependencies on an archived project, and no Add milestone', async () => {
    signIn('admin')
    serve(project({ status: 'archived' }))
    page()
    await screen.findByText('Archived')
    await openActions()
    expect(menuItems()).toEqual(['Project dependencies'])
    expect(screen.queryByRole('button', { name: 'Add milestone' })).not.toBeInTheDocument()
  })
})

describe('Project detail: add a milestone', () => {
  const open = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Add milestone' }))
    return screen.findByRole('dialog', { name: 'Add a milestone' })
  }

  it('needs a name, then posts the milestone in snake_case and reloads the list', async () => {
    signIn('manager', { id: 'manager-1' })
    let added = false
    const sent: unknown[] = []
    const calls = serve(undefined, {
      'GET /projects/:id/milestones': () => milestones(added ? [milestone({ name: 'Research' })] : []),
      'POST /projects/:id/milestones': (c: InternalAxiosRequestConfig) => { sent.push(body(c)); added = true; return milestone({ name: 'Research' }) },
    })
    page()
    const dialog = await open()
    expect(dialog).toHaveTextContent('Dates, hours and budget must fit inside the project (Sep 1, 2026 to Dec 31, 2026).')
    const submit = within(dialog).getByRole('button', { name: 'Add milestone' })
    expect(submit).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Research')
    await userEvent.type(within(dialog).getByLabelText(/What is this milestone for/), 'Interviews')
    await userEvent.clear(within(dialog).getByLabelText(/^Starts/))
    await userEvent.type(within(dialog).getByLabelText(/^Starts/), '2026-10-05')
    await userEvent.clear(within(dialog).getByLabelText(/^Due/))
    await userEvent.type(within(dialog).getByLabelText(/^Due/), '2026-11-15')
    await userEvent.type(within(dialog).getByLabelText('Planned hours'), '60')
    await userEvent.type(within(dialog).getByLabelText(/Budget/), '5000')
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ name: 'Research', description: 'Interviews', start_date: '2026-10-05', due_date: '2026-11-15', allocated_hours: 60, budget_amount: 5000 })
    expect(calls.filter((c) => c === 'GET /projects/p1')).toHaveLength(2)
  })

  it('shows the server reason in the dialog and keeps what was typed', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(undefined, {
      'POST /projects/:id/milestones': apiError(422, 'validation_error', 'Request validation failed', [{ field: 'due_date', message: 'due date is outside the project' }]),
    })
    page()
    const dialog = await open()
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Research')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }))
    expect(await within(dialog).findByText('Request validation failed: due date is outside the project')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Research')
  })
})

describe('Project detail: costs, stacked under the team', () => {
  const openCosts = async () => {
    await userEvent.click(await screen.findByRole('tab', { name: 'Team & costs' }))
    await screen.findByText('People (labor)')
  }

  it('shows the team table and then the costs on the same tab', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    page()
    await openCosts()
    const teamRow = screen.getByText('Ann Designer')
    const costRow = screen.getByText('Figma seats')
    expect(teamRow.compareDocumentPosition(costRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the totals and each recorded cost', async () => {
    signIn('manager', { id: 'someone-else' })
    serve()
    page()
    await openCosts()
    const total = (label: string) => screen.getByText(label).parentElement as HTMLElement
    expect(total('People (labor)')).toHaveTextContent('$2,400')
    expect(total('Other costs')).toHaveTextContent('$900')
    expect(total('Total spent')).toHaveTextContent('$3,300')
    expect(total('Budget left')).toHaveTextContent('$46,700')
    const row = screen.getByText('Figma seats').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('Sep 15, 2026')
    expect(row).toHaveTextContent('license')
    expect(row).toHaveTextContent('$900')
    expect(screen.queryByRole('button', { name: 'Add a cost' })).not.toBeInTheDocument()
  })

  it('says so when no other costs were recorded', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project(), { 'GET /projects/:id/costs': { ...costs, items: [], total: 0 } })
    page()
    await openCosts()
    expect(screen.getByText('No other costs recorded.')).toBeInTheDocument()
  })

  it('shows an error when the costs cannot be loaded', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project(), { 'GET /projects/:id/costs': apiError(500, 'server_error', 'Costs unavailable') })
    page()
    await userEvent.click(await screen.findByRole('tab', { name: 'Team & costs' }))
    expect(await screen.findByText('Costs unavailable')).toBeInTheDocument()
  })

  it('adds a cost with its category, then refreshes both the costs and the project totals', async () => {
    signIn('manager', { id: 'manager-1' })
    const sent: unknown[] = []
    let added = false
    const calls = serve(undefined, {
      'GET /projects/:id/costs': () => (added ? { ...costs, items: [...costs.items, { id: 'c2', category: 'travel', description: 'Client visit', amount: 450, incurred_on: '2026-10-01' }] } : costs),
      'POST /projects/:id/costs': (c: InternalAxiosRequestConfig) => { sent.push(body(c)); added = true; return {} },
    })
    page()
    await openCosts()
    await userEvent.click(screen.getByRole('button', { name: 'Add a cost' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a cost' })
    const submit = within(dialog).getByRole('button', { name: 'Add cost' })
    expect(submit).toBeDisabled()

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'travel' }))
    await userEvent.type(within(dialog).getByLabelText(/What was it for/), 'Client visit')
    expect(submit).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Amount/), '450')
    await userEvent.clear(within(dialog).getByLabelText(/^Date/))
    await userEvent.type(within(dialog).getByLabelText(/^Date/), '2026-10-01')
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    expect(await screen.findByText('Client visit')).toBeInTheDocument()
    expect(sent).toEqual([expect.objectContaining({ category: 'travel', description: 'Client visit', amount: 450 })])
    expect(sent[0]).toHaveProperty('incurred_on', '2026-10-01')
    expect(calls.filter((c) => c === 'GET /projects/p1')).toHaveLength(2)
  })

  it('shows the refusal in the dialog when the cost is rejected', async () => {
    signIn('admin')
    serve(undefined, { 'POST /projects/:id/costs': apiError(409, 'project_closed', 'This project is closed') })
    page()
    await openCosts()
    await userEvent.click(screen.getByRole('button', { name: 'Add a cost' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a cost' })
    await userEvent.type(within(dialog).getByLabelText(/What was it for/), 'Server')
    await userEvent.type(within(dialog).getByLabelText(/Amount/), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add cost' }))
    expect(await within(dialog).findByText('This project is closed')).toBeInTheDocument()
  })
})

describe('Project detail: History tab', () => {
  const history = {
    items: [{
      id: 7, occurred_at: '2026-03-11T14:05:00Z', actor_id: 'm', actor_name: 'Mia Manager', entity: 'milestone', entity_id: 'm1',
      project_id: 'p1', project_name: 'Website redesign', label: 'Design', action: 'create', summary: 'Added milestone Design',
      changes: [],
    }],
    total: 1, page: 1, page_size: 20,
  }

  it('shows the project manager the changes made to their project, without a project link', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(project(), { 'GET /projects/:id/history': history })
    page()
    await userEvent.click(await screen.findByRole('tab', { name: 'History' }))
    expect(await screen.findByText('Added milestone Design')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Website redesign' })).not.toBeInTheDocument()
  })

  it('gives an admin the tab too, and an employee or another manager none', async () => {
    signIn('admin')
    serve(project(), { 'GET /projects/:id/history': history })
    const first = page()
    expect(await screen.findByRole('tab', { name: 'History' })).toBeInTheDocument()
    first.unmount()
    localStorage.clear()

    signIn('manager', { id: 'someone-else' })
    const second = page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument()
    second.unmount()
    localStorage.clear()

    signIn('employee')
    serve(employeeProject())
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument()
  })
})

describe('Project detail: dependencies', () => {
  const waiting = {
    blocked_by: [{ id: 'd1', kind: 'project', item_id: 'p0', name: 'Phase one', project_id: 'p0', project_name: 'Phase one', status: 'active', is_done: false, schedule_conflict: false, visible: true }],
    blocks: [], is_blocked: true,
  }

  it('has no separate Dependencies tab: it is a dialog', async () => {
    signIn('manager', { id: 'manager-1' })
    serve()
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.queryByRole('tab', { name: 'Dependencies' })).not.toBeInTheDocument()
  })

  it('shows a Waiting for N chip that opens the dependencies, with Add for the manager', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(project({ blocked_by_count: 1 }), { 'GET /projects/:id/dependencies': waiting })
    page()
    await userEvent.click(await screen.findByText('Waiting for 1'))
    const dialog = await screen.findByRole('dialog', { name: 'Project dependencies' })
    expect(await within(dialog).findByText('Phase one')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add dependency' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('has no Waiting chip on a project that waits for nothing', async () => {
    signIn('manager', { id: 'manager-1' })
    serve()
    page()
    await screen.findByRole('heading', { name: 'Website redesign' })
    expect(screen.queryByText(/^Waiting for/)).not.toBeInTheDocument()
  })

  it('opens the dependencies from the actions menu too', async () => {
    signIn('manager', { id: 'manager-1' })
    serve(project(), { 'GET /projects/:id/dependencies': waiting })
    page()
    await openActions()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Project dependencies' }))
    const dialog = await screen.findByRole('dialog', { name: 'Project dependencies' })
    expect(await within(dialog).findByText('Phase one')).toBeInTheDocument()
  })

  it('lets an employee read the dependencies but not change them', async () => {
    signIn('employee')
    serve(employeeProject({ blocked_by_count: 1 }), { 'GET /projects/:id/dependencies': waiting })
    page()
    await userEvent.click(await screen.findByText('Waiting for 1'))
    const dialog = await screen.findByRole('dialog', { name: 'Project dependencies' })
    expect(await within(dialog).findByText('Phase one')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument()
  })

  it('does not let another manager change a project they only look at', async () => {
    signIn('manager', { id: 'someone-else' })
    serve(project({ blocked_by_count: 1 }), { 'GET /projects/:id/dependencies': waiting })
    page()
    await userEvent.click(await screen.findByText('Waiting for 1'))
    const dialog = await screen.findByRole('dialog', { name: 'Project dependencies' })
    await within(dialog).findByText('Phase one')
    expect(within(dialog).queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument()
  })
})
