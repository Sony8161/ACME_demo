import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { employeeProject, project, renderPage, signIn } from '../test/pmFixtures'
import { downloadCsv } from '../export/csv'
import { ProjectsPage } from './ProjectsPage'

vi.mock('../export/csv', () => ({ downloadCsv: vi.fn() }))

// MUI dialogs are slow to open in jsdom on a busy machine.
vi.setConfig({ testTimeout: 30_000 })

const list = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 100 })
const body = (c: InternalAxiosRequestConfig) => JSON.parse(c.data as string)

const managers = {
  items: [
    { id: 'mgr1', username: 'm1', name: 'Mia Manager', email: 'm@x.test', job_title: '', role: 'manager', manager_id: null, must_change_password: false, archived_at: null, salary: null },
    { id: 'mgr2', username: 'm2', name: 'Max Manager', email: 'x@x.test', job_title: '', role: 'manager', manager_id: null, must_change_password: false, archived_at: null, salary: null },
  ],
  total: 2,
}

afterEach(() => {
  restoreApi()
  localStorage.clear()
})

describe('Projects list', () => {
  it('shows a spinner, then one card per project', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list([project({ id: 'a', name: 'Alpha' }), project({ id: 'b', name: 'Beta' })]) })
    renderPage(<ProjectsPage />)
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', '/projects/a')
  })

  it.each([
    ['admin', 'Every project in the company'],
    ['manager', 'The projects you run'],
    ['employee', 'The projects you work on'],
  ] as const)('describes the list for a %s', async (role, subtitle) => {
    signIn(role)
    mockRoutes({ 'GET /projects': list([]) })
    renderPage(<ProjectsPage />)
    expect(await screen.findByText(subtitle)).toBeInTheDocument()
  })

  it('says there are no projects yet, with no filters to clear and no New project button for a manager', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list([]) })
    renderPage(<ProjectsPage />)
    expect(await screen.findByText('There are no projects yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
  })

  it('offers an admin a New project button in the empty state (next to the one in the header)', async () => {
    signIn('admin')
    mockRoutes({ 'GET /projects': list([]), 'GET /users': managers })
    renderPage(<ProjectsPage />)
    await screen.findByText('There are no projects yet.')
    const buttons = screen.getAllByRole('button', { name: 'New project' })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[1])
    expect(await screen.findByRole('dialog', { name: 'Create a project' })).toBeInTheDocument()
  })

  it('says no projects match when filters hide everything, and Clear filters resets search, status and health', async () => {
    signIn('manager')
    const params: Record<string, unknown>[] = []
    mockRoutes({
      'GET /projects': (c: InternalAxiosRequestConfig) => {
        params.push({ ...c.params })
        return list(c.params?.q || c.params?.status ? [] : [project({ name: 'Alpha' })])
      },
    })
    renderPage(<ProjectsPage />)
    await screen.findByText('Alpha')
    await userEvent.type(screen.getByLabelText('Search by project or manager'), 'zzz')
    expect(await screen.findByText('No projects match.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByLabelText('Search by project or manager')).toHaveValue('')
    expect(params.at(-1)).toEqual({ page_size: 100 })
  })

  it('filters by health on the page, most urgent kinds first in the list of choices', async () => {
    signIn('manager')
    const params: Record<string, unknown>[] = []
    mockRoutes({
      'GET /projects': (c: InternalAxiosRequestConfig) => {
        params.push({ ...c.params })
        return list([
          project({ id: 'a', name: 'Alpha' }, { risk_level: 'on_track' }),
          project({ id: 'b', name: 'Beta' }, { risk_level: 'overdue' }),
          project({ id: 'c', name: 'Gamma' }, { risk_level: 'at_risk' }),
        ])
      },
    })
    renderPage(<ProjectsPage />)
    await screen.findByText('Alpha')
    await userEvent.click(screen.getByRole('combobox', { name: 'Health' }))
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Any', 'Overdue', 'At risk', 'On track'])
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }))
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
    expect(params).toHaveLength(1) // health is filtered in the browser, not asked of the server

    await userEvent.click(screen.getByRole('combobox', { name: 'Health' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Any' }))
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  describe('List and Timeline views', () => {
    const timeline = { as_of: '2026-10-14', projects: [{ id: 'p1', name: 'Website', manager_name: 'Maria Lopez', status: 'active', start_date: '2026-08-15', end_date: '2026-12-31', risk_level: 'on_track', blocked_by_count: 0, milestones: [] }] }

    it.each(['admin', 'manager'] as const)('lets a %s switch to the timeline and back', async (role) => {
      signIn(role)
      const calls = mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]), 'GET /reports/timeline': timeline })
      renderPage(<ProjectsPage />)
      await screen.findByText('Alpha')
      expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
      expect(calls).not.toContain('GET /reports/timeline')

      await userEvent.click(screen.getByRole('button', { name: 'Timeline' }))
      expect(await screen.findByRole('list', { name: 'All projects' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/projects/p1')
      expect(screen.queryByLabelText('Search by project or manager')).not.toBeInTheDocument()
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'List' }))
      expect(await screen.findByText('Alpha')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'All projects' })).not.toBeInTheDocument()
    })

    it('opens on the timeline from a ?view=timeline link', async () => {
      signIn('manager')
      mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]), 'GET /reports/timeline': timeline })
      renderPage(<ProjectsPage />, '/projects?view=timeline', '/projects')
      expect(await screen.findByRole('list', { name: 'All projects' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('gives an employee no toggle, and ignores ?view=timeline', async () => {
      signIn('employee')
      const calls = mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]) })
      renderPage(<ProjectsPage />, '/projects?view=timeline', '/projects')
      expect(await screen.findByText('Alpha')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument()
      expect(calls).not.toContain('GET /reports/timeline')
    })
  })

  it('shows the error and retries', async () => {
    signIn('manager')
    let fail = true
    mockRoutes({ 'GET /projects': () => (fail ? apiError(500, 'server_error', 'Could not load projects') : list([project({ name: 'Alpha' })])) })
    renderPage(<ProjectsPage />)
    expect(await screen.findByText('Could not load projects')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
  })

  it('asks the server once after typing stops, with the trimmed search text', async () => {
    signIn('manager')
    const params: Record<string, unknown>[] = []
    mockRoutes({
      'GET /projects': (c: InternalAxiosRequestConfig) => {
        params.push({ ...c.params })
        return list(c.params?.q === 'web' ? [project({ name: 'Website redesign' })] : [project({ name: 'Alpha' }), project({ id: 'b', name: 'Website redesign' })])
      },
    })
    renderPage(<ProjectsPage />)
    await screen.findByText('Alpha')
    expect(params).toEqual([{ page_size: 100 }])

    await userEvent.type(screen.getByLabelText('Search by project or manager'), ' web ')
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
    expect(screen.getByText('Website redesign')).toBeInTheDocument()
    // one more request for the whole word, not one per letter
    expect(params).toEqual([{ page_size: 100 }, { q: 'web', page_size: 100 }])
  })

  it('filters by status', async () => {
    signIn('admin')
    const params: Record<string, unknown>[] = []
    mockRoutes({
      'GET /projects': (c: InternalAxiosRequestConfig) => {
        params.push({ ...c.params })
        return list(c.params?.status === 'completed' ? [project({ name: 'Old project', status: 'completed' })] : [project({ name: 'Alpha' })])
      },
    })
    renderPage(<ProjectsPage />)
    await screen.findByText('Alpha')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['All', 'Planned', 'Active', 'Completed'])
    await userEvent.click(screen.getByRole('option', { name: 'Completed' }))
    expect(await screen.findByText('Old project')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(params.at(-1)).toEqual({ status: 'completed', page_size: 100 })
  })

  describe('new project', () => {
    it('is offered to admins only', async () => {
      signIn('manager')
      mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]) })
      renderPage(<ProjectsPage />)
      await screen.findByText('Alpha')
      expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
    })

    it('needs a name and a manager before it can be submitted', async () => {
      signIn('admin')
      mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]), 'GET /users': managers })
      renderPage(<ProjectsPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'New project' }))
      const dialog = await screen.findByRole('dialog', { name: 'Create a project' })
      const submit = within(dialog).getByRole('button', { name: 'Create project' })
      expect(submit).toBeDisabled()

      await userEvent.type(within(dialog).getByLabelText(/Project name/), 'Brand refresh')
      expect(submit).toBeDisabled()
      await userEvent.click(within(dialog).getByRole('combobox', { name: /Manager/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Max Manager' }))
      expect(submit).toBeEnabled()
    })

    it('lists the managers, creates the project with snake_case fields and refreshes the list', async () => {
      signIn('admin')
      let created = false
      const sent: unknown[] = []
      const userParams: unknown[] = []
      const calls = mockRoutes({
        'GET /projects': () => list(created ? [project({ name: 'Alpha' }), project({ id: 'n', name: 'Brand refresh' })] : [project({ name: 'Alpha' })]),
        'GET /users': (c: InternalAxiosRequestConfig) => { userParams.push({ ...c.params }); return managers },
        'POST /projects': (c: InternalAxiosRequestConfig) => { sent.push(body(c)); created = true; return project({ name: 'Brand refresh' }) },
      })
      renderPage(<ProjectsPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'New project' }))
      const dialog = await screen.findByRole('dialog', { name: 'Create a project' })

      await userEvent.type(within(dialog).getByLabelText(/Project name/), 'Brand refresh')
      await userEvent.type(within(dialog).getByLabelText('Description'), 'Logo and site')
      await userEvent.click(within(dialog).getByRole('combobox', { name: /Manager/ }))
      expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Mia Manager', 'Max Manager'])
      await userEvent.click(screen.getByRole('option', { name: 'Mia Manager' }))
      await userEvent.clear(within(dialog).getByLabelText(/^Starts/))
      await userEvent.type(within(dialog).getByLabelText(/^Starts/), '2026-11-02')
      await userEvent.clear(within(dialog).getByLabelText(/^Predicted end/))
      await userEvent.type(within(dialog).getByLabelText(/^Predicted end/), '2027-02-26')
      await userEvent.type(within(dialog).getByLabelText('Total hours'), '250')
      await userEvent.type(within(dialog).getByLabelText(/Budget/), '40000')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

      expect(await screen.findByRole('link', { name: /Brand refresh/ })).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(userParams).toEqual([{ role: 'manager' }])
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({
        name: 'Brand refresh', description: 'Logo and site', manager_id: 'mgr1', start_date: '2026-11-02', end_date: '2027-02-26', allocated_hours: 250, budget_amount: 40000,
      })
      expect(calls.filter((c) => c === 'GET /projects').length).toBeGreaterThanOrEqual(2)
    })

    it('keeps the dialog open and shows the server reason when creating fails', async () => {
      signIn('admin')
      mockRoutes({
        'GET /projects': list([project({ name: 'Alpha' })]),
        'GET /users': managers,
        'POST /projects': apiError(422, 'validation_error', 'Request validation failed', [{ field: 'end_date', message: 'end date must be after the start date' }]),
      })
      renderPage(<ProjectsPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'New project' }))
      const dialog = await screen.findByRole('dialog', { name: 'Create a project' })
      await userEvent.type(within(dialog).getByLabelText(/Project name/), 'Brand refresh')
      await userEvent.click(within(dialog).getByRole('combobox', { name: /Manager/ }))
      await userEvent.click(await screen.findByRole('option', { name: 'Mia Manager' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

      expect(await within(dialog).findByText('Request validation failed: end date must be after the start date')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Create a project' })).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/Project name/)).toHaveValue('Brand refresh')
    })

    it('shows why the manager list is empty when it cannot be loaded, and Cancel closes the dialog', async () => {
      signIn('admin')
      mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]), 'GET /users': apiError(500, 'server_error', 'Managers unavailable') })
      renderPage(<ProjectsPage />)
      await userEvent.click(await screen.findByRole('button', { name: 'New project' }))
      const dialog = await screen.findByRole('dialog', { name: 'Create a project' })
      expect(await within(dialog).findByText('Managers unavailable')).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })
})

