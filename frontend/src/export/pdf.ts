import type { jsPDF } from 'jspdf'
import type { AssigneeList, AuditEntry, CostList, Milestone, Project, Task } from '../api/types'
import { RISK_LABEL, formatDate, money, percent } from '../format'
import { PRIORITY_LABEL, STATUS_LABEL } from '../tasks'

type Cell = string | number | null

/** What the PDF's built-in font can draw is Latin-1; typographic marks become their plain equivalents, anything else a question mark. */
const PLAIN: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"', '…': '...', '•': '·', '€': 'EUR', '™': '(TM)', ' ': ' ',
}
export function pdfText(value: Cell | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[–—‘’‚“”„…•€™ ]/g, (c) => PLAIN[c]).replace(/[^\n\x20-\x7e\xa1-\xff]/g, '?')
}

const TEAL: [number, number, number] = [8, 112, 105]
const MARGIN = 40

/** Both libraries are fetched only when a PDF is asked for, so nobody else pays for them. */
async function libraries() {
  const [{ jsPDF: Doc }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { Doc, autoTable }
}

/** "Page 1 of 3" (or a label with it) at the foot of every page. */
function footers(doc: jsPDF, label: (page: number, pages: number) => string): void {
  const pages = doc.getNumberOfPages()
  const { width, height } = doc.internal.pageSize
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(110)
    doc.text(pdfText(label(page, pages)), width - MARGIN, height - 20, { align: 'right' })
  }
}

/** A list as a landscape A4 table, headings repeated on every page. */
export async function buildTablePdf(opts: { title: string; subtitle: string; head: string[]; rows: Cell[][] }): Promise<Blob> {
  const { Doc, autoTable } = await libraries()
  const doc = new Doc({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(pdfText(opts.title), MARGIN, 44)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(pdfText(opts.subtitle), MARGIN, 62)
  if (opts.rows.length === 0) {
    doc.text('Nothing to show.', MARGIN, 90)
  } else {
    autoTable(doc, {
      startY: 76, head: [opts.head.map(pdfText)], body: opts.rows.map((r) => r.map(pdfText)),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, overflow: 'linebreak' }, headStyles: { fillColor: TEAL },
      margin: { left: MARGIN, right: MARGIN, bottom: 40 }, showHead: 'everyPage',
    })
  }
  footers(doc, (page, pages) => `Page ${page} of ${pages}`)
  return doc.output('blob')
}

export type ReportSection = 'milestones' | 'tasks' | 'team' | 'costs' | 'history'

export interface ReportData {
  project: Project
  milestones?: Milestone[]
  tasks?: Task[]
  team?: AssigneeList
  costs?: CostList
  history?: AuditEntry[]
  /** Whether this person may see money. Nothing about cost, budget or rates is written when it is false. */
  money: boolean
}

const when = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, ' ')

