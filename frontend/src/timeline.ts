import type { RiskLevel } from './api/types'

// Layout maths for the timeline, kept apart from the components so it can be tested without a screen.
// Dates are 'YYYY-MM-DD' strings read as UTC days, so the browser's time zone can never shift a bar.

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const dayNumber = (iso: string) => Date.parse(iso.slice(0, 10)) / DAY

export interface Tick { pct: number; label: string }
export interface Scale {
  /** Where a date falls along the chart, 0 to 100 (clamped). */
  pct: (iso: string) => number
  /** The month starts inside the range, labelled; thinned to every third month when the range is long. */
  ticks: Tick[]
  /** Where today falls, or null when it is far outside the range. */
  today: number | null
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
  const months: { day: number; label: string }[] = []
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth() + 1; ; m += 1) {
    const day = Date.UTC(y + Math.floor(m / 12), m % 12, 1) / DAY
    if (day > max) break
    const month = ((m % 12) + 12) % 12
    const year = y + Math.floor(m / 12)
    months.push({ day, label: month === 0 || months.length === 0 ? `${MONTHS[month]} ${year}` : MONTHS[month] })
  }
  const every = months.length > 14 ? 3 : 1
  const ticks = months.filter((_, i) => i % every === 0).map((mo) => ({ pct: ((mo.day - min) / span) * 100, label: mo.label }))
  return { pct, ticks, today: near ? pct(today) : null }
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
