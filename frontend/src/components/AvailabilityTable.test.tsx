import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Overview } from '../api/types'
import { AvailabilityTable } from './AvailabilityTable'

type Row = Overview['allocation'][number]
const row = (over: Partial<Row>): Row => ({
  userId: 'u1', name: 'Ann Busy', jobTitle: 'Designer', managerName: 'Mia', state: 'allocated', currentWork: null, nextWork: null, hoursThisWeek: 32, weekCapacity: 40, ...over,
}) as Row
const work = { projectId: 'p1', projectName: 'Website redesign', milestoneId: 'm1', milestoneName: 'Wireframes', startDate: '2026-10-01', endDate: '2026-10-30' }

const renderIt = (allocation: Row[]) => render(<MemoryRouter><AvailabilityTable allocation={allocation} /></MemoryRouter>)

describe('AvailabilityTable', () => {
  it('shows a busy person with the milestone and project they are on, linked, and their hours this week', () => {
    renderIt([row({ currentWork: work })])
    const r = screen.getByText('Ann Busy').closest('tr') as HTMLElement
    expect(within(r).getByText('Designer')).toBeInTheDocument()
    expect(within(r).getByText('Busy')).toBeInTheDocument()
    expect(within(r).getByRole('link', { name: 'Wireframes · Website redesign' })).toHaveAttribute('href', '/projects/p1')
    expect(within(r).getByText('32 of 40 h')).toBeInTheDocument()
  })

  it('shows a free person with their next milestone, or that nothing is planned', () => {
    renderIt([
      row({ userId: 'u2', name: 'Ben Free', state: 'available', hoursThisWeek: 0, nextWork: { ...work, milestoneName: 'Build', startDate: '2026-11-02' } }),
      row({ userId: 'u3', name: 'Cy Idle', state: 'available', hoursThisWeek: 0 }),
    ])
    const ben = screen.getByText('Ben Free').closest('tr') as HTMLElement
    expect(within(ben).getByText('Free')).toBeInTheDocument()
    expect(within(ben).getByText('Next: Build from Nov 2, 2026')).toBeInTheDocument()
    const cy = screen.getByText('Cy Idle').closest('tr') as HTMLElement
    expect(within(cy).getByText('Free')).toBeInTheDocument()
    expect(within(cy).getByText('Nothing planned')).toBeInTheDocument()
  })

  it('says so when there are no employees', () => {
    renderIt([])
    expect(screen.getByRole('table', { name: 'Availability' })).toBeInTheDocument()
    expect(screen.getByText('No employees yet.')).toBeInTheDocument()
  })
})
