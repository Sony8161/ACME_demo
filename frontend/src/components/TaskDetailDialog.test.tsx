import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../api/types'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { TaskDetailDialog } from './TaskDetailDialog'

const task: Task = {
  id: 't1', milestoneId: 'm1', name: 'Wireframes', description: 'The first screens', done: false, status: 'in_progress', priority: 'high',
  dueDate: '2026-11-02', assigneeId: 'u1', doneAt: null, projectId: 'p1', projectName: 'Website', milestoneName: 'Design', assigneeName: 'Alex Kim',
  isOverdue: false, commentCount: 2,
}
const URL = '/projects/p1/milestones/m1/deliverables/t1/comments'
const comment = (id: string, over: Record<string, unknown> = {}) => ({
  id, author_id: 'u2', author_name: 'Maria Lopez', body: 'Waiting on the logo', created_at: '2026-10-14T09:30:00Z', can_remove: false, ...over,
})
const list = (...items: unknown[]) => ({ items, total: items.length })

function open(over: { task?: Task | null; onClose?: () => void; onChanged?: () => void } = {}) {
  const onClose = over.onClose ?? vi.fn()
  const onChanged = over.onChanged ?? vi.fn()
  render(<TaskDetailDialog task={over.task === undefined ? task : over.task} onClose={onClose} onChanged={onChanged} />)
  return { onClose, onChanged }
}

afterEach(restoreApi)

describe('TaskDetailDialog', () => {
  it('shows nothing without a task', () => {
    mockRoutes({})
    open({ task: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the task and its comments, oldest first, with who wrote them', async () => {
    mockRoutes({ [`GET ${URL}`]: list(comment('c1'), comment('c2', { author_name: 'Alex Kim', body: 'Logo arrived', can_remove: true })) })
    open()
    const dialog = await screen.findByRole('dialog', { name: 'Wireframes' })
    expect(dialog).toHaveTextContent('The first screens')
    expect(dialog).toHaveTextContent('In progress')
    expect(dialog).toHaveTextContent('High')
    expect(dialog).toHaveTextContent('Alex Kim')
    const thread = await within(dialog).findByRole('list', { name: 'Comments' })
    expect(within(thread).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Maria Lopez'), expect.stringContaining('Alex Kim'),
    ])
    expect(thread).toHaveTextContent('Waiting on the logo')
    expect(thread).toHaveTextContent('Logo arrived')
  })

  it('says so when nobody has written yet', async () => {
    mockRoutes({ [`GET ${URL}`]: list() })
    open({ task: { ...task, commentCount: 0, description: '' } })
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument()
    expect(screen.getByText('No description.')).toBeInTheDocument()
  })

  it('posts a comment, clears the box, shows it in the thread and tells the page', async () => {
    const mine = comment('c9', { author_name: 'Alex Kim', body: 'Starting now', can_remove: true })
    let posted = false
    const bodies: unknown[] = []
    mockRoutes({
      [`GET ${URL}`]: () => (posted ? list(mine) : list()),
      [`POST ${URL}`]: (c: { data?: string }) => { posted = true; bodies.push(JSON.parse(c.data ?? '{}')); return mine },
    })
    const { onChanged } = open()
    const box = await screen.findByRole('textbox', { name: 'Add a comment' })
    await userEvent.type(box, 'Starting now')
    await userEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Starting now')).toBeInTheDocument()
    expect(bodies).toEqual([{ body: 'Starting now' }])
    expect(box).toHaveValue('')
    expect(onChanged).toHaveBeenCalled()
  })

  it('will not post a blank comment, and limits the text to 2000 characters with a counter', async () => {
    mockRoutes({ [`GET ${URL}`]: list() })
    open()
    const box = await screen.findByRole('textbox', { name: 'Add a comment' })
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
    await userEvent.type(box, '   ')
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
    expect(box).toHaveAttribute('maxlength', '2000')
    await userEvent.type(box, 'abc')
    expect(screen.getByText('6 of 2000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled()
  })

  it('shows the server sentence and keeps what was typed when posting fails', async () => {
    mockRoutes({ [`GET ${URL}`]: list(), [`POST ${URL}`]: apiError(404, 'not_found', 'Task not found') })
    open()
    const box = await screen.findByRole('textbox', { name: 'Add a comment' })
    await userEvent.type(box, 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Task not found')).toBeInTheDocument()
    expect(box).toHaveValue('Hello')
  })

  it('offers Remove only where the server says it is allowed, and removes through the archive endpoint', async () => {
    let removed = false
    const calls = mockRoutes({
      [`GET ${URL}`]: () => (removed ? list(comment('c1')) : list(comment('c1'), comment('c2', { body: 'Mine', can_remove: true }))),
      [`POST ${URL}/c2/archive`]: () => { removed = true; return comment('c2') },
    })
    const { onChanged } = open()
    await screen.findByText('Mine')
    expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove comment by Maria Lopez' }))
    await waitFor(() => expect(screen.queryByText('Mine')).not.toBeInTheDocument())
    expect(calls).toContain(`POST ${URL}/c2/archive`)
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows markup exactly as typed instead of running it', async () => {
    mockRoutes({ [`GET ${URL}`]: list(comment('c1', { body: '<img src=x onerror=alert(1)> <b>bold</b>' })) })
    open()
    expect(await screen.findByText('<img src=x onerror=alert(1)> <b>bold</b>')).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('shows a load error with a way to try again, and closes from its button', async () => {
    let fail = true
    mockRoutes({ [`GET ${URL}`]: () => (fail ? apiError(500, 'server_error', 'The database is waking up') : list(comment('c1'))) })
    const { onClose } = open()
    expect(await screen.findByText('The database is waking up')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Waiting on the logo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
