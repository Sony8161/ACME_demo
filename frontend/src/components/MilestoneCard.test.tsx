import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InternalAxiosRequestConfig } from 'axios'
import { keysToCamel } from '../api/case'
import type { Milestone, Project } from '../api/types'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { deliverable, milestone as milestoneBody, project as projectBody } from '../test/pmFixtures'
import { MilestoneCard } from './MilestoneCard'
import { ToastProvider } from './ToastProvider'

// MUI dialogs are slow to open in jsdom on a busy machine.
vi.setConfig({ testTimeout: 30_000 })

const BASE = '/projects/p1/milestones/m1'
const body = (c: InternalAxiosRequestConfig) => JSON.parse(c.data as string)
const list = (items: unknown[]) => ({ items, total: items.length, done: items.filter((i) => (i as { done: boolean }).done).length, ready_to_complete: false })
const person = (id: string, name: string, jobTitle = '') => ({
  id, username: id, name, email: `${id}@x.test`, job_title: jobTitle, role: 'employee', manager_id: null,
  must_change_password: false, archived_at: null, salary: null,
})
const assignee = (overrides: Record<string, unknown> = {}) => ({
  assignment_id: 'a1', user_id: 'u1', name: 'Ann Designer', job_title: 'Designer', milestone_id: 'm1', milestone_name: 'Design',
  start_date: '2026-09-01', end_date: '2026-09-30', days_worked: 10, hours_worked: 80, labor_cost: 2400, expected_hours: 160, expected_cost: 4800, hourly_rate: 30, ...overrides,
})
const team = (items: unknown[] = []) => ({ items, total: items.length, hours_worked: 0, labor_cost: 0, expected_hours: 0, expected_cost: 0 })

interface Setup {
  milestone?: Record<string, unknown>
  canManage?: boolean
  deliverables?: unknown[]
  team?: unknown[]
  routes?: Record<string, unknown>
}

function setup({ milestone, canManage = true, deliverables = [deliverable(), deliverable({ id: 'd2', name: 'Mockups', done: true })], team: members = [], routes = {} }: Setup = {}) {
  const calls = mockRoutes({
    [`GET ${BASE}/deliverables`]: list(deliverables),
    [`GET ${BASE}/team`]: team(members),
    [`GET ${BASE}/dependencies`]: { blocked_by: [], blocks: [], is_blocked: false },
    ...routes,
  })
  const onChanged = vi.fn()
  const view = render(
    <ToastProvider>
      <MilestoneCard
        project={keysToCamel<Project>(projectBody())}
        milestone={keysToCamel<Milestone>(milestoneBody(milestone))}
        canManage={canManage}
        onChanged={onChanged}
      />
    </ToastProvider>,
  )
  return { calls, onChanged, ...view }
}

