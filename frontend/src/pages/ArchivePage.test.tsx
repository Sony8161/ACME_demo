import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { ArchivePage } from './ArchivePage'

vi.setConfig({ testTimeout: 30_000 })

const person = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, username: `u${id}`, name, email: `${id}@x.test`, job_title: '', role: 'employee', manager_id: null,
  must_change_password: false, archived_at: null, salary: 10, ...over,
})
const project = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, description: '', manager: { id: 'm1', name: 'Maya Chen' }, status: 'archived', start_date: '2026-03-02', end_date: '2026-06-26',
  allocated_hours: 100, budget_amount: 1000, completed_at: null, archived_at: null, summary: {}, ...over,
})

const projects = {
  items: [
    project('p1', 'Apollo', { archived_at: '2026-04-10T08:30:00Z' }),
    project('p2', 'Still running'),
    project('p3', 'Zeus', { archived_at: '2026-05-01T12:00:00Z' }),
  ],
  total: 3, page: 1, page_size: 100,
}
const people = {
  items: [
    person('u1', 'Ann Archived', { archived_at: '2026-02-03T10:00:00Z', role: 'manager' }),
    person('u2', 'Bo Active'),
  ],
  total: 2,
}

afterEach(() => restoreApi())

const show = () => render(<ToastProvider><ArchivePage /></ToastProvider>)
const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

