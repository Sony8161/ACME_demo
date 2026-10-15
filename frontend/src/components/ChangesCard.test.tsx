import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { signIn } from '../test/pmFixtures'
import { ChangesCard } from './ChangesCard'

const entry = (id: number, over: Record<string, unknown> = {}) => ({
  id, occurred_at: '2026-10-14T09:30:00Z', actor_id: 'a', actor_name: 'Maria Lopez', entity: 'deliverable', entity_id: 'e', project_id: 'p1',
  project_name: 'Website Redesign', label: 'Login page', action: 'update', summary: "Moved task 'Login page' to Done", changes: [], ...over,
})
const feed = (over: Record<string, unknown> = {}) => ({ since: '2026-10-08T09:00:00Z', total: 14, projects: 5, items: [entry(1), entry(2, { actor_name: 'James Carter', summary: 'Added milestone Beta', project_id: 'p2', project_name: 'Mobile App' })], ...over })

function show() {
  return render(<MemoryRouter><AuthProvider><ChangesCard /></AuthProvider></MemoryRouter>)
}

afterEach(() => { restoreApi(); localStorage.clear(); vi.restoreAllMocks() })

describe('ChangesCard', () => {
  beforeEach(() => { signIn('admin', { id: 'adm' }) })

  it('says how much changed and shows the newest entries, each linked to its project', async () => {
    mockRoutes({ 'GET /reports/changes': feed() })
    show()
    const card = await screen.findByRole('region', { name: 'Since you last visited' })
    expect(card).toHaveTextContent('14 changes in 5 projects')
    expect(within(card).getByText(/Maria Lopez/)).toBeInTheDocument()
    expect(card).toHaveTextContent("Moved task 'Login page' to Done")
    expect(within(card).getByRole('link', { name: 'Website Redesign' })).toHaveAttribute('href', '/projects/p1')
    expect(within(card).getByRole('link', { name: 'Mobile App' })).toHaveAttribute('href', '/projects/p2')
  })

  it('uses singular words for one change in one project', async () => {
    mockRoutes({ 'GET /reports/changes': feed({ total: 1, projects: 1, items: [entry(1)] }) })
    show()
    expect(await screen.findByRole('region', { name: 'Since you last visited' })).toHaveTextContent('1 change in 1 project')
  })

  it('asks for the last seven days the first time, five entries', async () => {
    const seen: Record<string, unknown>[] = []
    mockRoutes({ 'GET /reports/changes': (c: { params?: Record<string, unknown> }) => { seen.push(c.params ?? {}); return feed() } })
    show()
    await screen.findByRole('region')
    expect(seen[0].limit).toBe(5)
    const asked = Date.parse(String(seen[0].since))
    expect(Math.abs(Date.now() - 7 * 86_400_000 - asked)).toBeLessThan(60_000)
    expect(String(seen[0].since)).toMatch(/Z$/) // UTC, so the + of an offset never needs escaping
  })

  it('asks from the moment of the last "Got it" afterwards', async () => {
    localStorage.setItem('pm.lastVisit.adm', '2026-10-13T12:00:00.000Z')
    const seen: Record<string, unknown>[] = []
    mockRoutes({ 'GET /reports/changes': (c: { params?: Record<string, unknown> }) => { seen.push(c.params ?? {}); return feed() } })
    show()
    await screen.findByRole('region')
    expect(seen[0].since).toBe('2026-10-13T12:00:00.000Z')
  })

  it('Got it hides the card and remembers now, so the next visit starts from here', async () => {
    mockRoutes({ 'GET /reports/changes': feed() })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('region', { name: 'Since you last visited' })).not.toBeInTheDocument()
    expect(Math.abs(Date.now() - Date.parse(localStorage.getItem('pm.lastVisit.adm') ?? ''))).toBeLessThan(60_000)
  })

  it('stays hidden for the rest of the visit even if storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    mockRoutes({ 'GET /reports/changes': feed() })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('shows nothing when nothing changed, while loading, or when the answer fails', async () => {
    mockRoutes({ 'GET /reports/changes': feed({ total: 0, projects: 0, items: [] }) })
    const { container, unmount } = show()
    expect(container).toBeEmptyDOMElement() // while it loads
    await new Promise((r) => setTimeout(r, 50))
    expect(container).toBeEmptyDOMElement() // nothing new
    unmount()
    restoreApi()
    mockRoutes({ 'GET /reports/changes': apiError(500, 'server_error', 'down') })
    const again = show()
    await new Promise((r) => setTimeout(r, 50))
    expect(again.container).toBeEmptyDOMElement() // quiet: this card is a bonus, never an error on the dashboard
  })

  it('offers the admin a link to the whole history, and a manager none', async () => {
    mockRoutes({ 'GET /reports/changes': feed() })
    const { unmount } = show()
    expect(await screen.findByRole('link', { name: 'See everything' })).toHaveAttribute('href', '/history')
    unmount()
    restoreApi()
    localStorage.clear()
    signIn('manager', { id: 'mgr' })
    mockRoutes({ 'GET /reports/changes': feed() })
    show()
    await screen.findByRole('region', { name: 'Since you last visited' })
    expect(screen.queryByRole('link', { name: 'See everything' })).not.toBeInTheDocument()
  })

  it('is not for employees: nothing is asked and nothing is shown', async () => {
    localStorage.clear()
    signIn('employee', { id: 'emp' })
    const calls = mockRoutes({ 'GET /reports/changes': feed() })
    const { container } = show()
    await new Promise((r) => setTimeout(r, 50))
    expect(container).toBeEmptyDOMElement()
    expect(calls).toEqual([])
  })
})
