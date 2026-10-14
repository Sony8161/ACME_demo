import type { Task, TaskPriority, TaskStatus } from './api/types'

export const COLUMNS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }
export const PRIORITY_LABEL: Record<TaskPriority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: 'error.main', high: 'warning.main', medium: 'primary.light', low: 'text.disabled',
}

export interface Actor {
  /** Admin, or the manager of the project (and the project is still open). */
  canManage: boolean
  userId: string | undefined
}

/**
 * Whether the signed-in person may move this task to `to`. The server enforces the same rule: a manager or admin can move
 * anything anywhere; an employee can only start or pause a task that is theirs, because a manager reviews and finishes work.
 */
export function canMove(task: Task, to: TaskStatus, who: Actor): boolean {
  if (task.status === to) return false
  if (who.canManage) return true
  return task.assigneeId !== null && task.assigneeId === who.userId && task.status !== 'done' && to !== 'done'
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
