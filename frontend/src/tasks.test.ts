import type { Task } from './api/types'
import { canMove, initials } from './tasks'

const task = (over: Partial<Task> = {}) => ({ id: 't1', status: 'todo', assigneeId: 'u1', ...over }) as Task

describe('canMove', () => {
  it('lets a manager or admin move any task anywhere else', () => {
    const who = { canManage: true, userId: 'm1' }
    expect(canMove(task(), 'in_progress', who)).toBe(true)
    expect(canMove(task(), 'done', who)).toBe(true)
    expect(canMove(task({ status: 'done' }), 'todo', who)).toBe(true)
  })

  it('never offers the column the task is already in', () => {
    expect(canMove(task({ status: 'in_progress' }), 'in_progress', { canManage: true, userId: 'm1' })).toBe(false)
  })

  it('lets an owner start and pause their own task, but not finish it', () => {
    const who = { canManage: false, userId: 'u1' }
    expect(canMove(task(), 'in_progress', who)).toBe(true)
    expect(canMove(task({ status: 'in_progress' }), 'todo', who)).toBe(true)
    expect(canMove(task(), 'done', who)).toBe(false)
  })

  it('stops an owner from reopening reviewed work, and anyone else from touching a task that is not theirs', () => {
    expect(canMove(task({ status: 'done' }), 'in_progress', { canManage: false, userId: 'u1' })).toBe(false)
    expect(canMove(task(), 'in_progress', { canManage: false, userId: 'u2' })).toBe(false)
    expect(canMove(task({ assigneeId: null }), 'in_progress', { canManage: false, userId: 'u1' })).toBe(false)
    expect(canMove(task(), 'in_progress', { canManage: false, userId: undefined })).toBe(false)
  })
})

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Alex Kim')).toBe('AK')
    expect(initials('  priya   shah  rao ')).toBe('PS')
    expect(initials('Cher')).toBe('C')
  })
})
