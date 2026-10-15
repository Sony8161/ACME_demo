import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { http } from '../api/client'
import type { Task } from '../api/types'
import { downloadCsv } from '../export/csv'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { TaskTable } from './TaskTable'

vi.mock('../export/csv', () => ({ downloadCsv: vi.fn() }))

let counter = 0
const task = (over: Partial<Task> = {}): Task => {
  counter += 1
  return {
    id: `t${counter}`, milestoneId: 'm1', name: `Task ${counter}`, description: '', done: false, status: 'todo', priority: 'medium',
    dueDate: null, assigneeId: null, doneAt: null, projectId: 'p1', projectName: 'Website', milestoneName: 'Build',
    assigneeName: null, isOverdue: false, commentCount: 0, ...over,
  }
}
const who = { canManage: true, userId: 'u1' }
const show = (tasks: Task[]) => render(<TaskTable tasks={tasks} who={who} onMove={() => {}} />)
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getByText(/^(Task|Fix|Write|Ship|Plan|Test)/, { selector: 'p' }).textContent)

describe('TaskTable', () => {
  beforeEach(() => { counter = 0 })

  it('keeps the order the server sent until a header is pressed', () => {
    show([task({ name: 'Ship it' }), task({ name: 'Fix bug' }), task({ name: 'Write docs' })])
    expect(names()).toEqual(['Ship it', 'Fix bug', 'Write docs'])
    for (const h of screen.getAllByRole('columnheader')) expect(h).not.toHaveAttribute('aria-sort')
  })

  it('sorts by task name, naturally (Task 2 before Task 10), both ways', async () => {
    show([task({ name: 'Task 10' }), task({ name: 'Task 2' }), task({ name: 'Task 1' })])
    await userEvent.click(screen.getByRole('button', { name: 'Task' }))
    expect(names()).toEqual(['Task 1', 'Task 2', 'Task 10'])
    await userEvent.click(screen.getByRole('button', { name: 'Task' }))
    expect(names()).toEqual(['Task 10', 'Task 2', 'Task 1'])
  })

  it('sorts by status as to do, in progress, done', async () => {
    show([task({ name: 'Task done', status: 'done' }), task({ name: 'Task todo', status: 'todo' }), task({ name: 'Task doing', status: 'in_progress' })])
    await userEvent.click(screen.getByRole('button', { name: 'Status' }))
    expect(names()).toEqual(['Task todo', 'Task doing', 'Task done'])
  })

  it('sorts by priority with urgent first', async () => {
    show([task({ name: 'Task low', priority: 'low' }), task({ name: 'Task urgent', priority: 'urgent' }), task({ name: 'Task high', priority: 'high' }), task({ name: 'Task medium' })])
    await userEvent.click(screen.getByRole('button', { name: 'Priority' }))
    expect(names()).toEqual(['Task urgent', 'Task high', 'Task medium', 'Task low'])
  })

  it('sorts by owner with the unassigned last, whichever way', async () => {
    show([task({ name: 'Task nobody' }), task({ name: 'Task zed', assigneeName: 'Zed Z', assigneeId: 'z' }), task({ name: 'Task amy', assigneeName: 'Amy A', assigneeId: 'a' })])
    await userEvent.click(screen.getByRole('button', { name: 'Owner' }))
    expect(names()).toEqual(['Task amy', 'Task zed', 'Task nobody'])
    await userEvent.click(screen.getByRole('button', { name: 'Owner' }))
    expect(names()).toEqual(['Task zed', 'Task amy', 'Task nobody'])
  })

  it('sorts by due date, late ones first, and the undated last', async () => {
    show([task({ name: 'Task later', dueDate: '2026-12-01' }), task({ name: 'Task none' }), task({ name: 'Task late', dueDate: '2026-09-01', isOverdue: true })])
    await userEvent.click(screen.getByRole('button', { name: 'Due' }))
    expect(names()).toEqual(['Task late', 'Task later', 'Task none'])
    expect(screen.getByRole('columnheader', { name: 'Due' })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('ticks a task, the whole page, and clears', async () => {
    show([task({ name: 'Task one' }), task({ name: 'Task two' })])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task one' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all 2 on this page' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('shows 25 a page', async () => {
    show(Array.from({ length: 30 }, (_, i) => task({ name: `Task ${String(i + 1).padStart(2, '0')}` })))
    expect(names()).toHaveLength(25)
    expect(screen.getByText('Page 1 of 2 · 30 entries')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(names()).toHaveLength(5)
  })

  it('goes back to page 1 when the filters change (filterKey), even if the next page still exists', async () => {
    const many = Array.from({ length: 30 }, (_, i) => task({ name: `Task ${String(i + 1).padStart(2, '0')}` }))
    const { rerender } = render(<TaskTable tasks={many} who={who} onMove={() => {}} filterKey="all" />)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 2 · 30 entries')).toBeInTheDocument()
    rerender(<TaskTable tasks={many.slice(0, 28)} who={who} onMove={() => {}} filterKey="owner-a" />)
    expect(screen.getByText('Page 1 of 2 · 28 entries')).toBeInTheDocument()
  })

  it('says so when no task matches, and still has its menu on each row', async () => {
    const { rerender } = show([task({ name: 'Task one' })])
    expect(screen.getByRole('button', { name: 'Task actions: Task one' })).toBeInTheDocument()
    rerender(<TaskTable tasks={[]} who={who} onMove={() => {}} />)
    expect(screen.getByText('No tasks match.')).toBeInTheDocument()
  })

  it('unticks a task that leaves the list when the filters change', async () => {
    const one = task({ name: 'Task one' })
    const two = task({ name: 'Task two' })
    const { rerender } = show([one, two])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task two' }))
    rerender(<TaskTable tasks={[one]} who={who} onMove={() => {}} />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })
})

describe('TaskTable export and bulk actions', () => {
  beforeEach(() => { counter = 0; vi.mocked(downloadCsv).mockClear() })
  afterEach(restoreApi)
  const three = () => [task({ name: 'Task one' }), task({ name: 'Task two', assigneeName: 'Alex Kim', assigneeId: 'u1' }), task({ name: 'Task three' })]
  const people = [{ id: 'u1', name: 'Alex Kim' }, { id: 'u2', name: 'Priya Shah' }]
  const manage = (tasks: Task[], onChanged = () => {}) => render(<TaskTable tasks={tasks} who={who} onMove={() => {}} people={people} onChanged={onChanged} />)

  it('exports all the tasks, or only the ticked ones, in the order shown', async () => {
    show(three())
    await userEvent.click(screen.getByRole('button', { name: 'Export all 3' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Export 3 tasks' })).getByRole('button', { name: 'Download CSV' }))
    expect(vi.mocked(downloadCsv).mock.calls[0][0]).toMatch(/^acme-tasks-/)
    expect(vi.mocked(downloadCsv).mock.calls[0][1].map((r) => r[0])).toEqual(['Task', 'Task one', 'Task two', 'Task three'])

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task three' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export 1 selected' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Export 1 task' })).getByRole('button', { name: 'Download CSV' }))
    expect(vi.mocked(downloadCsv).mock.calls[1][1].map((r) => r[0])).toEqual(['Task', 'Task three'])
  })

  it('moves the ticked tasks to a status through the normal endpoint, one each, and reports', async () => {
    const onChanged = vi.fn()
    const calls = mockRoutes({ 'PATCH /projects/p1/milestones/m1/deliverables/:id': { ok: true } })
    manage(three(), onChanged)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task one' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task two' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'In progress' }))
    const result = await screen.findByRole('dialog', { name: 'Move tasks' })
    expect(result).toHaveTextContent('Moved 2.')
    expect(calls).toEqual(['PATCH /projects/p1/milestones/m1/deliverables/t1', 'PATCH /projects/p1/milestones/m1/deliverables/t2'])
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows that a bulk change is running and refuses a second one until it ends', async () => {
    const calls = mockRoutes({ 'PATCH /projects/p1/milestones/m1/deliverables/:id': { ok: true } })
    const inner = http.defaults.adapter as (c: InternalAxiosRequestConfig) => Promise<unknown>
    let open!: () => void
    const gate = new Promise<void>((resolve) => { open = resolve })
    http.defaults.adapter = (async (c: InternalAxiosRequestConfig) => { await gate; return inner(c) }) as typeof http.defaults.adapter
    manage(three())
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task one' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'In progress' }))
    expect(await screen.findByText('Working…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move to' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Set owner' })).toBeDisabled()
    open()
    expect(await screen.findByRole('dialog', { name: 'Move tasks' })).toHaveTextContent('Moved 1.')
    expect(calls).toHaveLength(1)
    expect(screen.queryByText('Working…')).not.toBeInTheDocument()
  })

  it('sets the owner of the ticked tasks, or clears it, and lists the ones the server refused', async () => {
    const sent: unknown[] = []
    mockRoutes({
      'PATCH /projects/p1/milestones/m1/deliverables/:id': (config: { url?: string; data?: string }) => {
        sent.push(JSON.parse(config.data ?? '{}'))
        return config.url?.endsWith('/t2') ? apiError(409, 'not_on_milestone', 'Priya Shah is not on milestone Build') : { ok: true }
      },
    })
    manage(three())
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task one' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task two' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set owner' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Priya Shah' }))
    const result = await screen.findByRole('dialog', { name: 'Set owner' })
    expect(result).toHaveTextContent('Updated 1.')
    expect(result).toHaveTextContent('Task two')
    expect(result).toHaveTextContent('Priya Shah is not on milestone Build')
    expect(sent).toEqual([{ assignee_id: 'u2' }, { assignee_id: 'u2' }])
  })

  it('offers Unassigned as an owner', async () => {
    const sent: unknown[] = []
    mockRoutes({ 'PATCH /projects/p1/milestones/m1/deliverables/:id': (config: { data?: string }) => { sent.push(JSON.parse(config.data ?? '{}')); return { ok: true } } })
    manage(three())
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task two' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set owner' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unassigned' }))
    await screen.findByRole('dialog', { name: 'Set owner' })
    expect(sent).toEqual([{ assignee_id: null }])
  })

  it('shows no bulk buttons to someone who may not manage the tasks', async () => {
    render(<TaskTable tasks={three()} who={{ canManage: false, userId: 'u1' }} onMove={() => {}} people={people} onChanged={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Task one' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set owner' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export 1 selected' })).toBeInTheDocument() // exporting is still fine
  })
})

describe('TaskTable comments', () => {
  beforeEach(() => { counter = 0 })

  it('shows how many comments a task has, and nothing when there are none', () => {
    show([task({ name: 'Task one', commentCount: 3 }), task({ name: 'Task two', commentCount: 1 }), task({ name: 'Task three' })])
    expect(screen.getByText(/3 comments/)).toBeInTheDocument()
    expect(screen.getByText(/1 comment(?!s)/)).toBeInTheDocument()
    expect(screen.queryByText(/0 comments/)).not.toBeInTheDocument()
  })

  it('opens the task when its name is pressed', async () => {
    const onOpen = vi.fn()
    const one = task({ name: 'Task one' })
    render(<TaskTable tasks={[one]} who={who} onMove={() => {}} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Task one' }))
    expect(onOpen).toHaveBeenCalledWith(one)
  })
})
