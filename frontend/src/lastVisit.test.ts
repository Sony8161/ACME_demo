import { markVisited, readLastVisit } from './lastVisit'

const NOW = new Date('2026-10-15T09:00:00Z')

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('lastVisit', () => {
  it('looks back seven days the first time', () => {
    expect(readLastVisit('u1', NOW).toISOString()).toBe('2026-10-08T09:00:00.000Z')
  })

  it('remembers the moment it was marked, for that person only', () => {
    markVisited('u1', new Date('2026-10-14T18:30:00Z'))
    expect(readLastVisit('u1', NOW).toISOString()).toBe('2026-10-14T18:30:00.000Z')
    expect(readLastVisit('u2', NOW).toISOString()).toBe('2026-10-08T09:00:00.000Z') // a different person on this browser starts fresh
  })

  it('ignores a stored value that is not a date', () => {
    localStorage.setItem('pm.lastVisit.u1', 'yesterday-ish')
    expect(readLastVisit('u1', NOW).toISOString()).toBe('2026-10-08T09:00:00.000Z')
  })

  it('copes with storage that refuses reads or writes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readLastVisit('u1', NOW).toISOString()).toBe('2026-10-08T09:00:00.000Z')
    expect(() => markVisited('u1', NOW)).not.toThrow()
  })
})
