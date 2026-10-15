import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../api/types'
import { TaskTable } from './TaskTable'

let counter = 0
const task = (over: Partial<Task> = {}): Task => {
  counter += 1
  return {
    id: `t${counter}`, milestoneId: 'm1', name: `Task ${counter}`, description: '', done: false, status: 'todo', priority: 'medium',
    dueDate: null, assigneeId: null, doneAt: null, projectId: 'p1', projectName: 'Website', milestoneName: 'Build',
    assigneeName: null, isOverdue: false, ...over,
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
