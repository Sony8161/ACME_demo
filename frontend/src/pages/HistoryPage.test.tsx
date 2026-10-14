import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { renderPage, signIn } from '../test/pmFixtures'
import { HistoryPage } from './HistoryPage'

vi.setConfig({ testTimeout: 30_000 })

const entry = (id: number, over: Record<string, unknown> = {}) => ({
  id, occurred_at: '2026-03-11T14:05:00Z', actor_id: 'u1', actor_name: 'Maria Lopez', entity: 'milestone', entity_id: 'm1',
  project_id: 'p1', project_name: 'Apollo', label: 'Build', action: 'update', summary: 'Edited milestone Build (due date)',
  changes: [{ field: 'due_date', label: 'Due date', before: '2026-03-27', after: '2026-04-03' }], ...over,
})
const list = (items: unknown[], total = items.length, page = 1) => ({ items, total, page, page_size: 25 })
const people = { items: [{ id: 'u1', name: 'Maria Lopez', role: 'manager' }, { id: 'u2', name: 'Alex Kim', role: 'employee' }], total: 2 }
const projects = { items: [{ id: 'p1', name: 'Apollo' }, { id: 'p2', name: 'Zeus' }], total: 2, page: 1, page_size: 100 }

function serve(audit: unknown) {
  const asked: Record<string, unknown>[] = []
  mockRoutes({
    'GET /audit': (c: InternalAxiosRequestConfig) => { asked.push(c.params as Record<string, unknown>); return typeof audit === 'function' ? audit(c) : audit },
    'GET /projects': projects,
    'GET /users': people,
  })
  return asked
}
const page = () => renderPage(<HistoryPage />, '/history', '/history')

beforeEach(() => signIn('admin'))
afterEach(() => { restoreApi(); localStorage.clear() })

describe('HistoryPage', () => {
  it('lists what happened, who did it and in which project', async () => {
    serve(list([entry(2), entry(1, { action: 'create', summary: 'Created project Apollo', entity: 'project', label: 'Apollo', actor_name: 'System Admin' })]))
    page()
    expect(await screen.findByText('Edited milestone Build (due date)')).toBeInTheDocument()
    const row = screen.getByText('Edited milestone Build (due date)').closest('tr')!
    expect(within(row).getByText('Maria Lopez')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Apollo' })).toHaveAttribute('href', '/projects/p1')
    expect(screen.getByText('Created project Apollo').closest('tr')).toHaveTextContent('System Admin')
  })

  it('asks for the first page, newest first, with no filters', async () => {
    const asked = serve(list([entry(1)]))
    page()
    await screen.findByText('Edited milestone Build (due date)')
    expect(asked[0]).toMatchObject({ page: 1, page_size: 25 })
    expect(asked[0].project_id).toBeUndefined()
  })

  it('shows exactly what changed when a row is opened, and hides it again', async () => {
    serve(list([entry(1)]))
    page()
    await userEvent.click(await screen.findByRole('button', { name: /Show details: Edited milestone Build/ }))
    expect(screen.getByText('Due date:')).toBeInTheDocument()
    expect(screen.getByText('Mar 27, 2026 → Apr 3, 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Hide details/ }))
    expect(screen.queryByText('Due date:')).not.toBeInTheDocument()
  })

  it('says yes or no, a dash for nothing, and a new record by its value alone', async () => {
    serve(list([entry(1, { entity: 'deliverable', summary: 'Ticked deliverable Spec', changes: [
      { field: 'done', label: 'Done', before: false, after: true },
      { field: 'notes', label: 'Notes', before: '', after: 'ok' },
      { field: 'name', label: 'Name', after: 'Spec' },
    ] })]))
    page()
    await userEvent.click(await screen.findByRole('button', { name: /Show details/ }))
    expect(screen.getByText('No → Yes')).toBeInTheDocument()
    expect(screen.getByText('— → ok')).toBeInTheDocument()
    expect(screen.getByText('Spec')).toBeInTheDocument()
  })

  it('writes fixed words as words: In progress, not in_progress', async () => {
    serve(list([entry(1, { summary: 'Edited milestone Build (status)', changes: [{ field: 'status', label: 'Status', before: 'pending', after: 'in_progress' }] })]))
    page()
    await userEvent.click(await screen.findByRole('button', { name: /Show details/ }))
    expect(screen.getByText('Pending → In progress')).toBeInTheDocument()
  })

  it('has a note for an entry whose fields did not change', async () => {
    serve(list([entry(1, { action: 'archive', summary: 'Archived project Apollo', changes: [] })]))
    page()
    await userEvent.click(await screen.findByRole('button', { name: /Show details/ }))
    expect(screen.getByText('No field changed.')).toBeInTheDocument()
  })

  it('sends each filter to the server and goes back to the first page', async () => {
    const asked = serve(list([entry(1)], 60))
    page()
    await screen.findByText('Edited milestone Build (due date)')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ page: 2 }))

    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Zeus' }))
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ project_id: 'p2', page: 1 }))

    await userEvent.click(screen.getByRole('combobox', { name: 'Person' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Alex Kim' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Kind' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Deliverables' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Action' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Archived' }))
    await userEvent.type(screen.getByLabelText('From'), '2026-03-01')
    await userEvent.type(screen.getByLabelText('To'), '2026-03-31')
    await waitFor(() => expect(asked.at(-1)).toMatchObject({
      project_id: 'p2', actor_id: 'u2', entity: 'deliverable', action: 'archive', from: '2026-03-01', to: '2026-03-31', page: 1,
    }))

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(asked.at(-1)?.project_id).toBeUndefined())
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('pages through a long history', async () => {
    serve((c: InternalAxiosRequestConfig) => list([entry((c.params as { page: number }).page)], 60, (c.params as { page: number }).page))
    page()
    expect(await screen.findByText('Page 1 of 3 · 60 entries')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 3 · 60 entries')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 3 of 3 · 60 entries')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('says so when nothing matches, and shows the server\'s own sentence when it fails', async () => {
    serve(list([]))
    const { unmount } = page()
    expect(await screen.findByText('Nothing has been recorded for this selection.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    unmount()
    restoreApi()
    mockRoutes({ 'GET /audit': apiError(500, 'server_error', 'History is unavailable'), 'GET /projects': projects, 'GET /users': people })
    page()
    expect(await screen.findByText('History is unavailable')).toBeInTheDocument()
  })
})
