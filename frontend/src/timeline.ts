import type { RiskLevel } from './api/types'

// Layout maths for the timeline, kept apart from the components so it can be tested without a screen.
// Dates are 'YYYY-MM-DD' strings read as UTC days, so the browser's time zone can never shift a bar.

const DAY = 86_400_000
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Week numbers are drawn only when the range is this many days or fewer; beyond it they would crowd each other. */
const WEEKS_UP_TO_DAYS = 200

export const dayNumber = (iso: string) => Date.parse(iso.slice(0, 10)) / DAY

export interface Tick { pct: number; label: string }
/** One calendar month, as a band across the top and a tinted stripe behind the rows. */
export interface MonthBand {
  /** Where the band starts and how wide it is, as percentages of the chart (clipped to the range). */
  pct: number
  width: number
  name: string
  year: number
  /** "October 2026". */
  label: string
  /** Index of the month in the year (0 to 11), used to tint alternate months. */
  index: number
}
export interface Scale {
  /** Where a date falls along the chart, 0 to 100 (clamped). */
  pct: (iso: string) => number
  /** Where today falls, or null when it is far outside the range. */
  today: number | null
  /** Every calendar month the range touches, partial months at the ends included. */
  months: MonthBand[]
  /** The Mondays inside the range, labelled with the day of the month; empty when the range is too long for them. */
  weeks: Tick[]
  /** How many months wide the range is (fractions allowed), so the chart can be given room for each one. */
  monthCount: number
}

/** A scale that fits every span, with a little room at both ends, and today when it is near the range. */
export function buildScale(spans: { start: string; end: string }[], today: string): Scale {
  const starts = spans.map((s) => dayNumber(s.start))
  const ends = spans.map((s) => dayNumber(s.end))
  let min = starts.length ? Math.min(...starts) : dayNumber(today) - 15
  let max = ends.length ? Math.max(...ends) : dayNumber(today) + 15
  const t = dayNumber(today)
  const near = t >= min - 14 && t <= max + 14
  if (near) {
    min = Math.min(min, t)
    max = Math.max(max, t)
  }
  const pad = Math.max(2, Math.round((max - min) * 0.02))
  min -= pad
  max += pad
  const span = max - min || 1
  const pct = (iso: string) => Math.min(100, Math.max(0, ((dayNumber(iso) - min) / span) * 100))

  const first = new Date(min * DAY)
  const months: MonthBand[] = []
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); ; m += 1) {
    const year = y + Math.floor(m / 12)
    const index = ((m % 12) + 12) % 12
    const start = Date.UTC(year, index, 1) / DAY
    if (start > max) break
    const end = Date.UTC(year, index + 1, 1) / DAY
    const from = Math.max(start, min)
    const to = Math.min(end, max)
    months.push({ pct: ((from - min) / span) * 100, width: ((to - from) / span) * 100, name: MONTH_NAMES[index], year, label: `${MONTH_NAMES[index]} ${year}`, index })
  }

  const weeks: Tick[] = []
  if (span <= WEEKS_UP_TO_DAYS) {
    const firstMonday = Math.ceil((min - 4) / 7) * 7 + 4 // day 4 since the epoch (1970-01-05) was a Monday
    for (let d = firstMonday; d <= max; d += 7) weeks.push({ pct: ((d - min) / span) * 100, label: String(new Date(d * DAY).getUTCDate()) })
  }
  return { pct, today: near ? pct(today) : null, months, weeks, monthCount: span / 30.44 }
}

/** Left edge and width of a bar, as percentages; never thinner than a sliver, so a one-day milestone is still visible. */
export function barBox(scale: Scale, start: string, end: string) {
  const left = scale.pct(start)
  const right = scale.pct(end)
  return { left, width: Math.max(0.8, right - left) }
}

export type Tone = 'brand' | 'good' | 'warn' | 'bad' | 'quiet'
/** How a project's health is coloured on the timeline (the same meaning as everywhere else: green, amber, red, grey). */
export const RISK_TONE: Record<RiskLevel, Tone> = { on_track: 'good', at_risk: 'warn', overdue: 'bad', done: 'quiet' }