/** Every task done, so the milestone can be signed off. */
const ALL_DONE = { deliverables_done: 2 }
const doneTasks = [deliverable({ done: true }), deliverable({ id: 'd2', name: 'Mockups', done: true })]
const headerButton = (name = 'Design') => screen.getByRole('button', { name })
const expand = async () => {
  await userEvent.click(headerButton())
  await screen.findByRole('heading', { name: /^Tasks \(/ })
}
const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Milestone actions: Design' }))
const pick = async (name: string | RegExp) => {
  await openMenu()
  await userEvent.click(await screen.findByRole('menuitem', { name }))
}

afterEach(restoreApi)

describe('MilestoneCard: what it shows', () => {
  it('shows the milestone line, its facts, tasks with their ticks, and the team', async () => {
    setup({ team: [assignee(), assignee({ assignment_id: 'a2', name: 'Bo Builder', job_title: '' })] })
    expect(screen.getByRole('heading', { name: 'Design' })).toBeInTheDocument()
    expect(screen.getByText('Sep 1, 2026 to Oct 31, 2026 · 1 of 2 tasks done')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Tasks done in Design' })).toHaveAttribute('aria-valuenow', '50')

    // an in-progress milestone is open by default
    expect(headerButton()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Wireframes and mockups')).toBeInTheDocument()
    expect(screen.getByText('Hours worked').nextSibling).toHaveTextContent('40 h of 100 h')
    expect(screen.getByText('Expected hours').nextSibling).toHaveTextContent('80 h')
    expect(screen.getByText('Labor cost').nextSibling).toHaveTextContent('$3,200 of $6,400')
    expect(screen.getByText('Budget').nextSibling).toHaveTextContent('$8,000')
    expect(screen.getByRole('heading', { name: 'Tasks (1 of 2 done)' })).toBeInTheDocument()

    expect(await screen.findByRole('checkbox', { name: 'Wireframes' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Mockups' })).toBeChecked()
    expect(await screen.findByText('Ann Designer')).toBeInTheDocument()
    expect(screen.getByTitle('Ann Designer · Designer')).toBeInTheDocument()
    expect(screen.getByTitle('Bo Builder')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
  })

  it('offers a manager "+ Assign a person" even while the team is empty, but shows an employee no empty Team section', async () => {
    const first = setup()
    expect(await screen.findByRole('button', { name: '+ Assign a person' })).toBeInTheDocument()
    first.unmount()

    const { calls } = setup({ canManage: false })
    await screen.findByRole('checkbox', { name: 'Wireframes' })
    await waitFor(() => expect(calls).toContain(`GET ${BASE}/team`))
    expect(screen.queryByRole('heading', { name: 'Team' })).not.toBeInTheDocument()
  })

  it('tells a manager to add tasks, and tells an employee none are listed yet', async () => {
    const { unmount } = setup({ deliverables: [], milestone: { deliverables_total: 0, deliverables_done: 0 } })
    expect(await screen.findByText(/A milestone needs at least one before it can be completed/)).toBeInTheDocument()
    unmount()
    setup({ canManage: false, deliverables: [], milestone: { deliverables_total: 0, deliverables_done: 0 } })
    expect(await screen.findByText('No tasks have been listed yet.')).toBeInTheDocument()
  })

  it('flags a past-due milestone, shows the status of one that has not started, and opens a past-due one', async () => {
    setup({ milestone: { is_overdue: true, status: 'pending' } })
    expect(screen.getByText('Past due')).toBeInTheDocument()
    expect(screen.getByText('Not started')).toBeInTheDocument()
    expect(headerButton()).toHaveAttribute('aria-expanded', 'true')
    await screen.findByRole('checkbox', { name: 'Wireframes' })
  })

  it('leaves out the money figures when the server did not send them', async () => {
    setup({ milestone: { budget_amount: null, labor_cost: null, expected_cost: null, budget_pct: null } })
    await screen.findByRole('checkbox', { name: 'Wireframes' })
    expect(screen.queryByText('Budget')).not.toBeInTheDocument()
    expect(screen.queryByText('Labor cost')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('$')
  })

  it('labels a completed, archived milestone, and shows its review note once opened', async () => {
    setup({ milestone: { status: 'completed', archived_at: '2026-10-10T00:00:00Z', review_note: 'Signed off by the client' } })
    expect(screen.getByText('Completed, archived')).toBeInTheDocument()
    expect(screen.queryByText(/Review note/)).not.toBeInTheDocument()
    await expand()
    expect(screen.getByText('Review note: Signed off by the client')).toBeInTheDocument()
  })

  it('labels a cancelled milestone as "Cancelled, archived"', () => {
    setup({ milestone: { status: 'in_progress', archived_at: '2026-10-10T00:00:00Z' } })
    expect(screen.getByText('Cancelled, archived')).toBeInTheDocument()
  })
})

describe('MilestoneCard: open and closed', () => {
  it.each([
    ['not started', { status: 'pending' }],
    ['completed', { status: 'completed' }],
    ['archived', { archived_at: '2026-10-10T00:00:00Z' }],
    ['archived although overdue', { archived_at: '2026-10-10T00:00:00Z', is_overdue: true, blocked_by_count: 2 }],
  ])('starts closed when it is %s, and loads nothing until it is opened', async (_label, milestone) => {
    const { calls } = setup({ milestone })
    expect(headerButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Tasks \(/ })).not.toBeInTheDocument()
    expect(calls.filter((c) => c.includes('/deliverables') || c.includes('/team'))).toEqual([])
  })

  it.each([
    ['in progress', { status: 'in_progress' }],
    ['past due', { status: 'pending', is_overdue: true }],
    ['waiting for something', { status: 'pending', blocked_by_count: 1 }],
  ])('starts open when it is %s', async (_label, milestone) => {
    setup({ milestone })
    expect(headerButton()).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('checkbox', { name: 'Wireframes' })).toBeInTheDocument()
  })

  it('opens and closes from the header, fetching the tasks and the team only once it is open', async () => {
    const { calls } = setup({ milestone: { status: 'pending' }, team: [assignee()] })
    expect(calls.some((c) => c.includes('/deliverables'))).toBe(false)

    await userEvent.click(headerButton())
    expect(headerButton()).toHaveAttribute('aria-expanded', 'true')
    expect(headerButton()).toHaveAttribute('aria-controls', 'milestone-m1')
    expect(await screen.findByRole('checkbox', { name: 'Wireframes' })).toBeInTheDocument()
    expect(await screen.findByText('Ann Designer')).toBeInTheDocument()
    expect(calls).toContain(`GET ${BASE}/deliverables`)
    expect(calls).toContain(`GET ${BASE}/team`)

    await userEvent.click(headerButton())
    expect(headerButton()).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument())
  })

  it('shows why the tasks or the team could not be loaded', async () => {
    setup({
      routes: {
        [`GET ${BASE}/deliverables`]: apiError(500, 'server_error', 'Tasks are unavailable'),
        [`GET ${BASE}/team`]: apiError(500, 'server_error', 'The team is unavailable'),
      },
    })
    expect(await screen.findByText('Tasks are unavailable')).toBeInTheDocument()
    expect(await screen.findByText('The team is unavailable')).toBeInTheDocument()
  })
})

describe('MilestoneCard: read-only', () => {
  it('lets an employee see the checklist but not change anything', async () => {
    setup({ canManage: false, milestone: { ...ALL_DONE } })
    expect(await screen.findByRole('checkbox', { name: 'Wireframes' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Mockups' })).toBeDisabled()
    expect(screen.queryByLabelText('New task')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Milestone actions/ })).not.toBeInTheDocument()
    for (const name of ['Ready to sign off', '+ Assign a person', 'Mark as started', 'Add']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it.each([
    ['completed', { status: 'completed', archived_at: '2026-10-10T00:00:00Z' }],
    ['completed but not yet archived', { status: 'completed' }],
    ['archived', { archived_at: '2026-10-10T00:00:00Z' }],
  ])('locks a manager out of a milestone that is %s', async (_label, milestone) => {
    setup({ milestone: { ...milestone, ...ALL_DONE } })
    await expand()
    expect(await screen.findByRole('checkbox', { name: 'Wireframes' })).toBeDisabled()
    expect(screen.queryByLabelText('New task')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Milestone actions/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ready to sign off' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Assign a person' })).not.toBeInTheDocument()
  })
})

describe('MilestoneCard: tasks', () => {
  it('ticks a task with a PATCH, then reloads the list and tells the page', async () => {
    let items = [deliverable(), deliverable({ id: 'd2', name: 'Mockups', done: true })]
    const patches: unknown[] = []
    const { calls, onChanged } = setup({
      routes: {
        [`GET ${BASE}/deliverables`]: () => list(items),
        [`PATCH ${BASE}/deliverables/:id`]: (c: InternalAxiosRequestConfig) => {
          patches.push([c.url, body(c)])
          items = items.map((d) => (d.id === 'd1' ? { ...d, done: true } : d))
          return items[0]
        },
      },
    })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Wireframes' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Wireframes' })).toBeChecked())
    expect(patches).toEqual([[`${BASE}/deliverables/d1`, { done: true }]])
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(calls.filter((c) => c === `GET ${BASE}/deliverables`)).toHaveLength(2)
    expect(calls.filter((c) => c === `GET ${BASE}/team`)).toHaveLength(2)
  })

  it('unticks a task by sending done: false', async () => {
    const patches: unknown[] = []
    setup({ routes: { [`PATCH ${BASE}/deliverables/:id`]: (c: InternalAxiosRequestConfig) => { patches.push([c.url, body(c)]); return {} } } })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mockups' }))
    await waitFor(() => expect(patches).toEqual([[`${BASE}/deliverables/d2`, { done: false }]]))
  })

  it('shows the server sentence when a tick is refused, and lets the person dismiss it', async () => {
    const { onChanged } = setup({
      routes: { [`PATCH ${BASE}/deliverables/:id`]: apiError(409, 'conflict', 'This task is archived and can no longer be changed') },
    })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Wireframes' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This task is archived and can no longer be changed')
    expect(onChanged).not.toHaveBeenCalled()
    await userEvent.click(within(alert).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('adds a task, clears the box and shows the new item', async () => {
    let items = [deliverable()]
    const posts: unknown[] = []
    const { onChanged } = setup({
      deliverables: items,
      routes: {
        [`GET ${BASE}/deliverables`]: () => list(items),
        [`POST ${BASE}/deliverables`]: (c: InternalAxiosRequestConfig) => {
          posts.push(body(c))
          items = [...items, deliverable({ id: 'd3', name: 'Style guide' })]
          return items[1]
        },
      },
    })
    const box = await screen.findByLabelText('New task')
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    await userEvent.type(box, '  Style guide  ')
    expect(add).toBeEnabled()
    await userEvent.click(add)

    expect(await screen.findByRole('checkbox', { name: 'Style guide' })).toBeInTheDocument()
    expect(posts).toEqual([{ name: 'Style guide' }])
    expect(box).toHaveValue('')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('ignores a blank name pressed with Enter', async () => {
    const { calls } = setup()
    const box = await screen.findByLabelText('New task')
    await userEvent.type(box, '   {Enter}')
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
  })

  it('keeps the typed name and shows the reason when adding fails (duplicate name)', async () => {
    setup({ routes: { [`POST ${BASE}/deliverables`]: apiError(409, 'conflict', 'This milestone already has a task with that name') } })
    const box = await screen.findByLabelText('New task')
    await userEvent.type(box, 'Wireframes{Enter}')
    expect(await screen.findByText('This milestone already has a task with that name')).toBeInTheDocument()
    expect(box).toHaveValue('Wireframes')
  })
})

describe('MilestoneCard: the actions menu', () => {
  it('lists the actions of a milestone that has not started, with "Complete" disabled and the reason', async () => {
    setup({ milestone: { status: 'pending' } })
    await openMenu()
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Mark as started', 'Complete milestoneEvery task must be done first', 'Add dependency', 'Assign a person', 'Cancel milestone',
    ])
    expect(within(menu).getByRole('menuitem', { name: /Complete milestone/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('does not offer "Mark as started" once the milestone is in progress', async () => {
    setup()
    await openMenu()
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Mark as started' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Cancel milestone' })).toBeInTheDocument()
  })

  it('enables "Complete" with no reason once every task is done', async () => {
    setup({ milestone: ALL_DONE })
    await openMenu()
    const item = await screen.findByRole('menuitem', { name: 'Complete milestone' })
    expect(item).not.toHaveAttribute('aria-disabled', 'true')
    expect(item).not.toHaveTextContent('Every task must be done first')
  })

  it('opens the dependency dialog from the menu, even on a closed card, and opens the card too', async () => {
    const { calls } = setup({
      milestone: { status: 'pending' },
      routes: { 'GET /reports/timeline': { as_of: '2026-10-14', projects: [] } },
    })
    expect(headerButton()).toHaveAttribute('aria-expanded', 'false')
    await pick('Add dependency')
    expect(await screen.findByRole('dialog', { name: 'Add a milestone dependency' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Design', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    expect(calls).toContain(`GET ${BASE}/dependencies`)
  })
})

describe('MilestoneCard: start', () => {
  it('marks a pending milestone as started, says so in a toast, and undoes it from there', async () => {
    const patches: unknown[] = []
    const { onChanged, calls } = setup({
      milestone: { status: 'pending' },
      routes: { [`PATCH ${BASE}`]: (c: InternalAxiosRequestConfig) => { patches.push(body(c)); return {} } },
    })
    await pick('Mark as started')
    expect(await screen.findByText('Design started')).toBeInTheDocument()
    expect(patches).toEqual([{ status: 'in_progress' }])
    expect(onChanged).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(patches).toEqual([{ status: 'in_progress' }, { status: 'pending' }]))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(calls.filter((c) => c === `PATCH ${BASE}`)).toHaveLength(2)
  })

  it('shows the server sentence, and no toast, when starting a blocked milestone is refused', async () => {
    const waiting = { blocked_by: [{ id: 'd1', kind: 'milestone', item_id: 'm0', name: 'Research', project_id: 'p1', project_name: 'Website redesign', status: 'in_progress', is_done: false, schedule_conflict: false, visible: true }], blocks: [], is_blocked: true }
    const { onChanged } = setup({
      milestone: { status: 'pending', blocked_by_count: 1 },
      routes: { [`GET ${BASE}/dependencies`]: waiting, [`PATCH ${BASE}`]: apiError(409, 'blocked', 'This milestone cannot be started yet: it is waiting for Research (Website redesign).') },
    })
    await pick('Mark as started')
    expect(await screen.findByText(/cannot be started yet: it is waiting for Research/)).toBeInTheDocument()
    expect(screen.queryByText('Design started')).not.toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('MilestoneCard: assign a person', () => {
  const employees = { items: [person('u1', 'Ann Designer', 'Designer'), person('u2', 'Bo Builder')], total: 2 }
  const work = (milestone_name: string, start_date: string, end_date: string) => ({ project_id: 'p9', project_name: 'Mobile', milestone_id: 'mx', milestone_name, start_date, end_date })
  const allocationRow = (user_id: string, name: string, state: string, extra: Record<string, unknown> = {}) => ({
    user_id, name, job_title: '', manager_name: null, state, current_work: null, next_work: null, hours_this_week: 0, week_capacity: 40, ...extra,
  })

  async function openAssign() {
    await pick('Assign a person')
    return screen.findByRole('dialog', { name: 'Assign a person to "Design"' })
  }

  it('lists employees, needs one chosen, posts the assignment and refreshes the team', async () => {
    let members: unknown[] = []
    const sent: unknown[] = []
    const params: unknown[] = []
    const { onChanged } = setup({
      routes: {
        [`GET ${BASE}/team`]: () => team(members),
        'GET /users': (c: InternalAxiosRequestConfig) => { params.push({ ...c.params }); return employees },
        'GET /reports/overview': { allocation: [] },
        [`POST ${BASE}/team`]: (c: InternalAxiosRequestConfig) => { sent.push(body(c)); members = [assignee()]; return assignee() },
      },
    })
    const dialog = await openAssign()
    const submit = within(dialog).getByRole('button', { name: 'Assign' })
    expect(submit).toBeDisabled()
    expect(dialog).toHaveTextContent('Default: 2026-09-01 or today')
    expect(dialog).toHaveTextContent('Default: 2026-10-31')

    await userEvent.click(within(dialog).getByRole('combobox', { name: /Employee/ }))
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Ann Designer · Designer', 'Bo Builder',
    ])
    await userEvent.click(screen.getByRole('option', { name: /Ann Designer/ }))
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    expect(await screen.findByText('Ann Designer')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(params).toEqual([{ role: 'employee' }])
    expect(sent).toEqual([{ user_id: 'u1' }])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('opens the same dialog from the "+ Assign a person" chip', async () => {
    setup({ routes: { 'GET /users': employees, 'GET /reports/overview': { allocation: [] } } })
    await userEvent.click(await screen.findByRole('button', { name: '+ Assign a person' }))
    expect(await screen.findByRole('dialog', { name: 'Assign a person to "Design"' })).toBeInTheDocument()
  })

  it('puts the free people first, then the busy ones, each with a note on when they are free or busy', async () => {
    setup({
      routes: {
        'GET /users': { items: [person('u1', 'Ann Designer', 'Designer'), person('u2', 'Bo Builder'), person('u3', 'Cy Coder'), person('u4', 'Di Writer')], total: 4 },
        'GET /reports/overview': {
          allocation: [
            allocationRow('u1', 'Ann Designer', 'allocated', { current_work: work('Build', '2026-10-01', '2026-10-31') }),
            allocationRow('u2', 'Bo Builder', 'available'),
            allocationRow('u3', 'Cy Coder', 'available', { next_work: work('Launch', '2026-11-02', '2026-11-30') }),
            // Di is not in the report at all: no note, listed with the busy ones by name
          ],
        },
      },
    })
    const dialog = await openAssign()
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Employee/ }))
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    await waitFor(() => expect(options.map((o) => o.textContent)).toEqual([
      'Bo BuilderFree',
      'Cy CoderFree, next on Launch from Nov 2, 2026',
      'Ann Designer · DesignerBusy on Build until Oct 31, 2026',
      'Di Writer',
    ]))
  })

  it('still lists everyone, by name and without notes, when availability cannot be read', async () => {
    setup({ routes: { 'GET /users': employees, 'GET /reports/overview': apiError(403, 'forbidden', 'No access') } })
    const dialog = await openAssign()
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Employee/ }))
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Ann Designer · Designer', 'Bo Builder',
    ])
  })

  it('sends the dates when the manager picks them', async () => {
    const sent: unknown[] = []
    setup({
      routes: {
        'GET /users': employees,
        'GET /reports/overview': { allocation: [] },
        [`POST ${BASE}/team`]: (c: InternalAxiosRequestConfig) => { sent.push(body(c)); return assignee() },
      },
    })
    const dialog = await openAssign()
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Employee/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Bo Builder' }))
    await userEvent.type(within(dialog).getByLabelText('From (optional)'), '2026-10-05')
    await userEvent.type(within(dialog).getByLabelText('Until (optional)'), '2026-10-09')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(sent).toEqual([{ user_id: 'u2', start_date: '2026-10-05', end_date: '2026-10-09' }]))
  })

  it('shows the 409 overlap message in the dialog and keeps it open for another try', async () => {
    const message = "Bo Builder is already on milestone 'Build' of 'Mobile app' from 2026-10-01 to 2026-10-31. A person works one milestone per day, so choose dates outside that range."
    let attempt = 0
    const { onChanged } = setup({
      routes: {
        'GET /users': employees,
        'GET /reports/overview': { allocation: [] },
        [`POST ${BASE}/team`]: () => (++attempt === 1 ? apiError(409, 'assignment_overlap', message, [{ field: 'start_date', message: "Overlaps 'Build'" }]) : assignee()),
      },
    })
    const dialog = await openAssign()
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Employee/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Bo Builder' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))

    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()

    // the chosen person is still selected, so a second try goes through
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('says why the employee list is empty when it cannot be loaded', async () => {
    setup({ routes: { 'GET /users': apiError(500, 'server_error', 'Cannot list people right now'), 'GET /reports/overview': { allocation: [] } } })
    const dialog = await openAssign()
    expect(await within(dialog).findByText('Cannot list people right now')).toBeInTheDocument()
  })
})

describe('MilestoneCard: sign off and complete', () => {
  async function openComplete() {
    await userEvent.click(await screen.findByRole('button', { name: 'Ready to sign off' }))
    return screen.findByRole('dialog', { name: 'Complete "Design"' })
  }

  it('shows "Ready to sign off" only to a manager, when every task is done and nothing is waited for', async () => {
    const { unmount } = setup({ milestone: ALL_DONE, deliverables: doneTasks })
    expect(screen.getByRole('button', { name: 'Ready to sign off' })).toBeInTheDocument()
    unmount()

    for (const milestone of [{}, { ...ALL_DONE, blocked_by_count: 1 }, { ...ALL_DONE, status: 'completed' }, { deliverables_total: 0, deliverables_done: 0 }]) {
      const view = setup({ milestone })
      await screen.findByRole('heading', { name: 'Design' })
      expect(screen.queryByRole('button', { name: 'Ready to sign off' })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('completes from "Ready to sign off" with the review note', async () => {
    const sent: unknown[] = []
    const { onChanged } = setup({
      milestone: ALL_DONE, deliverables: doneTasks,
      routes: { [`POST ${BASE}/complete`]: (c: InternalAxiosRequestConfig) => { sent.push(body(c)); return milestoneBody({ status: 'completed' }) } },
    })
    const dialog = await openComplete()
    expect(dialog).toHaveTextContent('once you have reviewed its tasks')
    await userEvent.type(within(dialog).getByLabelText('Review note'), 'Reviewed with the client')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign off and complete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(sent).toEqual([{ review_note: 'Reviewed with the client' }])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('completes from the menu too, and sends an empty review note when none is typed', async () => {
    const sent: unknown[] = []
    setup({ milestone: ALL_DONE, routes: { [`POST ${BASE}/complete`]: (c: InternalAxiosRequestConfig) => { sent.push(body(c)); return {} } } })
    await pick('Complete milestone')
    const dialog = await screen.findByRole('dialog', { name: 'Complete "Design"' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign off and complete' }))
    await waitFor(() => expect(sent).toEqual([{ review_note: '' }]))
  })

  it('shows the server refusal in the dialog, keeps it open, and succeeds on a second try', async () => {
    let attempt = 0
    const { onChanged } = setup({
      milestone: ALL_DONE, deliverables: doneTasks,
      routes: {
        [`POST ${BASE}/complete`]: () => (++attempt === 1
          ? apiError(409, 'deliverables_incomplete', '1 task is not done yet: Mockups', [{ field: 'deliverables', message: 'Mockups' }])
          : milestoneBody({ status: 'completed' })),
      },
    })
    const dialog = await openComplete()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign off and complete' }))
    expect(await within(dialog).findByText('1 task is not done yet: Mockups')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign off and complete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(attempt).toBe(2)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('closes the dialog without completing when the manager cancels', async () => {
    const { calls } = setup({ milestone: ALL_DONE, deliverables: doneTasks })
    const dialog = await openComplete()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
  })
})

describe('MilestoneCard: cancel the milestone', () => {
  async function openCancel() {
    await pick('Cancel milestone')
    return screen.findByRole('dialog', { name: 'Cancel "Design"?' })
  }

  it('asks first, naming what each button does, and archives only after the manager confirms', async () => {
    const { calls, onChanged } = setup({ routes: { [`POST ${BASE}/archive`]: {} } })
    const dialog = await openCancel()
    expect(dialog).toHaveTextContent('Nothing is deleted')
    expect(within(dialog).getByRole('button', { name: 'Keep milestone' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel milestone' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(calls).toContain(`POST ${BASE}/archive`)
  })

  it('does nothing when the manager chooses "Keep milestone"', async () => {
    const { calls, onChanged } = setup()
    const dialog = await openCancel()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep milestone' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('shows the server reason when archiving fails', async () => {
    setup({ routes: { [`POST ${BASE}/archive`]: apiError(403, 'forbidden', 'Only the project manager can cancel a milestone') } })
    const dialog = await openCancel()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel milestone' }))
    expect(await within(dialog).findByText('Only the project manager can cancel a milestone')).toBeInTheDocument()
  })
})

describe('MilestoneCard: dependencies', () => {
  const waiting = { blocked_by: [{ id: 'd1', kind: 'milestone', item_id: 'm0', name: 'Research', project_id: 'p1', project_name: 'Website redesign', status: 'in_progress', is_done: false, schedule_conflict: false, visible: true }], blocks: [], is_blocked: true }

  it('says in the header how many things it waits for, and lists them under "Waits for"', async () => {
    setup({ milestone: { blocked_by_count: 1 }, routes: { [`GET ${BASE}/dependencies`]: waiting } })
    expect(screen.getByText('Waiting for 1')).toBeInTheDocument()
    const waits = await screen.findByRole('list', { name: 'Waits for' })
    expect(within(waits).getByText('Research')).toBeInTheDocument()
  })

  it('has no waiting tag and no dependency section when it waits for nothing', async () => {
    setup()
    await screen.findByRole('checkbox', { name: 'Wireframes' })
    expect(screen.queryByText(/^Waiting for \d/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Waits for' })).not.toBeInTheDocument()
    expect(screen.queryByText('No dependencies yet.')).not.toBeInTheDocument()
  })

  it('does not offer remove to someone who cannot manage it', async () => {
    setup({ canManage: false, routes: { [`GET ${BASE}/dependencies`]: waiting } })
    await screen.findByText('Research')
    expect(screen.queryByRole('button', { name: /Remove dependency/ })).not.toBeInTheDocument()
  })
})
