import { useState } from 'react'
import { Box, Button, Link, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api/client'
import type { Changes } from '../api/types'
import { useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { formatDate, formatDateTime } from '../format'
import { markVisited, readLastVisit } from '../lastVisit'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The dashboard's "what did others change since I last looked" card. Quiet when there is nothing new, or when it cannot be loaded. */
export function ChangesCard() {
  const { user } = useAuth()
  const wanted = user !== null && user.role !== 'employee'
  const [since] = useState(() => (user ? readLastVisit(user.id) : new Date()))
  const [hidden, setHidden] = useState(false)
  const state = useApi(wanted ? () => api.get<Changes>('/reports/changes', { since: since.toISOString(), limit: 5 }) : null, [wanted])
  const data = state.data
  if (!wanted || hidden || !data || data.total === 0) return null

  return (
    <Paper component="section" aria-label="Since you last visited" sx={{ p: 2, mb: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2">
          {plural(data.total, 'change', 'changes')} in {plural(data.projects, 'project', 'projects')}
          <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>since {formatDate(since.toISOString().slice(0, 10))}</Typography>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {user?.role === 'admin' && <Link component={RouterLink} to="/history">See everything</Link>}
          <Button size="small" onClick={() => { if (user) markVisited(user.id); setHidden(true) }}>Got it</Button>
        </Stack>
      </Stack>
      <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: 'none' }}>
        {data.items.map((e) => (
          <Box component="li" key={e.id} sx={{ py: 0.75, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2"><strong>{e.actorName}</strong> · {e.summary}</Typography>
            <Typography variant="caption" color="text.secondary">
              {e.projectId && e.projectName && <><Link component={RouterLink} to={`/projects/${e.projectId}`}>{e.projectName}</Link> · </>}
              {formatDateTime(e.occurredAt)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
