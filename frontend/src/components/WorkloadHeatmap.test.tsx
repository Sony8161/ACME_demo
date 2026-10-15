import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { WorkloadHeatmap } from './WorkloadHeatmap'

const person = (id: string, name: string, hours: number[], work: { project_name: string; milestone_name: string }[][] = hours.map(() => [])) => (
  { user_id: id, name, job_title: 'Developer', manager_name: 'Maria Lopez', hours, work }
)
const data = (people: unknown[], weeks = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']) => ({ capacity_per_week: 40, weeks, people })
const apollo = [{ project_name: 'Apollo', milestone_name: 'Build' }]

afterEach(restoreApi)

describe('WorkloadHeatmap', () => {
  it('asks for eight weeks and shows a column per week with its Monday', async () => {
    const seen: Record<string, unknown>[] = []
    mockRoutes({ 'GET /reports/workload': (c: { params?: Record<string, unknown> }) => { seen.push(c.params ?? {}); return data([person('u1', 'Alex Kim', [40, 40, 0, 0])]) } })
    render(<WorkloadHeatmap />)
    const table = await screen.findByRole('table', { name: 'Workload by week' })
    expect(seen[0]).toEqual({ weeks: 8 })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Person', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2'])
  })

  it('writes the hours in every cell and sorts them into four levels, so colour is never the only signal', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [40, 24, 8, 0])]) })
    render(<WorkloadHeatmap />)
    const row = (await screen.findByText('Alex Kim')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells.map((c) => c.textContent)).toEqual(['40 h', '24 h', '8 h', '—'])
    expect(cells.map((c) => c.getAttribute('data-level'))).toEqual(['full', 'medium', 'light', 'free'])
  })

  it('tells a screen reader, and a mouse, what the work is', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [40, 0, 0, 0], [apollo, [], [], []])]) })
    render(<WorkloadHeatmap />)
    const cell = (await screen.findByText('Alex Kim')).closest('tr')!.querySelectorAll('td')[0]
    expect(cell).toHaveAttribute('title', 'Apollo · Build')
    expect(cell).toHaveTextContent('40 hApollo · Build')
    expect(cell.querySelector('[data-sr-only]')).not.toBeNull()
  })

  it('counts the people with a free week in the next four weeks', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [40, 40, 40, 40]), person('u2', 'Priya Shah', [40, 0, 40, 40]), person('u3', 'Tom Becker', [0, 0, 0, 0])]) })
    render(<WorkloadHeatmap />)
    expect(await screen.findByText('2 people have a free week in the next 4 weeks.')).toBeInTheDocument()
  })

  it('says everyone is booked when nobody has a free week', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [40, 40, 40, 40])]) })
    render(<WorkloadHeatmap />)
    expect(await screen.findByText('Everyone is booked for the next 4 weeks.')).toBeInTheDocument()
  })

  it('uses the singular for one person', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [0, 40, 40, 40])]) })
    render(<WorkloadHeatmap />)
    expect(await screen.findByText('1 person has a free week in the next 4 weeks.')).toBeInTheDocument()
  })

  it('has a legend that explains the four levels', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [40, 0, 0, 0])]) })
    render(<WorkloadHeatmap />)
    const legend = await screen.findByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Free', 'Up to half booked', 'Mostly booked', 'Full week (40 h)'])
  })

  it('narrows the rows by name', async () => {
    mockRoutes({ 'GET /reports/workload': data([person('u1', 'Alex Kim', [40, 0, 0, 0]), person('u2', 'Priya Shah', [0, 0, 0, 0])]) })
    render(<WorkloadHeatmap />)
    await screen.findByText('Alex Kim')
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter by name' }), 'pri')
    expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument()
    expect(screen.getByText('Priya Shah')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('textbox', { name: 'Filter by name' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter by name' }), 'zzz')
    expect(screen.getByText('Nobody matches.')).toBeInTheDocument()
  })

  it('says so when there is nobody to show', async () => {
    mockRoutes({ 'GET /reports/workload': data([]) })
    render(<WorkloadHeatmap />)
    expect(await screen.findByText('Nobody to show.')).toBeInTheDocument()
  })

  it('shows the error with a way to try again', async () => {
    let fail = true
    mockRoutes({ 'GET /reports/workload': () => (fail ? apiError(500, 'server_error', 'The database is waking up') : data([person('u1', 'Alex Kim', [0, 0, 0, 0])])) })
    render(<WorkloadHeatmap />)
    expect(await screen.findByText('The database is waking up')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
  })
})
