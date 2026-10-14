import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Project } from '../api/types'
import { ProjectCard } from './ProjectCard'

const project = (summary: Partial<Project['summary']> = {}): Project => ({
  id: 'p1', name: 'Apollo', description: '', manager: { id: 'm1', name: 'Maya Chen' }, status: 'active',
  startDate: '2026-03-02', endDate: '2026-06-26', allocatedHours: 400, budgetAmount: 100000, completedAt: null, archivedAt: null, blockedByCount: 0,
  summary: {
    daysTotal: 100, daysElapsed: 40, daysRemaining: 60, schedulePct: 40, hoursWorked: 100, hoursRemaining: 300, expectedHours: 320, hoursPct: 25,
    milestonesTotal: 5, milestonesDone: 2, milestonesOverdue: 0, milestonesPct: 40, teamSize: 4, riskLevel: 'on_track', riskReasons: [],
    laborCost: 30000, forecastCost: 80000, otherCost: 5000, totalCost: 35000, budgetRemaining: 65000, budgetPct: 35, ...summary,
  },
})

const renderCard = (p: Project) => render(<MemoryRouter><ProjectCard project={p} /></MemoryRouter>)

describe('ProjectCard', () => {
  it('shows the project as one row: the name is the only link, then health, one facts line and the progress bar', () => {
    renderCard(project())
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/projects/p1')
    expect(link).toHaveTextContent('Apollo')
    expect(screen.getByText('On track')).toBeInTheDocument()
    expect(screen.getByText('Maya Chen · 2 of 5 milestones · ends Jun 26, 2026 · 35% of budget used')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName('Work done 40 percent, calendar elapsed 40 percent')
  })

  it('says when the project waits for other projects', () => {
    render(<MemoryRouter><ProjectCard project={{ ...project(), blockedByCount: 2 }} /></MemoryRouter>)
    expect(screen.getByText('Waiting for 2')).toBeInTheDocument()
  })

  it('has no "Waiting for" chip when nothing is waited on', () => {
    renderCard(project())
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
  })

  it('leaves the budget figure out of the facts when the server sent no money (employees)', () => {
    renderCard(project({ totalCost: null, budgetPct: null, laborCost: null }))
    expect(screen.getByText('Maya Chen · 2 of 5 milestones · ends Jun 26, 2026')).toBeInTheDocument()
    expect(screen.queryByText(/budget/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('shows only the first reason behind the health when there is one', () => {
    renderCard(project({ riskLevel: 'at_risk', riskReasons: ['Work is behind the calendar'] }))
    expect(screen.getByText('At risk')).toBeInTheDocument()
    expect(screen.getByText('Work is behind the calendar')).toBeInTheDocument()
  })

  it('shows the first reason and counts the rest', () => {
    renderCard(project({ riskLevel: 'overdue', riskReasons: ['2 milestones are past due', 'Hours are running ahead', 'Over budget'] }))
    expect(screen.getByText('2 milestones are past due (+2 more)')).toBeInTheDocument()
    expect(screen.queryByText(/Over budget/)).not.toBeInTheDocument()
  })

  it('shows no reason line for a healthy project', () => {
    renderCard(project())
    expect(screen.queryByText(/more\)/)).not.toBeInTheDocument()
  })

  it('shows a project with no milestones as 0 of 0', () => {
    renderCard(project({ milestonesTotal: 0, milestonesDone: 0, milestonesPct: null }))
    expect(screen.getByText(/0 of 0 milestones/)).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName('Work done 0 percent, calendar elapsed 40 percent')
  })
})
