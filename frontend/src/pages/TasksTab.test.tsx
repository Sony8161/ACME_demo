import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import type { Milestone } from '../api/types'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { milestone, signIn } from '../test/pmFixtures'
import { TasksTab } from './TasksTab'

vi.setConfig({ testTimeout: 30_000 })

const body = (c: InternalAxiosRequestConfig) => JSON.parse(c.data as string)
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', milestone_id: 'm1', name: 'Wireframes', description: '', done: false, status: 'todo', priority: 'medium', due_date: null,
  assignee_id: null, done_at: null, project_id: 'p1', project_name: 'Website', milestone_name: 'Design', assignee_name: null, is_overdue: false, ...over,
})
const list = (items: unknown[]) => ({ items, total: items.length })
const team = { items: [
  { assignment_id: 'a1', user_id: 'u1', name: 'Alex Kim', job_title: '', milestone_id: 'm1', milestone_name: 'Design', start_date: '2026-09-01', end_date: '2026-10-31', days_worked: 1, hours_worked: 8, labor_cost: null, expected_hours: 8, expected_cost: null, hourly_rate: null },
  { assignment_id: 'a2', user_id: 'u2', name: 'Priya Shah', job_title: '', milestone_id: 'm2', milestone_name: 'Build', start_date: '2026-09-01', end_date: '2026-10-31', days_worked: 1, hours_worked: 8, labor_cost: null, expected_hours: 8, expected_cost: null, hourly_rate: null },
], total: 2, hours_worked: 16, labor_cost: null, expected_hours: 16, expected_cost: null }
const milestones = [milestone(), milestone({ id: 'm2', name: 'Build' }), milestone({ id: 'm3', name: 'Old', archived_at: '2026-05-01T00:00:00Z' })] as unknown as Milestone[]
const camel = (m: unknown) => ({ id: (m as { id: string }).id, name: (m as { name: string }).name, archivedAt: (m as { archived_at: string | null }).archived_at }) as unknown as Milestone

function open(canManage: boolean, routes: Record<string, unknown> = {}, changed = () => {}) {
  mockRoutes({ 'GET /projects/:id/tasks': list([task(), task({ id: 't2', name: 'Spec', status: 'in_progress', assignee_id: 'u1', assignee_name: 'Alex Kim' })]), 'GET /projects/:id/team': team, ...routes })
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TasksTab projectId="p1" canManage={canManage} milestones={milestones.map(camel)} onChanged={changed} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => { restoreApi(); localStorage.clear() })

