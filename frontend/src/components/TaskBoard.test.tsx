import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../api/types'
import { todayIso } from '../format'
import { TaskBoard } from './TaskBoard'

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', milestoneId: 'm1', name: 'Wireframes', description: '', done: false, status: 'todo', priority: 'medium', dueDate: null,
  assigneeId: null, doneAt: null, projectId: 'p1', projectName: 'Website', milestoneName: 'Design', assigneeName: null, isOverdue: false, commentCount: 0, ...over,
})
const tasks = [
  task(),
  task({ id: 't2', name: 'Spec', status: 'in_progress', priority: 'urgent', assigneeId: 'u1', assigneeName: 'Alex Kim', dueDate: todayIso(-2), isOverdue: true }),
  task({ id: 't3', name: 'Press kit', status: 'done', priority: 'low', dueDate: todayIso(-30) }),
]
const manager = { canManage: true, userId: 'm1' }

const column = (name: RegExp) => screen.getByRole('group', { name })

describe('TaskBoard', () => {
  it('puts each task in its column, with the number in each heading', () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['To do · 1', 'In progress · 1', 'Done · 1'])
    expect(within(column(/^To do, 1/)).getByText('Wireframes')).toBeInTheDocument()
    expect(within(column(/^In progress, 1/)).getByText('Spec')).toBeInTheDocument()
    expect(within(column(/^Done, 1/)).getByText('Press kit')).toBeInTheDocument()
  })

  it('shows only urgent and high priority, who owns it, and how near the due date is, in red when late', () => {
    const many = [
      ...tasks,
      task({ id: 't4', name: 'Soon', priority: 'high', dueDate: todayIso(1) }),
      task({ id: 't5', name: 'Far off', priority: 'medium', dueDate: todayIso(30) }),
    ]
    render(<TaskBoard tasks={many} who={manager} onMove={() => {}} />)
    const card = (name: string) => screen.getByText(name).closest('div[draggable]') as HTMLElement
    expect(within(card('Spec')).getByText('Urgent')).toBeInTheDocument()
    expect(within(card('Spec')).getByText('2 days late')).toBeInTheDocument()
    expect(within(card('Spec')).getByText('AK')).toBeInTheDocument()
    expect(within(card('Soon')).getByText('High')).toBeInTheDocument()
    expect(within(card('Soon')).getByText('due tomorrow')).toBeInTheDocument()
    expect(within(card('Wireframes')).getByText('Unassigned')).toBeInTheDocument()
    // medium and low are the norm, so they get no chip; a far-off date is spelled out
    expect(within(card('Wireframes')).queryByText('Medium')).not.toBeInTheDocument()
    expect(within(card('Press kit')).queryByText('Low')).not.toBeInTheDocument()
    expect(within(card('Far off')).getByText(/^Due [A-Z][a-z]{2} \d{1,2}, \d{4}$/)).toBeInTheDocument()
  })

  it('hides the due date once a task is done', () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} />)
    const card = screen.getByText('Press kit').closest('div[draggable]') as HTMLElement
    expect(within(card).queryByText(/late|Due|due/)).not.toBeInTheDocument()
  })

  it('shows an empty column as a zero count with no cards', () => {
    render(<TaskBoard tasks={[task()]} who={manager} onMove={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Done · 0' })).toBeInTheDocument()
    expect(within(column(/^Done, 0/)).queryByText('Wireframes')).not.toBeInTheDocument()
  })

  it('has no quick-add box unless the page asks for one', () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} />)
    expect(screen.queryByRole('textbox', { name: 'New task name' })).not.toBeInTheDocument()
  })

  it('adds a task from the box in the To do column, trimming the name and clearing the box', async () => {
    const added: string[] = []
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} onQuickAdd={async (name) => { added.push(name) }} />)
    const box = within(column(/^To do, 1/)).getByRole('textbox', { name: 'New task name' })
    expect(box).toHaveAttribute('placeholder', 'Add a task')
    expect(screen.getAllByRole('textbox')).toHaveLength(1) // only the To do column has one
    const add = within(column(/^To do, 1/)).getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    await userEvent.type(box, '  Style guide  ')
    expect(add).toBeEnabled()
    await userEvent.click(add)
    expect(added).toEqual(['Style guide'])
    await vi.waitFor(() => expect(box).toHaveValue(''))
    await userEvent.type(box, 'Another{Enter}') // Enter submits too
    expect(added).toEqual(['Style guide', 'Another'])
  })

  it('keeps what was typed when the save fails', async () => {
    render(<TaskBoard tasks={tasks} who={manager} onMove={() => {}} onQuickAdd={() => Promise.reject(new Error('no'))} />)
    const box = screen.getByRole('textbox', { name: 'New task name' })
    await userEvent.type(box, 'Style guide{Enter}')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled())
    expect(box).toHaveValue('Style guide')
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

describe('TaskBoard comments', () => {
  it('shows how many comments a card has, and no badge when there are none', () => {
    render(<TaskBoard tasks={[task({ id: 'a', name: 'With notes', commentCount: 2 }), task({ id: 'b', name: 'Without' })]} who={{ canManage: true, userId: 'u' }} onMove={() => {}} />)
    expect(screen.getByLabelText('2 comments')).toBeInTheDocument()
    expect(screen.queryByLabelText(/comment/)).toBe(screen.getByLabelText('2 comments'))
  })

  it('says "1 comment" for one', () => {
    render(<TaskBoard tasks={[task({ commentCount: 1 })]} who={{ canManage: true, userId: 'u' }} onMove={() => {}} />)
    expect(screen.getByLabelText('1 comment')).toBeInTheDocument()
  })

  it('opens a task when its name is pressed, for someone who cannot manage it too', async () => {
    const onOpen = vi.fn()
    const one = task({ name: 'Open me' })
    render(<TaskBoard tasks={[one]} who={{ canManage: false, userId: 'u' }} onMove={() => {}} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open me' }))
    expect(onOpen).toHaveBeenCalledWith(one)
  })
})
