import type { ReactNode } from 'react'
import { Box, Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { formatDate } from '../format'
import { tint } from '../theme'
import { barBox, buildScale, type Tone } from '../timeline'

const COLOR: Record<Tone, string> = { brand: 'primary.light', good: 'success.main', warn: 'warning.main', bad: 'error.main', quiet: 'text.disabled' }

export interface Marker { date: string; tone: Tone; title: string }
export interface TimelineRow {
  key: string
  label: string
  sublabel?: string
  /** Where the label links to, if anywhere. */
  to?: string
  /** A bar from start to end. A row with only markers (a task) leaves these out. */
  start?: string
  end?: string
  tone: Tone
  /** 0 to 100: how much of the bar is filled (work done). */
  progress?: number | null
  /** Shown to a screen reader instead of a picture: what this row says. */
  summary: string
  indent?: boolean
  markers?: Marker[]
}

const LABEL_WIDTH = 250
const CHART_MIN = 560
/** Room given to each month, so its full name and year fit on its band. */
const MONTH_WIDTH = 120
const STICKY = { position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper' } as const

function Diamond({ left, tone, title }: { left: number; tone: Tone; title: string }) {
  return (
    <Box
      aria-hidden title={title}
      sx={{
        position: 'absolute', top: '50%', left: `${left}%`, width: 14, height: 14, ml: '-7px', mt: '-7px', transform: 'rotate(45deg)',
        bgcolor: COLOR[tone], border: '2px solid', borderColor: 'background.paper', borderRadius: '3px', boxShadow: '0 2px 6px rgba(11,79,74,.35)',
      }}
    />
  )
}

/** Rows on a shared date axis: bars for spans, diamonds for dates, a line for today. Reads as a list for a screen reader. */
export function TimelineChart({ rows, today, label, footer }: { rows: TimelineRow[]; today: string; label: string; footer?: ReactNode }) {
  const spans = rows.flatMap((r) => [
    ...(r.start && r.end ? [{ start: r.start, end: r.end }] : []),
    ...(r.markers ?? []).map((m) => ({ start: m.date, end: m.date })),
  ])
  const scale = buildScale(spans, today)
  const chartWidth = Math.max(CHART_MIN, Math.ceil(scale.monthCount * MONTH_WIDTH))

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Box sx={{ minWidth: LABEL_WIDTH + chartWidth }}>
        <Box aria-hidden sx={{ display: 'flex', height: 46 }}>
          <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, ...STICKY }} />
          <Box sx={{ position: 'relative', flexGrow: 1 }}>
            {scale.months.map((m) => (
              <Typography
                key={m.label} variant="caption" noWrap
                sx={{
                  position: 'absolute', top: 0, height: 24, left: `${m.pct}%`, width: `${m.width}%`, px: 0.75, display: 'flex', alignItems: 'center', fontWeight: 700,
                  borderLeft: 1, borderColor: 'divider', bgcolor: m.index % 2 ? 'transparent' : tint.soft, overflow: 'hidden',
                }}
              >
                {m.width * (chartWidth / 100) >= 100 ? m.label : m.name.slice(0, 3)}
              </Typography>
            ))}
            {scale.weeks.map((w) => (
              <Typography key={w.pct} variant="caption" color="text.secondary" sx={{ position: 'absolute', top: 24, left: `${w.pct}%`, ml: 0.5, lineHeight: '20px', fontSize: 11 }}>
                {w.label}
              </Typography>
            ))}
            {scale.today !== null && (
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute', top: 26, left: `${scale.today}%`, transform: 'translateX(-50%)', px: 0.75, lineHeight: '16px', fontSize: 11, fontWeight: 700,
                  bgcolor: 'primary.dark', color: 'primary.contrastText', borderRadius: '2px', whiteSpace: 'nowrap',
                }}
              >
                Today
              </Typography>
            )}
          </Box>
        </Box>
        <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
          {rows.map((r) => {
            const box = r.start && r.end ? barBox(scale, r.start, r.end) : null
            return (
              <Box component="li" key={r.key} sx={{ display: 'flex', alignItems: 'stretch', minHeight: 46, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, pr: 1.5, pl: r.indent ? 3 : 0, py: 0.75, minWidth: 0, ...STICKY }}>
                  {r.to ? (
                    <Link component={RouterLink} to={r.to} underline="hover" sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'text.primary' }}>{r.label}</Link>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: r.indent ? 600 : 700, overflowWrap: 'anywhere' }}>{r.label}</Typography>
                  )}
                  {r.sublabel && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.sublabel}</Typography>}
                  <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{r.summary}</Box>
                </Box>
                <Box aria-hidden sx={{ position: 'relative', flexGrow: 1, minWidth: chartWidth }}>
                  {scale.months.map((m) => (
                    <Box key={m.label} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${m.pct}%`, width: `${m.width}%`, borderLeft: 1, borderColor: 'divider', bgcolor: m.index % 2 ? 'transparent' : tint.soft }} />
                  ))}
                  {scale.weeks.map((w) => (
                    <Box key={w.pct} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${w.pct}%`, borderLeft: '1px dotted', borderColor: 'divider' }} />
                  ))}
                  {scale.today !== null && (
                    <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${scale.today}%`, width: 2, ml: '-1px', bgcolor: 'primary.main', opacity: 0.55 }} />
                  )}
                  {box && (
                    <Box
                      title={`${r.label}: ${formatDate(r.start!)} to ${formatDate(r.end!)}`}
                      sx={{
                        position: 'absolute', top: '50%', height: r.indent ? 14 : 20, mt: r.indent ? '-7px' : '-10px', left: `${box.left}%`, width: `${box.width}%`,
                        borderRadius: '2px', bgcolor: COLOR[r.tone], opacity: 0.28, overflow: 'hidden',
                      }}
                    />
                  )}
                  {box && (
                    <Box
                      sx={{
                        position: 'absolute', top: '50%', height: r.indent ? 14 : 20, mt: r.indent ? '-7px' : '-10px', left: `${box.left}%`, width: `${box.width}%`,
                        borderRadius: '2px', border: '2px solid', borderColor: COLOR[r.tone], overflow: 'hidden',
                      }}
                    >
                      {r.progress ? <Box sx={{ height: '100%', width: `${Math.min(100, r.progress)}%`, bgcolor: COLOR[r.tone], opacity: 0.85 }} /> : null}
                    </Box>
                  )}
                  {(r.markers ?? []).map((m) => <Diamond key={m.date + m.title} left={scale.pct(m.date)} tone={m.tone} title={m.title} />)}
                </Box>
              </Box>
            )
          })}
          {rows.length === 0 && <Box component="li" sx={{ py: 2 }}><Typography color="text.secondary">Nothing to show yet.</Typography></Box>}
        </Box>
        {footer}
      </Box>
    </Box>
  )
}
