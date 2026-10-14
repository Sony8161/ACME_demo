import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../api/types'
import { TaskBoard } from './TaskBoard'

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', milestoneId: 'm1', name: 'Wireframes', description: '', done: false, status: 'todo', priority: 'medium', dueDate: null,
  assigneeId: null, doneAt: null, projectId: 'p1', projectName: 'Website', milestoneName: 'Design', assigneeName: null, isOverdue: false, ...over,
})
const tasks = [
  task(),
  task({ id: 't2', name: 'Spec', status: 'in_progress', priority: 'urgent', assigneeId: 'u1', assigneeName: 'Alex Kim', dueDate: '2026-09-12', isOverdue: true }),
  task({ id: 't3', name: 'Press kit', status: 'done', priority: 'low', dueDate: '2026-12-01' }),
]
const manager = { canManage: true, userId: 'm1' }

const column = (name: RegExp) => screen.getByRole('group', { name })

describe('TaskBoard', () => {
  it('puts each task in its column, with the number in each', () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} />)
    expect(within(column(/^To do, 1/)).getByText('Wireframes')).toBeInTheDocument()
    expect(within(column(/^In progress, 1/)).getByText('Spec')).toBeInTheDocument()
    expect(within(column(/^Done, 1/)).getByText('Press kit')).toBeInTheDocument()
  })

  it('shows priority, who owns it, and when it is due, in red when it is late', () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} />)
    const card = screen.getByText('Spec').closest('div[draggable]') as HTMLElement
    expect(within(card).getByText('Urgent')).toBeInTheDocument()
    expect(within(card).getByText('Overdue Sep 12, 2026')).toBeInTheDocument()
    expect(within(card).getByText('AK')).toBeInTheDocument()
    expect(within(screen.getByText('Wireframes').closest('div[draggable]') as HTMLElement).getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('Due Dec 1, 2026')).toBeInTheDocument()
  })

  it('says so when a column is empty', () => {
    render(<TaskBoard tasks={[task()]} who={manager} onMove={() => {}} />)
    expect(within(column(/^Done, 0/)).getByText('Nothing here.')).toBeInTheDocument()
  })

  it('moves a card when it is dropped on another column', () => {
    const moved: [string, string][] = []
    render(<TaskBoard tasks={tasks} who={manager} onMove={(t, to) => moved.push([t.id, to])} />)
    const dropOn = (name: RegExp, id: string) => {
      const event = createEvent.drop(column(name))
      Object.defineProperty(event, 'dataTransfer', { value: { getData: () => id } })
      fireEvent(column(name), event)
    }
    dropOn(/^Done, 1/, 't1')
    expect(moved).toEqual([['t1', 'done']])
    dropOn(/^To do, 1/, 't1') // dropping it where it already is does nothing
    dropOn(/^Done, 1/, 'nope') // an unknown card does nothing
    expect(moved).toHaveLength(1)
  })

  it('remembers the card being dragged and highlights the column it is over', () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} />)
    const data: Record<string, string> = {}
    const start = createEvent.dragStart(screen.getByText('Wireframes').closest('div[draggable]') as HTMLElement)
    Object.defineProperty(start, 'dataTransfer', { value: { setData: (k: string, v: string) => { data[k] = v }, effectAllowed: '' } })
    fireEvent(screen.getByText('Wireframes').closest('div[draggable]') as HTMLElement, start)
    expect(data['text/plain']).toBe('t1')
    fireEvent.dragOver(column(/^Done, 1/))
    fireEvent.dragLeave(column(/^Done, 1/))
  })

  it('offers every move in the menu, and edit to managers', async () => {
    const moved: string[] = []
    const edited: string[] = []
    render(<TaskBoard tasks={[task()]} who={manager} onMove={(_, to) => moved.push(to)} onEdit={(t) => edited.push(t.id)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Task actions: Wireframes' }))
    expect(screen.getByRole('menuitem', { name: 'Move to To do' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to In progress' }))
    expect(moved).toEqual(['in_progress'])
    await userEvent.click(screen.getByRole('button', { name: 'Task actions: Wireframes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit task' }))
    expect(edited).toEqual(['t1'])
  })

  it('lets an owner start their task but not finish it, and hides edit', async () => {
    const mine = task({ assigneeId: 'u1', assigneeName: 'Alex Kim' })
    render(<TaskBoard tasks={[mine, task({ id: 't9', name: 'Not mine' })]} who={{ canManage: false, userId: 'u1' }} onMove={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Wireframes').closest('div[draggable]')).toHaveAttribute('draggable', 'true')
    expect(screen.getByText('Not mine').closest('div[draggable]')).toHaveAttribute('draggable', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Task actions: Wireframes' }))
    expect(screen.getByRole('menuitem', { name: 'Move to In progress' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('menuitem', { name: 'Move to Done' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('menuitem', { name: 'Edit task' })).not.toBeInTheDocument()
  })
})