describe('ArchivePage', () => {
  it('lists archived projects and people in one table, newest first, and leaves out the rest', async () => {
    mockRoutes({ 'GET /projects': projects, 'GET /users': people })
    show()
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    await screen.findByText('Apollo')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument() // no tabs any more
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Type', 'Archived', 'Actions'])
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].firstChild?.textContent)
    expect(names).toEqual(['Zeus', 'Apollo', 'Ann Archived']) // May 1, Apr 10, Feb 3
    expect(screen.queryByText('Still running')).not.toBeInTheDocument()
    expect(screen.queryByText('Bo Active')).not.toBeInTheDocument()
  })

  it('shows each row\'s type, detail and archive date', async () => {
    mockRoutes({ 'GET /projects': projects, 'GET /users': people })
    show()
    await screen.findByText('Apollo')
    expect(row('Apollo')).toHaveTextContent('Manager Maya Chen')
    expect(within(row('Apollo')).getByText('Project')).toBeInTheDocument()
    expect(within(row('Apollo')).getByText('Apr 10, 2026')).toBeInTheDocument()
    expect(within(row('Ann Archived')).getByText('Person')).toBeInTheDocument()
    expect(row('Ann Archived')).toHaveTextContent('manager · u1@x.test')
    expect(within(row('Ann Archived')).getByText('Feb 3, 2026')).toBeInTheDocument()
  })

  it('asks the server to include archived projects and people', async () => {
    const asked: unknown[] = []
    mockRoutes({
      'GET /projects': (c: InternalAxiosRequestConfig) => { asked.push(['projects', c.params]); return projects },
      'GET /users': (c: InternalAxiosRequestConfig) => { asked.push(['users', c.params]); return people },
    })
    show()
    await screen.findByText('Apollo')
    expect(asked).toContainEqual(['projects', { include_archived: 'true', page_size: 100 }])
    expect(asked).toContainEqual(['users', { include_archived: 'true' }])
  })

  it('says so when nothing at all is archived', async () => {
    mockRoutes({ 'GET /projects': { ...projects, items: [project('p2', 'Still running')] }, 'GET /users': { items: [person('u2', 'Bo Active')], total: 1 } })
    show()
    expect(await screen.findByText('Nothing is archived.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument()
  })

  it('still lists the people when no project is archived, and the projects when no person is', async () => {
    mockRoutes({ 'GET /projects': { ...projects, items: [project('p2', 'Still running')] }, 'GET /users': people })
    const first = show()
    expect(await screen.findByText('Ann Archived')).toBeInTheDocument()
    expect(screen.queryByText('Nothing is archived.')).not.toBeInTheDocument()
    first.unmount()
    restoreApi()
    mockRoutes({ 'GET /projects': projects, 'GET /users': { items: [person('u2', 'Bo Active')], total: 1 } })
    show()
    expect(await screen.findByText('Apollo')).toBeInTheDocument()
    expect(screen.queryByText('Ann Archived')).not.toBeInTheDocument()
  })

  it('labels every Restore button with the name it restores', async () => {
    mockRoutes({ 'GET /projects': projects, 'GET /users': people })
    show()
    await screen.findByText('Apollo')
    expect(screen.getAllByRole('button', { name: /^Restore / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Restore Zeus', 'Restore Apollo', 'Restore Ann Archived'])
  })

  it('restores a project, reloads the list and confirms with a toast', async () => {
    let restored = false
    const calls = mockRoutes({
      'GET /projects': () => (restored ? { ...projects, items: [projects.items[2]] } : projects),
      'GET /users': people,
      'POST /projects/:id/unarchive': () => { restored = true; return project('p1', 'Apollo') },
    })
    show()
    await screen.findByText('Apollo')
    await userEvent.click(screen.getByRole('button', { name: 'Restore Apollo' }))
    await vi.waitFor(() => expect(screen.queryByText('Apollo', { selector: 'td' })).not.toBeInTheDocument())
    expect(calls).toContain('POST /projects/p1/unarchive')
    expect(screen.getByText('Zeus')).toBeInTheDocument()
    expect(await screen.findByText('Apollo restored')).toBeInTheDocument()
  })

  it('restores a person from the same table and reloads the list', async () => {
    let restored = false
    const calls = mockRoutes({
      'GET /projects': { ...projects, items: [] },
      'GET /users': () => (restored ? { items: [person('u1', 'Ann Archived')], total: 1 } : people),
      'POST /users/:id/unarchive': () => { restored = true; return person('u1', 'Ann Archived') },
    })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Restore Ann Archived' }))
    expect(await screen.findByText('Nothing is archived.')).toBeInTheDocument()
    expect(calls).toContain('POST /users/u1/unarchive')
    expect(await screen.findByText('Ann Archived restored')).toBeInTheDocument()
  })

  it('shows why a restore failed, keeps the row, shows no toast, and lets the person dismiss the message', async () => {
    mockRoutes({
      'GET /projects': projects,
      'GET /users': people,
      'POST /projects/:id/unarchive': apiError(409, 'manager_archived', 'The project manager is archived. Restore them first.'),
    })
    show()
    await screen.findByText('Apollo')
    await userEvent.click(screen.getByRole('button', { name: 'Restore Apollo' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The project manager is archived. Restore them first.')
    expect(screen.getByText('Apollo')).toBeInTheDocument()
    expect(screen.queryByText('Apollo restored')).not.toBeInTheDocument()
    await userEvent.click(within(alert).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears an old failure message when another restore is started', async () => {
    let fail = true
    mockRoutes({
      'GET /projects': projects,
      'GET /users': people,
      'POST /projects/:id/unarchive': () => (fail ? apiError(500, 'server_error', 'Something broke') : project('p1', 'Apollo')),
    })
    show()
    await screen.findByText('Apollo')
    await userEvent.click(screen.getByRole('button', { name: 'Restore Apollo' }))
    expect(await screen.findByText('Something broke')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Restore Apollo' }))
    await vi.waitFor(() => expect(screen.queryByText('Something broke')).not.toBeInTheDocument())
  })

  it('shows a readable error with a retry when the list cannot be loaded', async () => {
    let up = false
    mockRoutes({
      'GET /projects': () => (up ? projects : apiError(500, 'server_error', 'The database is waking up')),
      'GET /users': people,
    })
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('The database is waking up')
    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Apollo')).toBeInTheDocument()
  })

  it('shows an error when only the people list cannot be loaded', async () => {
    mockRoutes({ 'GET /projects': projects, 'GET /users': apiError(500, 'server_error', 'People are unavailable') })
    show()
    expect(await screen.findByText('People are unavailable')).toBeInTheDocument()
  })
})
