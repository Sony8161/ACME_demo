import type { AssigneeList, AuditEntry, CostList, Milestone, Project, Task } from '../api/types'
import { buildProjectReport, buildTablePdf, pdfText, reportFileName } from './pdf'

/** The PDF as text (jsPDF does not compress, so strings drawn on the page can be found in it). A PDF string escapes its brackets; read them back. */
async function raw(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer())).replace(/\\([()])/g, '$1')
}
const pages = (pdf: string) => (pdf.match(/\/Type \/Page\b(?!s)/g) ?? []).length

describe('pdfText', () => {
  it('keeps accented Latin text and turns typographic marks into their plain equivalents', () => {
    expect(pdfText('Zoë Müller – “quoted” • €5 … ok’s')).toBe('Zoë Müller - "quoted" · EUR5 ... ok\'s')
  })

  it('replaces what the PDF font cannot draw with a question mark, and writes nothing for null', () => {
    expect(pdfText('漢字')).toBe('??')
    expect(pdfText('漢字 Жук')).toBe('?? ???')
    expect(pdfText(null)).toBe('')
    expect(pdfText(12.5)).toBe('12.5')
  })
})

describe('buildTablePdf', () => {
  it('makes a real PDF holding the title, the subtitle, the headings and the cells', async () => {
    const blob = await buildTablePdf({ title: 'People', subtitle: '2 people · 2026-10-15 UTC', head: ['Name', 'Role'], rows: [['Alex Kim', 'employee'], ['Maria Lopez', 'manager']] })
    expect(blob.type).toBe('application/pdf')
    const pdf = await raw(blob)
    expect(pdf.startsWith('%PDF-')).toBe(true)
    for (const text of ['People', '2 people', 'Name', 'Role', 'Alex Kim', 'Maria Lopez', 'manager']) expect(pdf).toContain(text)
    expect(await raw(await buildTablePdf({ title: 'T', subtitle: 's', head: ['Name'], rows: [['Zoë']] }))).toContain('Zo\u00eb') // an accent survives as one byte
    expect(pdf).toContain('Page 1 of 1')
  })

  it('continues on new pages for a long list, and numbers them', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Person ${i + 1}`, 'employee'])
    const pdf = await raw(await buildTablePdf({ title: 'People', subtitle: '120 people', head: ['Name', 'Role'], rows }))
    expect(pages(pdf)).toBeGreaterThan(1)
    expect(pdf).toMatch(/Page 1 of \d+/)
    expect(pdf).toContain('Person 120')
  })

  it('says so on the page when there is nothing to show', async () => {
    const pdf = await raw(await buildTablePdf({ title: 'Tasks', subtitle: '0 tasks', head: ['Task'], rows: [] }))
    expect(pdf).toContain('Nothing to show.')
  })

  it('writes text it cannot draw as question marks instead of garbage', async () => {
    const pdf = await raw(await buildTablePdf({ title: 'People', subtitle: 's', head: ['Name'], rows: [['漢字 Alex']] }))
    expect(pdf).toContain('?? Alex')
  })
})

const project = {
  id: 'p1', name: 'Data Platform', description: '', manager: { id: 'm1', name: 'James Carter' }, status: 'active', startDate: '2026-09-15',
  endDate: '2026-12-14', allocatedHours: 900, budgetAmount: 30000, completedAt: null, archivedAt: null, blockedByCount: 0,
  summary: {
    daysRemaining: 60, schedulePct: 34, hoursWorked: 120, milestonesDone: 1, milestonesTotal: 2, teamSize: 1, riskLevel: 'at_risk',
    riskReasons: ['Spending (77%) is ahead of the calendar (34%)', 'Planned staffing will cost $4,000 more than the budget'],
    totalCost: 23000, budgetPct: 77, budgetRemaining: 7000,
  },
} as unknown as Project
const milestones = [{
  id: 'ms1', name: 'Cut-over', status: 'in_progress', startDate: '2026-10-06', dueDate: '2026-12-14', deliverablesDone: 1, deliverablesTotal: 2,
  allocatedHours: 600, hoursWorked: 40, budgetAmount: 20000, laborCost: 3000, isOverdue: false,
}] as unknown as Milestone[]
const tasks = [{ id: 't1', name: 'Data copied', milestoneName: 'Cut-over', status: 'in_progress', priority: 'high', assigneeName: 'Omar Haddad', dueDate: '2026-10-25' }] as unknown as Task[]
const team = { items: [{ name: 'Omar Haddad', milestoneName: 'Cut-over', startDate: '2026-10-06', endDate: '2026-12-14', daysWorked: 8, hoursWorked: 64, laborCost: 3840 }], total: 1 } as unknown as AssigneeList
const costs = { items: [{ id: 'c1', category: 'license', description: 'Warehouse licences', amount: 12000, incurredOn: '2026-09-25' }], total: 1, otherCost: 12000, laborCost: 11000, totalCost: 23000, budgetAmount: 30000, budgetRemaining: 7000 } as unknown as CostList
const history = [{ id: 1, occurredAt: '2026-10-12T09:30:00Z', actorName: 'Maria Lopez', summary: 'Created project Data Platform' }] as unknown as AuditEntry[]
const all = { project, milestones, tasks, team, costs, history, money: true }

describe('buildProjectReport', () => {
  it('with only the summary: the project, its manager, dates and every reason it is at risk', async () => {
    const pdf = await raw(await buildProjectReport(all, []))
    expect(pages(pdf)).toBe(1)
    for (const text of ['Data Platform', 'James Carter', 'At risk', 'Spending (77%) is ahead of the calendar (34%)', 'Planned staffing will cost $4,000 more than the budget', 'Sep 15, 2026', 'Dec 14, 2026']) expect(pdf).toContain(text)
    for (const heading of ['Milestones', 'Tasks', 'Team', 'Costs', 'History']) expect(pdf).not.toContain(`(${heading})`)
  })

  it('adds a headed section for each ticked part, with its rows', async () => {
    const pdf = await raw(await buildProjectReport(all, ['milestones', 'tasks', 'team', 'costs', 'history']))
    for (const text of ['Cut-over', 'Data copied', 'Omar Haddad', 'Warehouse licences', '$12,000', 'Maria Lopez', 'Created project Data Platform']) expect(pdf).toContain(text)
    for (const heading of ['Milestones', 'Tasks', 'Team', 'Costs', 'History']) expect(pdf).toContain(`(${heading})`)
  })

  it('leaves money out when the person may not see it, even if costs were passed in', async () => {
    const pdf = await raw(await buildProjectReport({ ...all, money: false, project: { ...project, budgetAmount: null, summary: { ...project.summary, totalCost: null, budgetPct: null } } as Project }, ['milestones', 'team', 'costs']))
    expect(pdf).not.toContain('(Costs)')
    expect(pdf).not.toContain('Warehouse licences')
    expect(pdf).not.toContain('$30,000')
    expect(pdf).not.toContain('3,840')
    expect(pdf).toContain('Cut-over')
  })

  it('skips a section whose data was not given, instead of failing', async () => {
    const pdf = await raw(await buildProjectReport({ project, milestones, money: true }, ['tasks', 'history']))
    expect(pdf).not.toContain('(Tasks)')
    expect(pdf).not.toContain('(History)')
  })

  it('numbers every page with the project name', async () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ ...tasks[0], id: `t${i}`, name: `Task ${i + 1}` })) as unknown as Task[]
    const pdf = await raw(await buildProjectReport({ ...all, tasks: many }, ['tasks']))
    expect(pages(pdf)).toBeGreaterThan(1)
    expect(pdf).toMatch(/ACME Projects . Data Platform . page 1 of \d+/)
  })
})

describe('reportFileName', () => {
  it('turns the project name into a safe file name', () => {
    expect(reportFileName('Website Redesign!', new Date('2026-10-15T08:00:00Z'))).toBe('acme-report-website-redesign-2026-10-15.pdf')
    expect(reportFileName('  Ünïcode / Tést ', new Date('2026-01-02T00:00:00Z'))).toBe('acme-report-unicode-test-2026-01-02.pdf')
    expect(reportFileName('!!!', new Date('2026-01-02T00:00:00Z'))).toBe('acme-report-project-2026-01-02.pdf')
  })
})
