import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { renderPage, signIn } from '../test/pmFixtures'
import { ProjectTimeline } from './ProjectTimeline'

vi.setConfig({ testTimeout: 30_000 })

const milestone = (over: Record<string, unknown> = {}) => ({
  id: 'm1', name: 'Design', start_date: '2026-09-01', due_date: '2026-10-31', status: 'in_progress', is_overdue: false, tasks_total: 2, tasks_done: 1, ...over,
})
const timeline = (milestones: unknown[]) => ({
  as_of: '2026-10-14',
  projects: [{ id: 'p1', name: 'Website', manager_name: 'Maria', status: 'active', start_date: '2026-08-15', end_date: '2026-12-31', risk_level: 'at_risk', milestones }],
})
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', milestone_id: 'm1', name: 'Wireframes', description: '', done: false, status: 'todo', priority: 'medium', due_date: '2026-10-20',
  assignee_id: null, done_at: null, project_id: 'p1', project_name: 'Website', milestone_name: 'Design', assignee_name: null, is_overdue: false, ...over,
})
const page = () => renderPage(<ProjectTimeline projectId="p1" />, '/', '/')

beforeEach(() => signIn('manager'))
afterEach(() => { restoreApi(); localStorage.clear() })

describe('ProjectTimeline', () => {
  it('shows the project, its milestones, and each task with its due date', async () => {
    mockRoutes({
      'GET /reports/timeline': timeline([milestone(), milestone({ id: 'm2', name: 'Build', is_overdue: true, tasks_total: 0, tasks_done: 0 }), milestone({ id: 'm3', name: 'Plan', status: 'completed' })]),
      'GET /projects/:id/tasks': { items: [task(), task({ id: 't2', name: 'Spec', status: 'done', due_date: null }), task({ id: 't3', name: 'Late one', is_overdue: true })], total: 3 },
    })
    page()
    expect(await screen.findByText('Website')).toBeInTheDocument()
    expect(screen.getByText('Aug 15, 2026 to Dec 31, 2026')).toBeInTheDocument()
    expect(screen.getByText('Sep 1, 2026 to Oct 31, 2026 · late')).toBeInTheDocument()
    expect(screen.getByText('Sep 1, 2026 to Oct 31, 2026 · signed off')).toBeInTheDocument()
    expect(await screen.findByText('Wireframes')).toBeInTheDocument()
    expect(screen.getAllByText('due Oct 20, 2026 · To do')).toHaveLength(2)
    expect(screen.getByText('no due date · Done')).toBeInTheDocument()
    expect(screen.getByText('Task Late one, due Oct 20, 2026, To do')).toBeInTheDocument()
    expect(screen.getByText(/A diamond is a task/)).toBeInTheDocument()
  })

  it('hides the tasks when asked', async () => {
    mockRoutes({ 'GET /reports/timeline': timeline([milestone()]), 'GET /projects/:id/tasks': { items: [task()], total: 1 } })
    page()
    await screen.findByText('Wireframes')
    await userEvent.click(screen.getByRole('switch', { name: 'Show tasks' }))
    expect(screen.queryByText('Wireframes')).not.toBeInTheDocument()
    expect(screen.getByText('Design')).toBeInTheDocument()
    expect(screen.queryByText(/A diamond is a task/)).not.toBeInTheDocument()
  })

  it('shows nothing extra when the project is not on the timeline, and the server\'s sentence when it fails', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [] }, 'GET /projects/:id/tasks': { items: [], total: 0 } })
    const { unmount } = page()
    await screen.findByRole('progressbar', { name: 'Loading' }).catch(() => null)
    expect(screen.queryByRole('list', { name: 'Project timeline' })).not.toBeInTheDocument()
    unmount()
    restoreApi()
    mockRoutes({ 'GET /reports/timeline': apiError(500, 'server_error', 'Timeline is unavailable'), 'GET /projects/:id/tasks': { items: [], total: 0 } })
    page()
    expect(await screen.findByText('Timeline is unavailable')).toBeInTheDocument()
  })
})
