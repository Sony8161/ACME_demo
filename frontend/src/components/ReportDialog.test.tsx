import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Milestone, Project } from '../api/types'
import { saveBlob } from '../export/download'
import { buildProjectReport } from '../export/pdf'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { ReportDialog } from './ReportDialog'
import { ToastProvider } from './ToastProvider'

vi.mock('../export/download', () => ({ saveBlob: vi.fn() }))
vi.mock('../export/pdf', async (original) => ({ ...(await original<typeof import('../export/pdf')>()), buildProjectReport: vi.fn() }))

const project = { id: 'p1', name: 'Website redesign' } as unknown as Project
const milestones = [{ id: 'm1', name: 'Design' }] as unknown as Milestone[]
const pdf = new Blob(['%PDF-'], { type: 'application/pdf' })
const tasks = { items: [{ id: 't1', name: 'Wireframes', milestone_name: 'Design', status: 'todo', priority: 'medium', assignee_name: null, due_date: null }], total: 1 }
const team = { items: [], total: 0, hours_worked: 0, labor_cost: 0, expected_hours: 0, expected_cost: 0 }
const costs = { items: [], total: 0, other_cost: 0, labor_cost: 0, total_cost: 0, budget_amount: 1000, budget_remaining: 1000 }
const history = { items: [{ id: 1, occurred_at: '2026-10-12T09:30:00Z', actor_name: 'Maria', summary: 'Created project', changes: [] }], total: 1, page: 1, page_size: 100 }

function open(over: Partial<{ money: boolean; manages: boolean; onClose: () => void }> = {}) {
  const onClose = over.onClose ?? vi.fn()
  render(<ToastProvider><ReportDialog open project={project} milestones={milestones} money={over.money ?? true} manages={over.manages ?? true} onClose={onClose} /></ToastProvider>)
  return { onClose }
}
const routes = (extra: Record<string, unknown> = {}) => mockRoutes({
  'GET /projects/p1/tasks': tasks, 'GET /projects/p1/team': team, 'GET /projects/p1/costs': costs, 'GET /projects/p1/history': history, ...extra,
})

beforeEach(() => { vi.mocked(saveBlob).mockClear(); vi.mocked(buildProjectReport).mockReset(); vi.mocked(buildProjectReport).mockResolvedValue(pdf) })
afterEach(restoreApi)

describe('ReportDialog', () => {
  it('lists the sections: Summary always on, the rest on to start, Costs and History only for those who may see them', async () => {
    open()
    const dialog = await screen.findByRole('dialog', { name: 'Project report' })
    expect(within(dialog).getByRole('checkbox', { name: 'Summary' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Summary' })).toBeDisabled()
    for (const name of ['Milestones', 'Tasks', 'Team', 'Costs', 'History']) expect(within(dialog).getByRole('checkbox', { name })).toBeChecked()
  })

  it('leaves out Costs when there is no money to see and History when the person does not manage the project', async () => {
    open({ money: false, manages: false })
    const dialog = await screen.findByRole('dialog', { name: 'Project report' })
    expect(within(dialog).queryByRole('checkbox', { name: 'Costs' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'History' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('asks the server only for the ticked sections, builds the report and saves it under a dated name', async () => {
    const calls = routes()
    const { onClose } = open()
    const dialog = await screen.findByRole('dialog', { name: 'Project report' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Tasks' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'History' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }))
    await vi.waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
    expect(calls.sort()).toEqual(['GET /projects/p1/costs', 'GET /projects/p1/team'])
    const [data, sections] = vi.mocked(buildProjectReport).mock.calls[0]
    expect(sections).toEqual(['milestones', 'team', 'costs'])
    expect(data.project).toBe(project)
    expect(data.milestones).toBe(milestones)
    expect(data.tasks).toBeUndefined()
    expect(data.money).toBe(true)
    expect(vi.mocked(saveBlob).mock.calls[0][0]).toMatch(/^acme-report-website-redesign-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('asks for the latest hundred history entries', async () => {
    const calls = mockRoutes({ 'GET /projects/p1/history': history, 'GET /projects/p1/tasks': tasks, 'GET /projects/p1/team': team, 'GET /projects/p1/costs': costs })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    await vi.waitFor(() => expect(saveBlob).toHaveBeenCalled())
    expect(calls).toContain('GET /projects/p1/history')
    expect(vi.mocked(buildProjectReport).mock.calls[0][0].history).toHaveLength(1)
  })

  it('still saves the report when one section is refused, and says which one was left out and why', async () => {
    routes({ 'GET /projects/p1/costs': apiError(403, 'forbidden', 'You may not see costs') })
    const { onClose } = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    await vi.waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
    expect(vi.mocked(buildProjectReport).mock.calls[0][0].costs).toBeUndefined()
    const dialog = screen.getByRole('dialog', { name: 'Project report' })
    expect(await within(dialog).findByText(/Saved\. Left out: Costs \(You may not see costs\)/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled() // stays open so the message can be read
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a message and saves nothing when the PDF cannot be built, and can be tried again', async () => {
    routes()
    vi.mocked(buildProjectReport).mockRejectedValue(new Error('boom'))
    const { onClose } = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    expect(await screen.findByText('The report could not be made.')).toBeInTheDocument()
    expect(saveBlob).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
  })

  it('shows Preparing… while it works', async () => {
    routes()
    let finish: (b: Blob) => void = () => {}
    vi.mocked(buildProjectReport).mockReturnValue(new Promise<Blob>((resolve) => { finish = resolve }))
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    expect(await screen.findByRole('button', { name: 'Preparing…' })).toBeDisabled()
    finish(pdf)
    await vi.waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
  })
})
