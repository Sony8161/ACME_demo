import { barBox, buildScale, dayNumber, RISK_TONE } from './timeline'

describe('dayNumber', () => {
  it('counts whole UTC days, so a time zone cannot move a bar', () => {
    expect(dayNumber('2026-03-02') - dayNumber('2026-03-01')).toBe(1)
    expect(dayNumber('2026-03-01T23:59:00Z')).toBe(dayNumber('2026-03-01'))
  })
})

describe('buildScale', () => {
  const spans = [{ start: '2026-09-01', end: '2026-11-30' }]

  it('places dates in order along the chart, with a little room at both ends', () => {
    const s = buildScale(spans, '2026-10-15')
    expect(s.pct('2026-09-01')).toBeGreaterThan(0)
    expect(s.pct('2026-09-01')).toBeLessThan(s.pct('2026-10-15'))
    expect(s.pct('2026-10-15')).toBeLessThan(s.pct('2026-11-30'))
    expect(s.pct('2026-11-30')).toBeLessThan(100)
  })

  it('clamps a date outside the range instead of drawing off the chart', () => {
    const s = buildScale(spans, '2026-10-15')
    expect(s.pct('2020-01-01')).toBe(0)
    expect(s.pct('2040-01-01')).toBe(100)
  })

  it('marks today when it is inside or near the range, and leaves it out when it is far away', () => {
    expect(buildScale(spans, '2026-10-15').today).not.toBeNull()
    expect(buildScale(spans, '2026-12-05').today).not.toBeNull() // within two weeks of the end
    expect(buildScale(spans, '2027-06-01').today).toBeNull()
    expect(buildScale(spans, '2025-01-01').today).toBeNull()
  })

  it('stretches the range to include today when today is just outside it', () => {
    const near = buildScale(spans, '2026-12-05')
    expect(near.pct('2026-12-05')).toBeGreaterThan(near.pct('2026-11-30'))
  })

  it('labels each month start, with the year on the first and on every January', () => {
    const labels = buildScale([{ start: '2026-11-10', end: '2027-02-20' }], '2026-12-01').ticks.map((t) => t.label)
    expect(labels).toEqual(['Dec 2026', 'Jan 2027', 'Feb'])
  })

  it('thins the labels to every third month when the range is long', () => {
    const ticks = buildScale([{ start: '2024-01-15', end: '2026-12-15' }], '2025-06-01').ticks
    expect(ticks.length).toBeLessThanOrEqual(14)
    expect(ticks.length).toBeGreaterThan(8)
  })

  it('still draws something when there is nothing to show', () => {
    const s = buildScale([], '2026-10-15')
    expect(s.today).not.toBeNull()
    expect(s.ticks.length).toBeGreaterThan(0)
  })
})

describe('barBox', () => {
  it('runs from the start to the end of the span', () => {
    const s = buildScale([{ start: '2026-09-01', end: '2026-09-30' }], '2026-09-15')
    const box = barBox(s, '2026-09-01', '2026-09-30')
    expect(box.left).toBeCloseTo(s.pct('2026-09-01'))
    expect(box.left + box.width).toBeCloseTo(s.pct('2026-09-30'))
  })

  it('keeps a one-day span visible', () => {
    const s = buildScale([{ start: '2026-09-01', end: '2027-09-01' }], '2026-09-15')
    expect(barBox(s, '2026-09-10', '2026-09-10').width).toBeGreaterThanOrEqual(0.8)
  })
})

describe('RISK_TONE', () => {
  it('uses the same meaning of colour as the rest of the app', () => {
    expect(RISK_TONE).toEqual({ on_track: 'good', at_risk: 'warn', overdue: 'bad', done: 'quiet' })
  })
})
