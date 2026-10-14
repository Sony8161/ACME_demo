import { moreFor, navFor } from './nav'

describe('navFor', () => {
  it('gives an employee one place: their own work (their tasks are a section of it)', () => {
    expect(navFor('employee')).toEqual([{ label: 'My work', to: '/my-work', icon: 'work' }])
  })

  it.each(['manager', 'admin'] as const)('gives a %s the dashboard, projects and people (the timeline is a view of projects)', (role) => {
    expect(navFor(role).map((i) => i.to)).toEqual(['/dashboard', '/projects', '/people'])
    expect(navFor(role).map((i) => i.label)).toEqual(['Dashboard', 'Projects', 'People'])
  })

  it('never has more than three entries, so the phone bar with "More" stays at four', () => {
    for (const role of ['employee', 'manager', 'admin'] as const) {
      expect(navFor(role).length + (moreFor(role).length > 0 ? 1 : 0)).toBeLessThanOrEqual(4)
    }
  })
})

describe('moreFor', () => {
  it('puts the history and the archive under "More" for an admin', () => {
    expect(moreFor('admin').map((i) => [i.label, i.to])).toEqual([['History', '/history'], ['Archive', '/archive']])
  })

  it('gives managers and employees nothing under "More"', () => {
    expect(moreFor('manager')).toEqual([])
    expect(moreFor('employee')).toEqual([])
  })

  it('does not repeat an entry that is already on the bar', () => {
    const onBar = new Set(navFor('admin').map((i) => i.to))
    expect(moreFor('admin').some((i) => onBar.has(i.to))).toBe(false)
  })
})