/** The project report: a summary page, then one headed table per ticked section. */
export async function buildProjectReport(data: ReportData, sections: ReportSection[]): Promise<Blob> {
  const { Doc, autoTable } = await libraries()
  const { project, money: seeMoney } = data
  const s = project.summary
  const doc = new Doc({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const grid = { styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, overflow: 'linebreak' as const }, margin: { left: MARGIN, right: MARGIN, bottom: 40 } }
  const last = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80
  let y = 0

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(pdfText(project.name), MARGIN, 48)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(pdfText(`Project report · ${new Date().toISOString().slice(0, 10)} UTC`), MARGIN, 66)

  const facts: Cell[][] = [
    ['Manager', project.manager.name],
    ['Status', cap(project.status)],
    ['Health', RISK_LABEL[s.riskLevel]],
    ['Dates', `${formatDate(project.startDate)} to ${formatDate(project.endDate)}`],
    ['Days left', s.daysRemaining],
    ['Progress', `${s.milestonesDone} of ${s.milestonesTotal} milestones done`],
    ['Hours', `${Math.round(s.hoursWorked)} worked of ${Math.round(project.allocatedHours)} allocated`],
    ['Team size', s.teamSize],
  ]
  if (seeMoney) {
    facts.push(['Budget', project.budgetAmount === null ? null : money(project.budgetAmount)])
    facts.push(['Spent', s.totalCost === null ? null : `${money(s.totalCost)} (${percent(s.budgetPct)} of the budget)`])
    facts.push(['Left', s.budgetRemaining === null ? null : money(s.budgetRemaining)])
  }
  if (s.riskReasons.length > 0) facts.push(['Why', s.riskReasons.join('\n')])
  autoTable(doc, { startY: 80, body: facts.map((r) => r.map(pdfText)), theme: 'plain', columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } }, ...grid })
  y = last() + 24

  const section = (title: string, head: string[], rows: Cell[][]) => {
    if (y > doc.internal.pageSize.height - 110) { doc.addPage(); y = 48 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0)
    doc.text(title, MARGIN, y)
    autoTable(doc, {
      startY: y + 8, head: [head.map(pdfText)], body: (rows.length ? rows : [['Nothing here.']]).map((r) => r.map(pdfText)),
      headStyles: { fillColor: TEAL }, showHead: 'everyPage', ...grid,
    })
    y = last() + 24
  }

  if (sections.includes('milestones') && data.milestones) {
    section('Milestones', ['Milestone', 'Status', 'Dates', 'Tasks', 'Hours', ...(seeMoney ? ['Cost'] : [])], data.milestones.map((m) => [
      m.name, cap(m.status), `${formatDate(m.startDate)} to ${formatDate(m.dueDate)}`, `${m.deliverablesDone} of ${m.deliverablesTotal}`,
      `${Math.round(m.hoursWorked)} / ${Math.round(m.allocatedHours)}`,
      ...(seeMoney ? [`${m.laborCost === null ? '—' : money(m.laborCost)} / ${m.budgetAmount === null ? '—' : money(m.budgetAmount)}`] : []),
    ]))
  }
  if (sections.includes('tasks') && data.tasks) {
    section('Tasks', ['Task', 'Milestone', 'Status', 'Priority', 'Owner', 'Due'], data.tasks.map((t) => [
      t.name, t.milestoneName, STATUS_LABEL[t.status], PRIORITY_LABEL[t.priority], t.assigneeName ?? 'Unassigned', t.dueDate ? formatDate(t.dueDate) : '—',
    ]))
  }
  if (sections.includes('team') && data.team) {
    section('Team', ['Person', 'Milestone', 'From', 'To', 'Days', 'Hours', ...(seeMoney ? ['Cost so far'] : [])], data.team.items.map((a) => [
      a.name, a.milestoneName, formatDate(a.startDate), formatDate(a.endDate), a.daysWorked, Math.round(a.hoursWorked),
      ...(seeMoney ? [a.laborCost === null ? '—' : money(a.laborCost)] : []),
    ]))
  }
  if (sections.includes('costs') && seeMoney && data.costs) {
    const c = data.costs
    section('Costs', ['Date', 'Category', 'Description', 'Amount'], [
      ...c.items.map((i) => [formatDate(i.incurredOn), cap(i.category), i.description, money(i.amount)]),
      ['', '', 'Other costs', money(c.otherCost)], ['', '', 'Labor so far', money(c.laborCost)], ['', '', 'Total spent', money(c.totalCost)],
      ['', '', 'Budget', money(c.budgetAmount)], ['', '', 'Left', money(c.budgetRemaining)],
    ])
  }
  if (sections.includes('history') && data.history) {
    section('History', ['When (UTC)', 'Who', 'What'], data.history.map((h) => [when(h.occurredAt), h.actorName, h.summary]))
  }

  footers(doc, (page, pages) => `ACME Projects · ${project.name} · page ${page} of ${pages}`)
  return doc.output('blob')
}

/** `acme-report-website-redesign-2026-10-15.pdf` */
export function reportFileName(projectName: string, now: Date = new Date()): string {
  const slug = projectName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
  return `acme-report-${slug}-${now.toISOString().slice(0, 10)}.pdf`
}
