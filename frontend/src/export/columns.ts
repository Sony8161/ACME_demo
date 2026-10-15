import type { Project, Task, User } from '../api/types'
import { RISK_LABEL } from '../format'
import { PRIORITY_LABEL, STATUS_LABEL } from '../tasks'

/** One column of an export: its heading and how to read it from a row. Only what the screen already shows this person. */
export interface ExportColumn<T> {
  key: string
  label: string
  get: (row: T) => string | number | null
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

export function peopleColumns({ admin, nameOf }: { admin: boolean; nameOf: (id: string | null) => string | undefined }): ExportColumn<User>[] {
  const columns: ExportColumn<User>[] = [
    { key: 'name', label: 'Name', get: (u) => u.name },
    { key: 'email', label: 'Email', get: (u) => u.email },
    { key: 'jobTitle', label: 'Job title', get: (u) => u.jobTitle },
    { key: 'role', label: 'Role', get: (u) => u.role },
    { key: 'username', label: 'Username', get: (u) => u.username },
    { key: 'boss', label: 'Reports to', get: (u) => (u.managerId ? (nameOf(u.managerId) ?? null) : null) },
  ]
  if (admin) columns.push({ key: 'cost', label: 'Hourly cost', get: (u) => u.salary })
  return columns
}

export function projectColumns({ money }: { money: boolean }): ExportColumn<Project>[] {
  return [
    { key: 'name', label: 'Project', get: (p) => p.name },
    { key: 'manager', label: 'Manager', get: (p) => p.manager.name },
    { key: 'status', label: 'Status', get: (p) => p.status },
    { key: 'health', label: 'Health', get: (p) => RISK_LABEL[p.summary.riskLevel] },
    { key: 'start', label: 'Start', get: (p) => day(p.startDate) },
    { key: 'end', label: 'End', get: (p) => day(p.endDate) },
    { key: 'done', label: 'Milestones done', get: (p) => p.summary.milestonesDone },
    { key: 'total', label: 'Milestones total', get: (p) => p.summary.milestonesTotal },
    ...(money
      ? [
          { key: 'budget', label: 'Budget', get: (p: Project) => p.budgetAmount },
          { key: 'spent', label: 'Spent', get: (p: Project) => p.summary.totalCost },
          { key: 'budgetPct', label: 'Budget used %', get: (p: Project) => p.summary.budgetPct },
        ]
      : []),
    { key: 'allocated', label: 'Hours allocated', get: (p) => p.allocatedHours },
    { key: 'worked', label: 'Hours worked', get: (p) => p.summary.hoursWorked },
    { key: 'why', label: 'Why', get: (p) => p.summary.riskReasons[0] ?? null },
  ]
}

export function taskColumns(): ExportColumn<Task>[] {
  return [
    { key: 'name', label: 'Task', get: (t) => t.name },
    { key: 'project', label: 'Project', get: (t) => t.projectName },
    { key: 'milestone', label: 'Milestone', get: (t) => t.milestoneName },
    { key: 'status', label: 'Status', get: (t) => STATUS_LABEL[t.status] },
    { key: 'priority', label: 'Priority', get: (t) => PRIORITY_LABEL[t.priority] },
    { key: 'owner', label: 'Owner', get: (t) => t.assigneeName },
    { key: 'due', label: 'Due', get: (t) => day(t.dueDate) },
    { key: 'late', label: 'Late', get: (t) => (t.isOverdue ? 'Yes' : 'No') },
    { key: 'doneOn', label: 'Done on', get: (t) => (t.doneAt ? new Date(t.doneAt).toLocaleDateString('en-CA') : null) },
  ]
}

/** `acme-people-2026-10-15.csv`: what it holds and the UTC day it was made. */
export function exportFileName(kind: 'people' | 'projects' | 'tasks', now: Date = new Date()): string {
  return `acme-${kind}-${now.toISOString().slice(0, 10)}.csv`
}
