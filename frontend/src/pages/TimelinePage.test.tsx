import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { renderPage, signIn } from '../test/pmFixtures'
import { TimelineView } from './TimelinePage'

vi.setConfig({ testTimeout: 30_000 })

const ms = (over: Record<string, unknown> = {}) => ({
  id: 'm1', name: 'Design', start_date: '2026-09-01', due_date: '2026-10-31', status: 'in_progress', is_overdue: false, tasks_total: 2, tasks_done: 1, blocked_by_count: 0, ...over,
})
const project = (id: string, name: string, risk: string, milestones: unknown[]) => ({
  id, name, manager_name: 'Maria Lopez', status: 'active', start_date: '2026-08-15', end_date: '2026-12-31', risk_level: risk, blocked_by_count: 0, milestones,
})
const page = () => renderPage(<TimelineView />, '/projects', '/projects')

beforeEach(() => signIn('admin'))
afterEach(() => { restoreApi(); localStorage.clear() })

describe('TimelineView', () => {
  it('puts every open project on one calendar, each linked, with its milestones underneath', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [project('p1', 'Website', 'on_track', [ms()]), project('p2', 'Portal', 'overdue', [ms({ id: 'm2', name: 'Discovery', is_overdue: true })])] } })
    page()
    const list = await screen.findByRole('list', { name: 'All projects' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/projects/p1')
    expect(screen.getByRole('link', { name: 'Portal' })).toHaveAttribute('href', '/projects/p2')
    expect(screen.getAllByText('Maria Lopez · Aug 15, 2026 to Dec 31, 2026')).toHaveLength(2)
    expect(screen.getByText('Milestone Discovery of Portal, Sep 1, 2026 to Oct 31, 2026, late')).toBeInTheDocument()
  })

  it('is only the chart: it brings no page header of its own', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [project('p1', 'Website', 'on_track', [ms()])] } })
    page()
    await screen.findByRole('list', { name: 'All projects' })
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('keeps the legend behind an info button that shows how to read the chart on hover', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [project('p1', 'Website', 'on_track', [ms()])] } })
    page()
    const info = await screen.findByRole('button', { name: 'How to read this chart' })
    expect(screen.queryByText(/the vertical line is today/)).not.toBeInTheDocument()
    await userEvent.hover(info)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('A bar runs from start to end')
    expect(tip).toHaveTextContent('Red means late')
    expect(tip).not.toHaveTextContent('diamond') // projects and milestones only: tasks have the diamond
  })

  it('says what a project or milestone is waiting for', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [{ ...project('p1', 'Website', 'on_track', [ms({ blocked_by_count: 1 })]), blocked_by_count: 2 }] } })
    page()
    expect(await screen.findByText('Maria Lopez · Aug 15, 2026 to Dec 31, 2026 · waiting for 2')).toBeInTheDocument()
    expect(screen.getByText('Sep 1, 2026 to Oct 31, 2026 · waiting for 1')).toBeInTheDocument()
  })

  it('can hide the milestones', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [project('p1', 'Website', 'at_risk', [ms(), ms({ id: 'm3', name: 'Done one', status: 'completed', tasks_total: 0, tasks_done: 0 })])] } })
    page()
    await screen.findByText('Design')
    await userEvent.click(screen.getByRole('switch', { name: 'Show milestones' }))
    expect(screen.queryByText('Design')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Website' })).toBeInTheDocument()
  })

  it('says so when there is nothing open, and shows the server\'s sentence when it fails', async () => {
    mockRoutes({ 'GET /reports/timeline': { as_of: '2026-10-14', projects: [] } })
    const { unmount } = page()
    expect(await screen.findByText('Nothing to show yet.')).toBeInTheDocument()
    unmount()
    restoreApi()
    mockRoutes({ 'GET /reports/timeline': apiError(500, 'server_error', 'Timeline is unavailable') })
    page()
    expect(await screen.findByText('Timeline is unavailable')).toBeInTheDocument()
  })
})