describe('TasksTab: a manager', () => {
  beforeEach(() => { signIn('manager', { id: 'manager-1' }) })

  it('shows the board first and the same tasks as a list on request', async () => {
    open(true)
    expect(await screen.findByRole('group', { name: /^To do, 1/ })).toBeInTheDocument()
    expect(screen.getByText(/Drag a card to move it/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    const table = screen.getByRole('table', { name: 'Tasks' })
    expect(within(table).getByText('Wireframes')).toBeInTheDocument()
    expect(within(table).getByText('In progress')).toBeInTheDocument()
    expect(within(table).getByText('Alex Kim')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Board' }))
    expect(screen.getByRole('group', { name: /^Done, 0/ })).toBeInTheDocument()
  })

  it('asks the server for one owner or one milestone at a time', async () => {
    const asked: Record<string, unknown>[] = []
    open(true, { 'GET /projects/:id/tasks': (c: InternalAxiosRequestConfig) => { asked.push({ ...c.params }); return list([task()]) } })
    await screen.findByText('Wireframes')
    await userEvent.click(screen.getByRole('combobox', { name: 'Owner' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Alex Kim' }))
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ assignee_id: 'u1' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Milestone' }))
    expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument() // finished milestones are not on the board
    await userEvent.click(await screen.findByRole('option', { name: 'Build' }))
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ assignee_id: 'u1', milestone_id: 'm2' }))
  })

  it('moves a task from its menu, reloads, and tells the page to refresh its checklists', async () => {
    const sent: unknown[] = []
    let changed = 0
    open(true, { 'PATCH /projects/:id/milestones/:id/deliverables/:id': (c: InternalAxiosRequestConfig) => { sent.push([c.url, body(c)]); return task() } }, () => { changed += 1 })
    await screen.findByText('Wireframes')
    await userEvent.click(screen.getByRole('button', { name: 'Task actions: Wireframes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to Done' }))
    await waitFor(() => expect(sent).toEqual([['/projects/p1/milestones/m1/deliverables/t1', { status: 'done' }]]))
    await waitFor(() => expect(changed).toBe(1))
  })

  it('shows the server\'s own sentence when a move is refused', async () => {
    open(true, { 'PATCH /projects/:id/milestones/:id/deliverables/:id': apiError(409, 'conflict', 'This milestone is archived') })
    await screen.findByText('Wireframes')
    await userEvent.click(screen.getByRole('button', { name: 'Task actions: Wireframes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to Done' }))
    expect(await screen.findByText('This milestone is archived')).toBeInTheDocument()
  })

  it('adds a task with an owner from that milestone, a priority and a due date', async () => {
    const sent: unknown[] = []
    open(true, { 'POST /projects/:id/milestones/:id/deliverables': (c: InternalAxiosRequestConfig) => { sent.push([c.url, body(c)]); return task() } })
    await screen.findByText('Wireframes')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Task/), 'Style guide')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Owner' }))
    expect(screen.queryByRole('option', { name: 'Priya Shah' })).not.toBeInTheDocument() // she is on Build, not Design
    await userEvent.click(await screen.findByRole('option', { name: 'Alex Kim' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Priority' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Urgent' }))
    await userEvent.type(within(dialog).getByLabelText('Due'), '2026-10-20')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }))
    await waitFor(() => expect(sent).toEqual([[
      '/projects/p1/milestones/m1/deliverables',
      { name: 'Style guide', priority: 'urgent', due_date: '2026-10-20', assignee_id: 'u1' },
    ]]))
  })

  it('edits a task from its menu and can clear the owner and the date', async () => {
    const sent: unknown[] = []
    open(true, {
      'GET /projects/:id/tasks': list([task({ id: 't2', name: 'Spec', assignee_id: 'u1', assignee_name: 'Alex Kim', due_date: '2026-10-01', priority: 'high' })]),
      'PATCH /projects/:id/milestones/:id/deliverables/:id': (c: InternalAxiosRequestConfig) => { sent.push([c.url, body(c)]); return task() },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Task actions: Spec' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit task' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/^Task/)).toHaveValue('Spec')
    expect(within(dialog).getByRole('combobox', { name: 'Milestone' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Owner' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Unassigned' }))
    await userEvent.clear(within(dialog).getByLabelText('Due'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }))
    await waitFor(() => expect(sent).toEqual([[
      '/projects/p1/milestones/m1/deliverables/t2', { name: 'Spec', priority: 'high', due_date: null, assignee_id: null },
    ]]))
  })

  it('cannot add a task until there is a milestone to put it on', async () => {
    mockRoutes({ 'GET /projects/:id/tasks': list([]), 'GET /projects/:id/team': team })
    render(<MemoryRouter><AuthProvider><TasksTab projectId="p1" canManage milestones={[]} onChanged={() => {}} /></AuthProvider></MemoryRouter>)
    await screen.findByText('Drag a card to move it, or use its menu.', { exact: false })
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
  })
})

describe('TasksTab: an employee', () => {
  it('can read the board but not add or edit, and is told what they may do', async () => {
    signIn('employee', { id: 'u1' })
    open(false)
    await screen.findByText('Wireframes')
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    expect(screen.getByText(/You can start or pause your own tasks/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Task actions: Spec' }))
    expect(screen.getByRole('menuitem', { name: 'Move to To do' })).not.toHaveAttribute('aria-disabled') // Spec is theirs
    expect(screen.getByRole('menuitem', { name: 'Move to Done' })).toHaveAttribute('aria-disabled', 'true')
  })
})
