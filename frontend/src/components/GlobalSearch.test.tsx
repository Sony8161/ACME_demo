import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { GlobalSearch } from './GlobalSearch'

const answer = (over: Record<string, unknown> = {}) => ({
  query: 'al',
  projects: [{ id: 'p1', name: 'Alpha site', manager_name: 'Maria Lopez', status: 'active', risk_level: 'at_risk' }],
  people: [{ id: 'u1', name: 'Alex Kim', job_title: 'Developer', role: 'employee' }],
  tasks: [{ id: 't1', name: 'Align logos', project_id: 'p1', project_name: 'Alpha site', milestone_name: 'Design', status: 'in_progress', assignee_name: 'Alex Kim' }],
  ...over,
})
function Where() {
  const { pathname, search } = useLocation()
  return <output aria-label="location">{pathname + search}</output>
}
function show(props: { compact?: boolean } = {}) {
  return render(<MemoryRouter><GlobalSearch {...props} /><Where /></MemoryRouter>)
}
const box = () => screen.getByRole('combobox', { name: 'Search projects, people, tasks' })
const here = () => screen.getByLabelText('location').textContent

afterEach(restoreApi)

describe('GlobalSearch', () => {
  it('asks nothing until two characters are typed, then shows what was found in groups', async () => {
    const calls = mockRoutes({ 'GET /search': answer() })
    show()
    await userEvent.type(box(), 'a')
    expect(calls).toEqual([])
    await userEvent.type(box(), 'l')
    const list = await screen.findByRole('listbox')
    expect(calls).toEqual(['GET /search'])
    for (const group of ['Projects', 'People', 'Tasks']) expect(within(list).getByText(group)).toBeInTheDocument()
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Alpha siteMaria Lopez · At risk', 'Alex KimDeveloper', 'Align logosAlpha site · In progress',
    ])
  })

  it('leaves out a group with nothing in it', async () => {
    mockRoutes({ 'GET /search': answer({ people: [], tasks: [] }) })
    show()
    await userEvent.type(box(), 'al')
    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Projects')).toBeInTheDocument()
    expect(within(list).queryByText('People')).not.toBeInTheDocument()
    expect(within(list).queryByText('Tasks')).not.toBeInTheDocument()
  })

  it.each([
    ['a project', 'Alpha site', '/projects/p1'],
    ['a person', 'Alex Kim', '/people?q=Alex%20Kim'],
    ['a task', 'Align logos', '/projects/p1?tab=tasks'],
  ])('opens %s from the list, then closes and clears the box', async (_, name, target) => {
    mockRoutes({ 'GET /search': answer() })
    show()
    await userEvent.type(box(), 'al')
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }))
    expect(here()).toBe(target)
    expect(box()).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('works from the keyboard: arrows to move, Enter to open', async () => {
    mockRoutes({ 'GET /search': answer() })
    show()
    await userEvent.type(box(), 'al')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(here()).toBe('/people?q=Alex%20Kim')
  })

  it('every result is a real link, so it can be opened in a new tab', async () => {
    mockRoutes({ 'GET /search': answer() })
    show()
    await userEvent.type(box(), 'al')
    const list = await screen.findByRole('listbox')
    expect(within(list).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/projects/p1', '/people?q=Alex%20Kim', '/projects/p1?tab=tasks'])
  })

  it('says so when nothing matches', async () => {
    mockRoutes({ 'GET /search': answer({ projects: [], people: [], tasks: [] }) })
    show()
    await userEvent.type(box(), 'zzz')
    expect(await screen.findByText('No results for "zzz".')).toBeInTheDocument()
  })

  it('says so when the search is not available', async () => {
    mockRoutes({ 'GET /search': apiError(500, 'server_error', 'down') })
    show()
    await userEvent.type(box(), 'al')
    expect(await screen.findByText('Search is not available right now.')).toBeInTheDocument()
  })

  it('Esc closes the list first and clears the box on the second press', async () => {
    mockRoutes({ 'GET /search': answer() })
    show()
    await userEvent.type(box(), 'al')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(box()).toHaveValue('al')
    await userEvent.keyboard('{Escape}')
    expect(box()).toHaveValue('')
  })

  it('on a phone it is an icon that opens the box', async () => {
    mockRoutes({ 'GET /search': answer() })
    show({ compact: true })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await userEvent.type(box(), 'al')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })
})
