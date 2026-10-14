import { navFor } from './nav'

describe('navFor', () => {
  it('gives an employee their own work and their own tasks', () => {
    expect(navFor('employee')).toEqual([
      { label: 'My work', to: '/my-work', icon: 'work' },
      { label: 'My tasks', to: '/my-tasks', icon: 'tasks' },
    ])
  })

  it('gives a manager the dashboard, projects and people, but no archive', () => {
    expect(navFor('manager').map((i) => i.to)).toEqual(['/dashboard', '/projects', '/people'])
  })

  it('gives an admin everything a manager has plus the history and the archive', () => {
    expect(navFor('admin').map((i) => i.label)).toEqual(['Dashboard', 'Projects', 'People', 'History', 'Archive'])
  })
})
