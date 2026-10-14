import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { DependencyPanel } from './DependencyPanel'
import { ToastProvider } from './ToastProvider'

vi.setConfig({ testTimeout: 30_000 })

const PATH = '/projects/p1/milestones/m2/dependencies'
const ref = (over: Record<string, unknown> = {}) => ({
  id: 'd1', kind: 'milestone', item_id: 'm1', name: 'Build', project_id: 'p1', project_name: 'Apollo', status: 'in_progress', is_done: false,
  schedule_conflict: false, visible: true, ...over,
})
const none = { blocked_by: [], blocks: [], is_blocked: false }
const timeline = {
  as_of: '2026-10-14',
  projects: [
    { id: 'p1', name: 'Apollo', manager_name: 'Maria', status: 'active', start_date: '2026-08-01', end_date: '2026-12-31', risk_level: 'on_track', blocked_by_count: 0, milestones: [
      { id: 'm1', name: 'Build', start_date: '2026-09-01', due_date: '2026-10-01', status: 'in_progress', is_overdue: false, tasks_total: 0, tasks_done: 0, blocked_by_count: 0 },
      { id: 'm2', name: 'Launch', start_date: '2026-10-02', due_date: '2026-11-01', status: 'pending', is_overdue: false, tasks_total: 0, tasks_done: 0, blocked_by_count: 1 },
    ] },
    { id: 'p2', name: 'Zeus', manager_name: 'Maria', status: 'active', start_date: '2026-08-01', end_date: '2026-12-31', risk_level: 'on_track', blocked_by_count: 0, milestones: [
      { id: 'm9', name: 'Plan', start_date: '2026-09-01', due_date: '2026-10-01', status: 'pending', is_overdue: false, tasks_total: 0, tasks_done: 0, blocked_by_count: 0 },
    ] },
  ],
}
const show = (props: Partial<Parameters<typeof DependencyPanel>[0]> = {}) => {
  const onChanged = vi.fn()
  render(<ToastProvider><DependencyPanel path={PATH} kind="milestone" selfId="m2" canManage onChanged={onChanged} {...props} /></ToastProvider>)
  return onChanged
}

afterEach(() => restoreApi())

