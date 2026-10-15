import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiError, mockNoAnswer, mockRoutes, restoreApi } from '../test/mockApi'
import { project, renderPage, signIn } from '../test/pmFixtures'
import { DashboardPage } from './DashboardPage'

const work = (name: string, milestone: string) => ({
  project_id: 'p1', project_name: name, milestone_id: 'm1', milestone_name: milestone, start_date: '2026-10-01', end_date: '2026-10-30',
})

const overview = (overrides: Record<string, unknown> = {}) => ({
  as_of: '2026-10-13',
  counts: { projects: 2, planned: 0, active: 2, completed: 0, on_track: 0, at_risk: 1, overdue: 1 },
  totals: { budget: 150000, spent: 60000, labor_cost: 50000, other_cost: 10000, budget_remaining: 90000, forecast_cost: 120000, hours_allocated: 900, hours_worked: 300 },
  projects: [
    project({ id: 'p9', name: 'Mobile app' }, { risk_level: 'overdue', risk_reasons: ['2 milestones are past due'] }),
    project({ id: 'p1', name: 'Website redesign' }, { risk_level: 'at_risk', risk_reasons: ['Hours are running ahead'] }),
  ],
  allocation: [
    { user_id: 'u1', name: 'Ann Busy', job_title: 'Designer', manager_name: 'Mia', state: 'allocated', current_work: work('Website redesign', 'Wireframes'), next_work: null, hours_this_week: 32, week_capacity: 40 },
    { user_id: 'u2', name: 'Ben Free', job_title: 'Developer', manager_name: 'Mia', state: 'available', current_work: null, next_work: work('Mobile app', 'Build'), hours_this_week: 0, week_capacity: 40 },
    { user_id: 'u3', name: 'Cy Idle', job_title: 'Tester', manager_name: null, state: 'available', current_work: null, next_work: null, hours_this_week: 0, week_capacity: 40 },
  ],
  available_people: 2,
  ...overrides,
})

const empty = () => overview({
  counts: { projects: 0, planned: 0, active: 0, completed: 0, on_track: 0, at_risk: 0, overdue: 0 },
  projects: [], allocation: [], available_people: 0,
})

afterEach(() => {
  restoreApi()
  localStorage.clear()
})

const countsOf = (atRisk: number, overdue: number, projects = 4) => ({ projects, planned: 0, active: projects, completed: 0, on_track: projects - atRisk - overdue, at_risk: atRisk, overdue })
const person = (name: string, state: 'allocated' | 'available') => ({
  user_id: name, name, job_title: 'Dev', manager_name: null, state, current_work: null, next_work: null, hours_this_week: 0, week_capacity: 40,
})
const subtitle = () => screen.getByRole('heading', { name: 'Dashboard' }).parentElement as HTMLElement

