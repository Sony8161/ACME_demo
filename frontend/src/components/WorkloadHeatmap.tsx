import { useMemo, useState } from 'react'
import { Box, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { api } from '../api/client'
import type { Workload } from '../api/types'
import { useApi } from '../api/useApi'
import { Async } from './Async'
import { EmptyState } from './EmptyState'

type Level = 'free' | 'light' | 'medium' | 'full'

// Teal steps; each pair of colours is checked for contrast by the accessibility scan. The hours are always written in the cell too.
const LEVEL: Record<Level, { bg: string; fg: string; label: string }> = {
  free: { bg: 'transparent', fg: 'text.secondary', label: 'Free' },
  light: { bg: '#ccfbf1', fg: '#134e4a', label: 'Up to half booked' },
  medium: { bg: '#5eead4', fg: '#134e4a', label: 'Mostly booked' },
  full: { bg: '#0f766e', fg: '#ffffff', label: 'Full week (40 h)' },
}

function levelOf(hours: number, capacity: number): Level {
  if (hours <= 0) return 'free'
  if (hours <= capacity / 2) return 'light'
  return hours < capacity ? 'medium' : 'full'
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** People by week, shaded by hours booked. A cell always says its hours, so the shade is a help, not the only signal. */
export function WorkloadHeatmap() {
  const state = useApi(() => api.get<Workload>('/reports/workload', { weeks: 8 }), [])
  return <Async state={state}>{(w) => <Map workload={w} />}</Async>
}

function Map({ workload }: { workload: Workload }) {
  const [filter, setFilter] = useState('')
  const { capacityPerWeek: capacity, weeks, people } = workload
  const shown = useMemo(() => people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase())), [people, filter])
  const nearWeeks = Math.min(4, weeks.length)
  const withFreeWeek = people.filter((p) => p.hours.slice(0, nearWeeks).some((h) => h <= 0)).length

  if (people.length === 0) return <EmptyState text="Nobody to show." />

  return (
    <>
      <Typography sx={{ mb: 1.5 }}>
        {withFreeWeek > 0
          ? `${withFreeWeek} ${withFreeWeek === 1 ? 'person has' : 'people have'} a free week in the next ${nearWeeks} weeks.`
          : `Everyone is booked for the next ${nearWeeks} weeks.`}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
        <TextField size="small" label="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 240 }} />
        <Box component="ul" aria-label="Legend" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', listStyle: 'none', m: 0, p: 0 }}>
          {(Object.keys(LEVEL) as Level[]).map((l) => (
            <Box component="li" key={l} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, typography: 'body2' }}>
              <Box aria-hidden sx={{ width: 16, height: 16, borderRadius: '3px', bgcolor: LEVEL[l].bg, border: 1, borderColor: 'divider' }} />
              {LEVEL[l].label}
            </Box>
          ))}
        </Box>
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small" aria-label="Workload by week">
          <TableHead>
            <TableRow>
              <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', minWidth: 170 }}>Person</TableCell>
              {weeks.map((d) => <TableCell key={d} align="center">{shortDate(d)}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={p.userId}>
                <TableCell component="th" scope="row" sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.jobTitle || 'Employee'}</Typography>
                </TableCell>
                {p.hours.map((h, i) => {
                  const level = levelOf(h, capacity)
                  const what = p.work[i].map((x) => `${x.projectName} · ${x.milestoneName}`).join(', ')
                  return (
                    <TableCell
                      key={weeks[i]} align="center" data-level={level} title={what || undefined}
                      sx={{ bgcolor: LEVEL[level].bg, color: LEVEL[level].fg, fontWeight: 600, minWidth: 64 }}
                    >
                      {h > 0 ? `${Math.round(h)} h` : '—'}
                      {what && <span data-sr-only style={visuallyHidden}>{what}</span>}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {shown.length === 0 && <EmptyState text="Nobody matches." action={{ label: 'Clear filter', onClick: () => setFilter('') }} />}
      </TableContainer>
    </>
  )
}
