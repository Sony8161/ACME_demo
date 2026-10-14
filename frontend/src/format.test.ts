import { dateRange, daysFromToday, dueIn, formatDate, formatDateTime, money, percent } from './format'

describe('format', () => {
  it('hides money the server did not send', () => {
    expect(money(null)).toBe('—')
    expect(money(61168)).toBe('$61,168')
  })

  it('shows a calendar date without any time zone shift', () => {
    expect(formatDate('2026-03-09')).toBe('Mar 9, 2026')
    expect(dateRange('2026-03-09', '2026-03-20')).toBe('Mar 9, 2026 to Mar 20, 2026')
  })

  it('shows a stored UTC moment as a date and a time of day', () => {
    expect(formatDateTime('2026-03-11T14:05:00Z')).toMatch(/^Mar 1[01], 2026, \d{1,2}:\d{2} (AM|PM)$/)
  })

  it('rounds percentages and handles missing ones', () => {
    expect(percent(33.3)).toBe('33%')
    expect(percent(null)).toBe('—')
  })
})

describe('daysFromToday', () => {
  it('counts whole calendar days, negative when the date has passed', () => {
    expect(daysFromToday('2026-10-14', '2026-10-14')).toBe(0)
    expect(daysFromToday('2026-10-15', '2026-10-14')).toBe(1)
    expect(daysFromToday('2026-10-11', '2026-10-14')).toBe(-3)
  })

  it('crosses month, year and leap-day boundaries', () => {
    expect(daysFromToday('2026-11-02', '2026-10-30')).toBe(3)
    expect(daysFromToday('2027-01-01', '2026-12-31')).toBe(1)
    expect(daysFromToday('2028-03-01', '2028-02-28')).toBe(2)
  })

  it('reads only the date part of a timestamp', () => {
    expect(daysFromToday('2026-10-15T23:59:00Z', '2026-10-14')).toBe(1)
  })

  it('defaults to the browser\'s today', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0)) // local noon, so no time zone moves the day
      expect(daysFromToday('2026-10-14')).toBe(0)
      expect(daysFromToday('2026-10-17')).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('dueIn', () => {
  const today = '2026-10-14'
  it('says how late something is, singular and plural', () => {
    expect(dueIn('2026-10-13', today)).toBe('1 day late')
    expect(dueIn('2026-10-12', today)).toBe('2 days late')
    expect(dueIn('2026-01-01', today)).toBe('286 days late')
  })

  it('says today and tomorrow in words', () => {
    expect(dueIn('2026-10-14', today)).toBe('due today')
    expect(dueIn('2026-10-15', today)).toBe('due tomorrow')
  })

  it('counts days for the next week, and stops after 7', () => {
    expect(dueIn('2026-10-16', today)).toBe('due in 2 days')
    expect(dueIn('2026-10-21', today)).toBe('due in 7 days')
    expect(dueIn('2026-10-22', today)).toBeNull()
    expect(dueIn('2027-01-01', today)).toBeNull()
  })
})
