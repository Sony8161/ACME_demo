import type { Project, Task, User } from '../api/types'
import { exportFileName, peopleColumns, projectColumns, taskColumns } from './columns'

const user: User = {
  id: 'u1', username: 'al12ab', name: 'Alex Kim', email: 'alex@x.test', jobTitle: 'Developer', role: 'employee', managerId: 'm1',
  mustChangePassword: false, archivedAt: null, salary: 50.5,
}
const project = {
  id: 'p1', name: 'Website', description: '', manager: { id: 'm1', name: 'Maria Lopez' }, status: 'active', startDate: '2026-08-01',
  endDate: '2026-12-31', allocatedHours: 500, budgetAmount: 60000, completedAt: null, archivedAt: null, blockedByCount: 0,
  summary: {
    milestonesDone: 1, milestonesTotal: 3, hoursWorked: 120, totalCost: 15000, budgetPct: 25, riskLevel: 'at_risk', riskReasons: ['Spending is ahead', 'More'],
  },
} as unknown as Project
const task: Task = {
  id: 't1', milestoneId: 'ms1', name: 'Login page', description: '', done: false, status: 'in_progress', priority: 'high', dueDate: '2026-10-20',
  assigneeId: 'u1', doneAt: null, projectId: 'p1', projectName: 'Website', milestoneName: 'Build', assigneeName: 'Alex Kim', isOverdue: true, commentCount: 0,
}
const labels = (cols: { label: string }[]) => cols.map((c) => c.label)
const row = <T,>(cols: { get: (r: T) => unknown }[], r: T) => cols.map((c) => c.get(r))

describe('people columns', () => {
  const nameOf = (id: string | null) => (id === 'm1' ? 'Maria Lopez' : undefined)

  it('offers hourly cost to an admin only', () => {
    expect(labels(peopleColumns({ admin: true, nameOf }))).toEqual(['Name', 'Email', 'Job title', 'Role', 'Username', 'Reports to', 'Hourly cost'])
    expect(labels(peopleColumns({ admin: false, nameOf }))).not.toContain('Hourly cost')
  })

  it('gives the cell for each column, empty when there is nothing', () => {
    expect(row(peopleColumns({ admin: true, nameOf }), user)).toEqual(['Alex Kim', 'alex@x.test', 'Developer', 'employee', 'al12ab', 'Maria Lopez', 50.5])
    expect(row(peopleColumns({ admin: true, nameOf }), { ...user, managerId: null, salary: null, jobTitle: '' })).toEqual(['Alex Kim', 'alex@x.test', '', 'employee', 'al12ab', null, null])
  })
})

describe('project columns', () => {
  it('leaves out every money column when the server sent no money', () => {
    expect(labels(projectColumns({ money: true }))).toEqual([
      'Project', 'Manager', 'Status', 'Health', 'Start', 'End', 'Milestones done', 'Milestones total', 'Budget', 'Spent', 'Budget used %', 'Hours allocated', 'Hours worked', 'Why',
    ])
    expect(labels(projectColumns({ money: false }))).toEqual([
      'Project', 'Manager', 'Status', 'Health', 'Start', 'End', 'Milestones done', 'Milestones total', 'Hours allocated', 'Hours worked', 'Why',
    ])
  })

  it('writes dates as ISO days, health in words, and the first reason only', () => {
    expect(row(projectColumns({ money: true }), project)).toEqual([
      'Website', 'Maria Lopez', 'active', 'At risk', '2026-08-01', '2026-12-31', 1, 3, 60000, 15000, 25, 500, 120, 'Spending is ahead',
    ])
  })
})

describe('task columns', () => {
  it('writes a task as one row, late as Yes or No and a missing owner as empty', () => {
    expect(labels(taskColumns())).toEqual(['Task', 'Project', 'Milestone', 'Status', 'Priority', 'Owner', 'Due', 'Late', 'Done on'])
    expect(row(taskColumns(), task)).toEqual(['Login page', 'Website', 'Build', 'In progress', 'High', 'Alex Kim', '2026-10-20', 'Yes', null])
    expect(row(taskColumns(), { ...task, assigneeName: null, dueDate: null, isOverdue: false, status: 'done', doneAt: '2026-10-12T09:30:00Z' }))
      .toEqual(['Login page', 'Website', 'Build', 'Done', 'High', null, null, 'No', '2026-10-12'])
  })
})

describe('"Done on"', () => {
  it('is the day the task was finished where the reader is, not the UTC day', () => {
    const before = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      // 21:15 on Oct 14 in New York is already Oct 15 in UTC
      expect(row(taskColumns(), { ...task, status: 'done', doneAt: '2026-10-15T01:15:00Z' })[8]).toBe('2026-10-14')
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before
    }
  })
})

describe('exportFileName', () => {
  it('names the file after what it holds and the UTC day', () => {
    const now = new Date('2026-10-15T23:30:00Z')
    expect(exportFileName('people', now)).toBe('acme-people-2026-10-15.csv')
    expect(exportFileName('projects', now)).toBe('acme-projects-2026-10-15.csv')
    expect(exportFileName('tasks', new Date('2026-01-02T00:00:00Z'))).toBe('acme-tasks-2026-01-02.csv')
  })
})