describe('DependencyPanel', () => {
  it('shows what it waits for and what waits for it, each with its state', async () => {
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref(), ref({ id: 'd2', item_id: 'm3', name: 'Design', status: 'completed', is_done: true, schedule_conflict: true })], blocks: [ref({ id: 'd3', name: 'Review', status: 'pending' })], is_blocked: true } })
    show()
    const waits = await screen.findByRole('list', { name: 'Waits for' })
    expect(within(waits).getByText('Build')).toBeInTheDocument()
    expect(within(waits).getByText('Waiting: In progress')).toBeInTheDocument()
    expect(within(waits).getByText('Done')).toBeInTheDocument()
    expect(within(waits).getByText('Planned to start before this is due')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Waited on by' })).getByText('Review')).toBeInTheDocument()
    expect(screen.getByText(/cannot be started or completed until what it waits for is done/)).toBeInTheDocument()
  })

  it('says so when there is nothing, shows no groups and no warning', async () => {
    mockRoutes({ 'GET /projects/p1/dependencies': none })
    show({ kind: 'project', path: '/projects/p1/dependencies', selfId: 'p1' })
    expect(await screen.findByText('No dependencies yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dependencies' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Waits for' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Waited on by' })).not.toBeInTheDocument()
    expect(screen.queryByText(/until what it waits for/)).not.toBeInTheDocument()
  })

  it('shows only the group that has something in it', async () => {
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [], blocks: [ref({ id: 'd3', name: 'Review', status: 'pending' })], is_blocked: false } })
    show()
    expect(await screen.findByRole('list', { name: 'Waited on by' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Waits for' })).not.toBeInTheDocument()
    expect(screen.queryByText('No dependencies yet.')).not.toBeInTheDocument()
    // what waits for this item cannot be removed from here
    expect(screen.queryByRole('button', { name: /Remove dependency/ })).not.toBeInTheDocument()
  })

  it('hides what the person may not see, and marks a cancelled milestone', async () => {
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref({ id: 'd1', item_id: null, name: "Another project's milestone", project_name: null, visible: false }), ref({ id: 'd2', name: 'Old', status: 'cancelled' })], blocks: [], is_blocked: false } })
    show()
    expect(await screen.findByText('Not visible to you')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('lets a manager remove a link, tells the page, and says so in a toast', async () => {
    const sent: string[] = []
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref()], blocks: [], is_blocked: true }, [`POST ${PATH}/:id/archive`]: (c: InternalAxiosRequestConfig) => { sent.push(c.url ?? ''); return ref() } })
    const onChanged = show()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove dependency: Build' }))
    expect(await screen.findByText('Removed the dependency on Build')).toBeInTheDocument()
    expect(sent).toEqual([`${PATH}/d1/archive`])
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('puts a removed milestone link back with Undo, by posting it again', async () => {
    const posts: unknown[] = []
    let removed = false
    mockRoutes({
      [`GET ${PATH}`]: () => (removed ? none : { blocked_by: [ref()], blocks: [], is_blocked: true }),
      [`POST ${PATH}/:id/archive`]: () => { removed = true; return ref() },
      [`POST ${PATH}`]: (c: InternalAxiosRequestConfig) => { posts.push(JSON.parse(c.data as string)); removed = false; return ref() },
    })
    const onChanged = show()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove dependency: Build' }))
    expect(await screen.findByText('No dependencies yet.')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(posts).toEqual([{ depends_on_milestone_id: 'm1' }]))
    expect(await screen.findByRole('list', { name: 'Waits for' })).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument())
  })

  it('undoes a project link with the project key', async () => {
    const posts: unknown[] = []
    mockRoutes({
      'GET /projects/p1/dependencies': { blocked_by: [ref({ kind: 'project', item_id: 'p2', name: 'Zeus' })], blocks: [], is_blocked: true },
      'POST /projects/p1/dependencies/:id/archive': ref(),
      'POST /projects/p1/dependencies': (c: InternalAxiosRequestConfig) => { posts.push(JSON.parse(c.data as string)); return ref() },
    })
    show({ kind: 'project', path: '/projects/p1/dependencies', selfId: 'p1' })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove dependency: Zeus' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(posts).toEqual([{ depends_on_project_id: 'p2' }]))
  })

  it('offers no Undo when the removed link has no item to put back', async () => {
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref({ item_id: null })], blocks: [], is_blocked: true }, [`POST ${PATH}/:id/archive`]: ref() })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove dependency: Build' }))
    expect(await screen.findByText('Removed the dependency on Build')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('shows the server\'s sentence when a removal fails', async () => {
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref()], blocks: [], is_blocked: true }, [`POST ${PATH}/:id/archive`]: apiError(404, 'not_found', 'Dependency not found') })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove dependency: Build' }))
    expect(await screen.findByText('Dependency not found')).toBeInTheDocument()
    expect(screen.queryByText(/^Removed the dependency/)).not.toBeInTheDocument()
  })

  it('offers add and remove only to someone who manages it', async () => {
    mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref()], blocks: [], is_blocked: true } })
    show({ canManage: false })
    await screen.findByText('Build')
    expect(screen.queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove dependency/ })).not.toBeInTheDocument()
  })

  it('adds a milestone dependency from the milestones of the projects you manage, leaving out itself and what is already linked', async () => {
    const sent: unknown[] = []
    mockRoutes({
      [`GET ${PATH}`]: { blocked_by: [ref()], blocks: [], is_blocked: true },
      'GET /reports/timeline': timeline,
      [`POST ${PATH}`]: (c: InternalAxiosRequestConfig) => { sent.push(JSON.parse(c.data as string)); return ref() },
    })
    const onChanged = show()
    await userEvent.click(await screen.findByRole('button', { name: 'Add dependency' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Waits for this milestone/ }))
    expect(screen.queryByRole('option', { name: 'Apollo · Launch' })).not.toBeInTheDocument() // itself
    expect(screen.queryByRole('option', { name: 'Apollo · Build' })).not.toBeInTheDocument() // already linked
    await userEvent.click(await screen.findByRole('option', { name: 'Zeus · Plan' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add dependency' }))
    await waitFor(() => expect(sent).toEqual([{ depends_on_milestone_id: 'm9' }]))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('adds a project dependency from the projects', async () => {
    const sent: unknown[] = []
    mockRoutes({
      'GET /projects/p1/dependencies': none, 'GET /reports/timeline': timeline,
      'POST /projects/p1/dependencies': (c: InternalAxiosRequestConfig) => { sent.push(JSON.parse(c.data as string)); return ref({ kind: 'project' }) },
    })
    show({ path: '/projects/p1/dependencies', kind: 'project', selfId: 'p1' })
    await userEvent.click(await screen.findByRole('button', { name: 'Add dependency' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Waits for this project/ }))
    expect(screen.queryByRole('option', { name: 'Apollo' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('option', { name: 'Zeus' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add dependency' }))
    await waitFor(() => expect(sent).toEqual([{ depends_on_project_id: 'p2' }]))
  })

  it('shows the server\'s sentence when a link is refused', async () => {
    mockRoutes({ [`GET ${PATH}`]: none, 'GET /reports/timeline': timeline, [`POST ${PATH}`]: apiError(409, 'dependency_loop', 'That would make a loop') })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Add dependency' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Waits for this milestone/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Apollo · Build' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add dependency' }))
    expect(await within(dialog).findByText('That would make a loop')).toBeInTheDocument()
  })

  it('says so when there is nothing left to choose', async () => {
    mockRoutes({ [`GET ${PATH}`]: none, 'GET /reports/timeline': { as_of: '2026-10-14', projects: [] } })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Add dependency' }))
    expect(await screen.findByText('There is nothing else to choose.')).toBeInTheDocument()
  })

  it('shows the error when the list cannot be loaded', async () => {
    mockRoutes({ [`GET ${PATH}`]: apiError(500, 'server_error', 'Dependencies are unavailable') })
    show()
    expect(await screen.findByText('Dependencies are unavailable')).toBeInTheDocument()
  })

  describe('when the page holds the add state (controlled)', () => {
    it('draws no heading, no button and no empty message of its own', async () => {
      const calls = mockRoutes({ [`GET ${PATH}`]: none })
      show({ adding: false, onAddingChange: vi.fn() })
      await waitFor(() => expect(calls).toContain(`GET ${PATH}`))
      await new Promise((r) => setTimeout(r, 50))
      expect(screen.queryByRole('heading', { name: 'Dependencies' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument()
      expect(screen.queryByText('No dependencies yet.')).not.toBeInTheDocument()
    })

    it('still shows existing groups, and lets a manager remove one', async () => {
      mockRoutes({ [`GET ${PATH}`]: { blocked_by: [ref()], blocks: [], is_blocked: true }, [`POST ${PATH}/:id/archive`]: ref() })
      show({ adding: false, onAddingChange: vi.fn() })
      expect(await screen.findByRole('list', { name: 'Waits for' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Remove dependency: Build' }))
      expect(await screen.findByText('Removed the dependency on Build')).toBeInTheDocument()
    })

    it('shows the add dialog when told to, and asks the page to close it', async () => {
      mockRoutes({ [`GET ${PATH}`]: none, 'GET /reports/timeline': timeline })
      const onAddingChange = vi.fn()
      show({ adding: true, onAddingChange })
      const dialog = await screen.findByRole('dialog', { name: 'Add a milestone dependency' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(onAddingChange).toHaveBeenCalledWith(false)
    })
  })
})
