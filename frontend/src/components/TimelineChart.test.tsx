import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TimelineChart, type TimelineRow } from './TimelineChart'

const rows: TimelineRow[] = [
  { key: 'p', label: 'Website', to: '/projects/p1', tone: 'good', start: '2026-09-01', end: '2026-11-30', sublabel: 'Maria · Sep 1 to Nov 30', summary: 'Project Website, Sep 1 to Nov 30' },
  { key: 'm', label: 'Design', indent: true, tone: 'brand', start: '2026-09-01', end: '2026-09-30', progress: 50, summary: 'Milestone Design, half done' },
  { key: 't', label: 'Wireframes', indent: true, tone: 'bad', markers: [{ date: '2026-09-20', tone: 'bad', title: 'Wireframes: due Sep 20' }], summary: 'Task Wireframes, due Sep 20' },
  { key: 'n', label: 'Press kit', indent: true, tone: 'brand', markers: [], summary: 'Task Press kit, no due date' },
]
const show = (r = rows, today = '2026-10-15') =>
  render(<MemoryRouter><TimelineChart rows={r} today={today} label="Project timeline" footer={<p>how to read it</p>} /></MemoryRouter>)

describe('TimelineChart', () => {
  it('lists every row, in order, under a named list', () => {
    show()
    const list = screen.getByRole('list', { name: 'Project timeline' })
    expect(within(list).getAllByRole('listitem').map((li) => within(li).getByText(/^(Website|Design|Wireframes|Press kit)$/).textContent)).toEqual(['Website', 'Design', 'Wireframes', 'Press kit'])
  })

  it('says in words what each picture shows, for a screen reader', () => {
    show()
    expect(screen.getByText('Project Website, Sep 1 to Nov 30')).toBeInTheDocument()
    expect(screen.getByText('Task Press kit, no due date')).toBeInTheDocument()
  })

  it('links a row to its page when it has one, and shows the extra line under the name', () => {
    show()
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/projects/p1')
    expect(screen.getByText('Maria · Sep 1 to Nov 30')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Design' })).not.toBeInTheDocument()
  })

  it('draws a bar with its dates as a tooltip, a diamond for a task, and nothing for a task with no date', () => {
    const { container } = show()
    expect(container.querySelector('[title="Design: Sep 1, 2026 to Sep 30, 2026"]')).not.toBeNull()
    expect(container.querySelector('[title="Wireframes: due Sep 20"]')).not.toBeNull()
    expect(container.querySelectorAll('[title^="Press kit"]')).toHaveLength(0)
  })

  it('names each month with its year across the top, and shows the footer', () => {
    show()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(screen.getByText('how to read it')).toBeInTheDocument()
  })

  it('marks today in the header', () => {
    show()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('numbers the weeks when the range is short, and leaves them out when it is long', () => {
    const { unmount } = show([{ key: 'a', label: 'Sprint', tone: 'brand', start: '2026-10-01', end: '2026-10-31', summary: 'Sprint' }], '2026-10-14')
    expect(screen.getByText('12')).toBeInTheDocument() // the Monday of today's week
    unmount()
    show([{ key: 'a', label: 'Year', tone: 'brand', start: '2026-01-01', end: '2026-12-31', summary: 'Year' }], '2026-06-01')
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })

  it('gives every month room, so a long range scrolls sideways instead of squeezing', () => {
    const { container } = show([{ key: 'a', label: 'Year', tone: 'brand', start: '2026-01-01', end: '2026-12-31', summary: 'Year' }], '2026-06-01')
    const widths = Array.from(container.querySelectorAll('div')).map((d) => getComputedStyle(d).minWidth).filter((w) => w.endsWith('px')).map((w) => parseInt(w, 10))
    expect(Math.max(...widths)).toBeGreaterThan(1300)
  })

  it('says so when there is nothing to show', () => {
    show([])
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument()
  })
})