describe('Projects table view', () => {
  const rows = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('link')[0]?.textContent)
  const three = [
    project({ id: 'a', name: 'Alpha', end_date: '2026-12-31' }, { risk_level: 'on_track', milestones_done: 1, milestones_total: 4, milestones_pct: 25, budget_pct: 30 }),
    project({ id: 'b', name: 'Beta', end_date: '2026-10-01', manager: { id: 'm2', name: 'Max Manager' } }, { risk_level: 'overdue', milestones_done: 0, milestones_total: 2, milestones_pct: 0, budget_pct: 80 }),
    project({ id: 'c', name: 'Gamma', end_date: '2027-02-01' }, { risk_level: 'at_risk', milestones_done: 2, milestones_total: 3, milestones_pct: 66.7, budget_pct: 95 }),
  ]

  it.each(['admin', 'manager'] as const)('lets a %s switch to a table of the same projects and back', async (role) => {
    signIn(role)
    mockRoutes({ 'GET /projects': list(three) })
    renderPage(<ProjectsPage />)
    await screen.findByText('Alpha')
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['', 'Project', 'Manager', 'Health', 'Milestones', 'Budget used', 'Ends'])
    const alpha = screen.getByRole('link', { name: 'Alpha' }).closest('tr')!
    expect(alpha).toHaveTextContent('Mia Manager')
    expect(alpha).toHaveTextContent('On track')
    expect(alpha).toHaveTextContent('1 of 4')
    expect(alpha).toHaveTextContent('30%')
    expect(alpha).toHaveTextContent('Dec 31, 2026')
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/projects/a')
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('opens on the table from a ?view=table link', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list(three) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts with the most urgent first and sorts by the header pressed', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list(three) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByRole('table')
    expect(rows()).toEqual(['Beta', 'Gamma', 'Alpha']) // overdue, at risk, on track
    await userEvent.click(screen.getByRole('button', { name: 'Ends' }))
    expect(rows()).toEqual(['Beta', 'Alpha', 'Gamma']) // Oct 1, Dec 31, Feb 1
    await userEvent.click(screen.getByRole('button', { name: 'Ends' }))
    expect(rows()).toEqual(['Gamma', 'Alpha', 'Beta'])
    await userEvent.click(screen.getByRole('button', { name: 'Budget used' }))
    expect(rows()).toEqual(['Alpha', 'Beta', 'Gamma']) // 30, 80, 95
    await userEvent.click(screen.getByRole('button', { name: 'Project' }))
    await userEvent.click(screen.getByRole('button', { name: 'Project' }))
    expect(rows()).toEqual(['Gamma', 'Beta', 'Alpha']) // by name, descending
    await userEvent.click(screen.getByRole('button', { name: 'Manager' }))
    expect(rows()).toEqual(['Beta', 'Alpha', 'Gamma']) // Max, then the two Mias in the order the server sent them
  })

  it('ticks rows and the whole page, and clears', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list(three) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all 3 on this page' }))
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('leaves out the budget column when the server sent no money', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list([employeeProject({ id: 'e', name: 'Epsilon' })]) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByRole('table')
    expect(screen.queryByRole('columnheader', { name: 'Budget used' })).not.toBeInTheDocument()
  })

  it('uses the same Health filter as the cards, and unticks what it hides', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list(three) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Health' }))
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }))
    expect(rows()).toEqual(['Beta'])
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('says nothing matches, with a way back, when the filters leave no project', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list([three[0]]) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('combobox', { name: 'Health' }))
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }))
    expect(screen.getByText('No projects match.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('shows 25 a page', async () => {
    signIn('manager')
    const many = Array.from({ length: 30 }, (_, i) => project({ id: `p${i}`, name: `Project ${String(i + 1).padStart(2, '0')}` }))
    mockRoutes({ 'GET /projects': list(many) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByText('Page 1 of 2 · 30 entries')
    expect(rows()).toHaveLength(25)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(rows()).toHaveLength(5)
  })

  it('gives an employee no table, and ignores ?view=table', async () => {
    signIn('employee')
    mockRoutes({ 'GET /projects': list([project({ name: 'Alpha' })]) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('Projects table export', () => {
  beforeEach(() => vi.mocked(downloadCsv).mockClear())
  const two = [project({ id: 'a', name: 'Alpha' }, { risk_level: 'on_track' }), project({ id: 'b', name: 'Beta' }, { risk_level: 'overdue', risk_reasons: ['3 day(s) past the end date'] })]

  it('exports every project that matches, health in words and the first reason', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list(two) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await userEvent.click(await screen.findByRole('button', { name: 'Export all 2' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Export 2 projects' })).getByRole('button', { name: 'Download CSV' }))
    const [file, table] = vi.mocked(downloadCsv).mock.calls[0]
    expect(file).toMatch(/^acme-projects-/)
    expect(table[0]).toContain('Budget')
    const beta = table.find((r) => r[0] === 'Beta')!
    expect(beta[table[0].indexOf('Health')]).toBe('Overdue')
    expect(beta[table[0].indexOf('Why')]).toBe('3 day(s) past the end date')
  })

  it('exports only the ticked projects', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list(two) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export 1 selected' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Export 1 project' })).getByRole('button', { name: 'Download CSV' }))
    expect(vi.mocked(downloadCsv).mock.calls[0][1].map((r) => r[0])).toEqual(['Project', 'Alpha'])
  })

  it('leaves the money columns out when the server sent none', async () => {
    signIn('manager')
    mockRoutes({ 'GET /projects': list([employeeProject({ id: 'e', name: 'Epsilon' })]) })
    renderPage(<ProjectsPage />, '/projects?view=table', '/projects')
    await userEvent.click(await screen.findByRole('button', { name: 'Export all 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export 1 project' })
    for (const money of ['Budget', 'Spent', 'Budget used %']) expect(within(dialog).queryByRole('checkbox', { name: money })).not.toBeInTheDocument()
  })
})
