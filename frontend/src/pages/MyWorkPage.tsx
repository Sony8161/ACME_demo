import { Box, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api/client'
import type { MyDashboard } from '../api/types'
import { useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { Async } from '../components/Async'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { dateRange, formatDate } from '../format'
import { MyTasks } from './MyTasksPage'

export function MyWorkPage() {
  const { user } = useAuth()
  const state = useApi(() => api.get<MyDashboard>('/reports/my-dashboard'), [])

  return (
    <Async state={state}>
      {(d) => (
        <>
          <PageHeader title={`Hello, ${user?.name.split(' ')[0] ?? ''}`} subtitle={`Your work, ${formatDate(d.asOf)}`} />

          <Paper sx={{ p: 3, mb: 3, borderColor: d.currentWork ? 'primary.main' : undefined }}>
            <Typography variant="overline" color="text.secondary">Today</Typography>
            {d.currentWork ? (
              <>
                <Typography variant="h5" component="p">{d.currentWork.milestoneName}</Typography>
                <Typography color="text.secondary">
                  {d.currentWork.projectName} · you are on this until {formatDate(d.currentWork.endDate)}
                </Typography>
              </>
            ) : (
              <Typography variant="h6" component="p">You are not on a milestone today.</Typography>
            )}
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Hours this week</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{d.hoursThisWeek} of {d.weekCapacity}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={d.weekCapacity > 0 ? Math.min(100, (100 * d.hoursThisWeek) / d.weekCapacity) : 0} sx={{ height: 8, borderRadius: 4, mt: 0.5 }} aria-label="Hours this week" />
            </Box>
          </Paper>

          <Box sx={{ mb: 3 }}><MyTasks /></Box>

          <Typography variant="h6" component="h2" gutterBottom>My milestones</Typography>
          <Stack spacing={1.5}>
            {d.myMilestones.length === 0 && <EmptyState text="Nothing is assigned to you yet." />}
            {d.myMilestones.map((m) => (
              <Paper key={m.milestoneId} sx={{ p: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>{m.milestoneName}</Typography>
                <Typography variant="body2" color="text.secondary" component={RouterLink} to={`/projects/${m.projectId}`} sx={{ display: 'block', color: 'primary.main' }}>
                  {m.projectName} · you work on it {dateRange(m.startDate, m.endDate)}
                </Typography>
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {m.deliverablesDone} of {m.deliverablesTotal} tasks done
                  </Typography>
                  <LinearProgress
                    variant="determinate" color="success" aria-label={`Tasks done in ${m.milestoneName}`} sx={{ height: 4, my: 0.5 }}
                    value={m.deliverablesTotal ? (100 * m.deliverablesDone) / m.deliverablesTotal : 0}
                  />
                </Box>
              </Paper>
            ))}
          </Stack>
        </>
      )}
    </Async>
  )
}
