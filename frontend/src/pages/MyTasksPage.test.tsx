import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { renderPage, signIn } from '../test/pmFixtures'
import { MyTasksPage } from './MyTasksPage'

vi.setConfig({ testTimeout: 30_000 })

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', milestone_id: 'm1', name: 'Wireframes', description: '', done: false, status: 'todo', priority: 'high', due_date: '2026-10-20',
  assignee_id: 'employee-1', done_at: null, project_id: 'p1', project_name: 'Website redesign', milestone_name: 'Design', assignee_name: 'Alex Kim', is_overdue: false, ...over,
})
const list = (items: unknown[]) => ({ items, total: items.length })
const page = () => renderPage(<MyTasksPage />, '/my-tasks', '/my-tasks')

beforeEach(() => signIn('employee'))
afterEach(() => { restoreApi(); localStorage.clear() })

describe('MyTasksPage', () => {
  it('lists what is assigned to me with its project, priority, due date and status', async () => {
    mockRoutes({ 'GET /tasks/mine': list([task(), task({ id: 't2', name: 'Spec', status: 'in_progress', due_date: '2026-09-01', is_overdue: true, priority: 'low' }), task({ id: 't3', name: 'Press kit', status: 'done', due_date: null })]) })
    page()
    const row = (await screen.findByText('Wireframes')).closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'Website redesign' })).toHaveAttribute('href', '/projects/p1')
    expect(within(row).getByText('High')).toBeInTheDocument()
    expect(within(row).getByText('Oct 20, 2026')).toBeInTheDocument()
    expect(within(screen.getByText('Spec').closest('tr') as HTMLElement).getByText('Overdue Sep 1, 2026')).toBeInTheDocument()
    expect(within(screen.getByText('Press kit').closest('tr') as HTMLElement).getByText('—')).toBeInTheDocument()
  })

  it('starts and pauses my own task, and leaves finished ones alone', async () => {
    const sent: unknown[] = []
    mockRoutes({
      'GET /tasks/mine': list([task(), task({ id: 't2', name: 'Spec', status: 'in_progress' }), task({ id: 't3', name: 'Press kit', status: 'done' })]),
      'PATCH /projects/:id/milestones/:id/deliverables/:id': (c: InternalAxiosRequestConfig) => { sent.push([c.url, JSON.parse(c.data as string)]); return task() },
    })
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'Start Wireframes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pause Spec' }))
    await waitFor(() => expect(sent).toEqual([
      ['/projects/p1/milestones/m1/deliverables/t1', { status: 'in_progress' }],
      ['/projects/p1/milestones/m1/deliverables/t2', { status: 'todo' }],
    ]))
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
  })

  it('shows the server\'s own sentence when a move fails', async () => {
    mockRoutes({ 'GET /tasks/mine': list([task()]), 'PATCH /projects/:id/milestones/:id/deliverables/:id': apiError(403, 'forbidden', 'A manager reviews and finishes tasks') })
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'Start Wireframes' }))
    expect(await screen.findByText('A manager reviews and finishes tasks')).toBeInTheDocument()
  })

  it('says so when nothing is assigned', async () => {
    mockRoutes({ 'GET /tasks/mine': list([]) })
    page()
    expect(await screen.findByText('Nothing is assigned to you.')).toBeInTheDocument()
  })
})