describe('Dashboard', () => {
  it('shows a loading indicator, then the title with the date and what has been spent', async () => {
    signIn('manager')
    mockRoutes({ 'GET /reports/overview': overview() })
    renderPage(<DashboardPage />)
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(subtitle()).toHaveTextContent('Oct 13, 2026 · $60,000 spent of $150,000')
  })

  it('has no KPI tiles and no availability table any more', async () => {
    signIn('admin')
    mockRoutes({ 'GET /reports/overview': overview() })
    renderPage(<DashboardPage />)
    await screen.findByRole('heading', { name: 'Dashboard' })
    for (const gone of ['Need attention', 'Active projects', 'Spent so far', 'People free', 'Who is busy and who is free']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('hides the money line when the budget is 0 (nothing to compare the spending with)', async () => {
    signIn('manager')
    mockRoutes({ 'GET /reports/overview': overview({ totals: { ...overview().totals, budget: 0, spent: 0 } }) })
    renderPage(<DashboardPage />)
    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(subtitle()).toHaveTextContent('Oct 13, 2026')
    expect(subtitle()).not.toHaveTextContent(/spent|\$/)
  })

  describe('verdict', () => {
    const verdictFor = async (counts: ReturnType<typeof countsOf>) => {
      signIn('manager')
      mockRoutes({ 'GET /reports/overview': overview({ counts }) })
      renderPage(<DashboardPage />)
      await screen.findByRole('heading', { name: 'Dashboard' })
    }

    it('counts the projects that are at risk or overdue, out of all of them', async () => {
      await verdictFor(countsOf(1, 1))
      expect(screen.getByRole('heading', { name: '2 of 4 projects need attention' })).toBeInTheDocument()
    })

    it('counts only overdue projects too', async () => {
      await verdictFor(countsOf(0, 3))
      expect(screen.getByRole('heading', { name: '3 of 4 projects need attention' })).toBeInTheDocument()
    })

    it('uses the singular verb for one project', async () => {
      await verdictFor(countsOf(1, 0, 1))
      expect(screen.getByRole('heading', { name: '1 of 1 project needs attention' })).toBeInTheDocument()
    })

    it('says everything is on track when nothing is at risk or overdue', async () => {
      await verdictFor(countsOf(0, 0))
      expect(screen.getByRole('heading', { name: 'Everything is on track' })).toBeInTheDocument()
      expect(screen.queryByText(/need attention/)).not.toBeInTheDocument()
    })

    it('gives no verdict when there are no projects (the empty state speaks instead)', async () => {
      signIn('manager')
      mockRoutes({ 'GET /reports/overview': empty() })
      renderPage(<DashboardPage />)
      await screen.findByText('No projects are assigned to you yet.')
      expect(screen.queryByText('Everything is on track')).not.toBeInTheDocument()
    })
  })

  it('lists the projects as compact rows in the order the server sends them (most urgent first)', async () => {
    signIn('manager')
    mockRoutes({ 'GET /reports/overview': overview() })
    renderPage(<DashboardPage />)
    await screen.findByRole('heading', { name: 'Dashboard' })
    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/projects/'))
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Mobile app', '/projects/p9'], ['Website redesign', '/projects/p1']])
    const row = links[0].closest('.MuiPaper-root') as HTMLElement
    expect(row).toHaveTextContent('Overdue')
    expect(row).toHaveTextContent('2 milestones are past due')
  })

  describe('free today', () => {
    const lineAfterLoading = async () => {
      await screen.findByRole('heading', { name: 'Dashboard' })
      return screen.getByRole('link', { name: 'See availability' }).parentElement as HTMLElement
    }

    it('names who is free and links to the availability view of People', async () => {
      signIn('admin')
      mockRoutes({ 'GET /reports/overview': overview() })
      renderPage(<DashboardPage />)
      const line = await lineAfterLoading()
      expect(line).toHaveTextContent('Free today: Ben Free, Cy Idle. See availability')
      expect(screen.getByRole('link', { name: 'See availability' })).toHaveAttribute('href', '/people?view=availability')
      expect(line).not.toHaveTextContent('Ann Busy')
    })

    it('names three people at most and counts the rest', async () => {
      signIn('manager')
      const allocation = ['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six'].map((n) => person(n, 'available'))
      mockRoutes({ 'GET /reports/overview': overview({ allocation: [person('Busy Bee', 'allocated'), ...allocation] }) })
      renderPage(<DashboardPage />)
      const line = await lineAfterLoading()
      expect(line).toHaveTextContent('Free today: A One, B Two, C Three and 3 more. See availability')
      expect(line).not.toHaveTextContent('D Four')
    })

    it('shows exactly three free people without a "more" part', async () => {
      signIn('manager')
      mockRoutes({ 'GET /reports/overview': overview({ allocation: ['A One', 'B Two', 'C Three'].map((n) => person(n, 'available')) }) })
      renderPage(<DashboardPage />)
      const line = await lineAfterLoading()
      expect(line).toHaveTextContent('Free today: A One, B Two, C Three. See availability')
      expect(line).not.toHaveTextContent('more')
    })

    it('says nobody is free when everyone is on a milestone, and still links on', async () => {
      signIn('manager')
      mockRoutes({ 'GET /reports/overview': overview({ allocation: [person('Ann Busy', 'allocated')] }) })
      renderPage(<DashboardPage />)
      const line = await lineAfterLoading()
      expect(line).toHaveTextContent('Nobody is free today. See availability')
      expect(line).not.toHaveTextContent('Free today:')
    })

    it('is left out when there are no employees at all', async () => {
      signIn('manager')
      mockRoutes({ 'GET /reports/overview': overview({ allocation: [] }) })
      renderPage(<DashboardPage />)
      await screen.findByRole('heading', { name: 'Dashboard' })
      expect(screen.queryByRole('link', { name: 'See availability' })).not.toBeInTheDocument()
      expect(screen.queryByText(/free today/i)).not.toBeInTheDocument()
    })
  })

  it('does not offer sample data when there are projects', async () => {
    signIn('admin')
    mockRoutes({ 'GET /reports/overview': overview() })
    renderPage(<DashboardPage />)
    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(screen.queryByRole('button', { name: 'Load sample data' })).not.toBeInTheDocument()
  })

  it('shows the error with a retry that loads the page', async () => {
    signIn('manager')
    let fail = true
    const calls = mockRoutes({
      'GET /reports/overview': () => (fail ? apiError(500, 'server_error', 'The database is waking up') : overview()),
    })
    renderPage(<DashboardPage />)
    expect(await screen.findByText('The database is waking up')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByText('The database is waking up')).not.toBeInTheDocument()
    expect(calls.filter((c) => c === 'GET /reports/overview')).toHaveLength(2) // asked again by Try again
  })

  it('tells the person when the server cannot be reached', async () => {
    signIn('manager')
    mockNoAnswer()
    renderPage(<DashboardPage />)
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument()
  })

  describe('with no projects', () => {
    it('tells an employee or manager that nothing is assigned, without a sample-data button', async () => {
      signIn('employee')
      mockRoutes({ 'GET /reports/overview': empty() })
      renderPage(<DashboardPage />)
      expect(await screen.findByText('No projects are assigned to you yet.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Load sample data' })).not.toBeInTheDocument()
    })

    it('lets an admin load sample data and shows the one-time passwords', async () => {
      signIn('admin')
      let seeded = false
      const calls = mockRoutes({
        'GET /reports/overview': () => (seeded ? overview() : empty()),
        'POST /admin/seed-demo': () => {
          seeded = true
          return {
            created: true, message: 'ok',
            accounts: [
              { name: 'Mia Manager', role: 'manager', username: 'mia01', temporary_password: 'Temp-Pass-1' },
              { name: 'Ben Free', role: 'employee', username: 'ben02', temporary_password: 'Temp-Pass-2' },
            ],
          }
        },
      })
      renderPage(<DashboardPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'Load sample data' }))

      const dialog = await screen.findByRole('dialog', { name: 'Sample accounts created' })
      expect(dialog).toHaveTextContent('Mia Manager · manager')
      expect(dialog).toHaveTextContent('username mia01 password Temp-Pass-1')
      expect(dialog).toHaveTextContent('username ben02 password Temp-Pass-2')
      // the dashboard behind it was reloaded and now shows the new projects
      expect(calls).toContain('POST /admin/seed-demo')
      expect(calls.filter((c) => c === 'GET /reports/overview')).toHaveLength(2)
      expect(await screen.findByRole('link', { name: 'Mobile app', hidden: true })).toBeInTheDocument()
      expect(screen.queryByText(/There are no projects yet/)).not.toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('button', { name: 'I have saved them' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('shows the "already exists" message and no credentials when sample data was loaded before', async () => {
      signIn('admin')
      mockRoutes({
        'GET /reports/overview': empty(),
        'POST /admin/seed-demo': { created: false, message: 'Sample data already exists', accounts: [] },
      })
      renderPage(<DashboardPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'Load sample data' }))
      expect(await screen.findByText('Sample data already exists')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows the server error when loading sample data fails', async () => {
      signIn('admin')
      mockRoutes({
        'GET /reports/overview': empty(),
        'POST /admin/seed-demo': apiError(403, 'forbidden', 'Only admins can do this'),
      })
      renderPage(<DashboardPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'Load sample data' }))
      expect(await screen.findByText('Only admins can do this')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Load sample data' })).toBeEnabled()
    })
  })
})

describe('DashboardPage changes card', () => {
  it('shows what changed since the last visit above the projects, for a manager', async () => {
    signIn('manager')
    mockRoutes({
      'GET /reports/overview': overview(),
      'GET /reports/changes': { since: '2026-10-08T09:00:00Z', total: 3, projects: 1, items: [{
        id: 1, occurred_at: '2026-10-14T09:30:00Z', actor_id: 'a', actor_name: 'Maria Lopez', entity: 'deliverable', entity_id: 'e', project_id: 'p1',
        project_name: 'Mobile app', label: 'x', action: 'update', summary: 'Moved a task', changes: [],
      }] },
    })
    renderPage(<DashboardPage />)
    expect(await screen.findByRole('region', { name: 'Since you last visited' })).toHaveTextContent('3 changes in 1 project')
  })
})
