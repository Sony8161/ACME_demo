import type { ReactNode } from 'react'
import { Box, Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { formatDate } from '../format'
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

function Diamond({ left, tone, title }: { left: number; tone: Tone; title: string }) {
  return (
    <Box
      aria-hidden title={title}
      sx={{
        position: 'absolute', top: '50%', left: `${left}%`, width: 14, height: 14, ml: '-7px', mt: '-7px', transform: 'rotate(45deg)',
        bgcolor: COLOR[tone], border: '2px solid #fff', borderRadius: '3px', boxShadow: '0 2px 6px rgba(11,79,74,.35)',
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

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Box sx={{ minWidth: LABEL_WIDTH + CHART_MIN }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', height: 28 }} aria-hidden>
          <Box sx={{ width: LABEL_WIDTH, flexShrink: 0 }} />
          <Box sx={{ position: 'relative', flexGrow: 1, height: '100%' }}>
            {scale.ticks.map((t) => (
              <Typography key={t.label + t.pct} variant="caption" color="text.secondary" sx={{ position: 'absolute', bottom: 4, left: `${t.pct}%`, ml: 0.75, whiteSpace: 'nowrap' }}>
                {t.label}
              </Typography>
            ))}
          </Box>
        </Box>
        <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
          {rows.map((r) => {
            const box = r.start && r.end ? barBox(scale, r.start, r.end) : null
            return (
              <Box component="li" key={r.key} sx={{ display: 'flex', alignItems: 'stretch', minHeight: 46, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, pr: 1.5, pl: r.indent ? 3 : 0, py: 0.75, minWidth: 0 }}>
                  {r.to ? (
                    <Link component={RouterLink} to={r.to} underline="hover" sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'text.primary' }}>{r.label}</Link>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: r.indent ? 600 : 700, overflowWrap: 'anywhere' }}>{r.label}</Typography>
                  )}
                  {r.sublabel && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.sublabel}</Typography>}
                  <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{r.summary}</Box>
                </Box>
                <Box aria-hidden sx={{ position: 'relative', flexGrow: 1, minWidth: CHART_MIN }}>
                  {scale.ticks.map((t) => (
                    <Box key={t.label + t.pct} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${t.pct}%`, borderLeft: 1, borderColor: 'divider' }} />
                  ))}
                  {scale.today !== null && (
                    <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${scale.today}%`, width: 2, ml: '-1px', bgcolor: 'primary.main', opacity: 0.55 }} />
                  )}
                  {box && (
                    <Box
                      title={`${r.label}: ${formatDate(r.start!)} to ${formatDate(r.end!)}`}
                      sx={{
                        position: 'absolute', top: '50%', height: r.indent ? 14 : 20, mt: r.indent ? '-7px' : '-10px', left: `${box.left}%`, width: `${box.width}%`,
                        borderRadius: 999, bgcolor: COLOR[r.tone], opacity: 0.28, overflow: 'hidden',
                      }}
                    />
                  )}
                  {box && (
                    <Box
                      sx={{
                        position: 'absolute', top: '50%', height: r.indent ? 14 : 20, mt: r.indent ? '-7px' : '-10px', left: `${box.left}%`, width: `${box.width}%`,
                        borderRadius: 999, border: '2px solid', borderColor: COLOR[r.tone], overflow: 'hidden',
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
