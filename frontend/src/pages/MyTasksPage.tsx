import { useState } from 'react'
import { Alert, Button, Chip, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api/client'
import type { Task, TaskList, TaskStatus } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { PageHeader } from '../components/PageHeader'
import { formatDate } from '../format'
import { PRIORITY_LABEL, STATUS_LABEL } from '../tasks'

/** Everything assigned to me across projects, soonest due first. I can start or pause my tasks; a manager finishes them. */
export function MyTasksPage() {
  const state = useApi(() => api.get<TaskList>('/tasks/mine'), [])
  const [message, setMessage] = useState<string | null>(null)

  const move = async (task: Task, to: TaskStatus) => {
    setMessage(null)
    try {
      await api.patch(`/projects/${task.projectId}/milestones/${task.milestoneId}/deliverables/${task.id}`, { status: to })
      state.reload()
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  return (
    <>
      <PageHeader title="My tasks" subtitle="What is assigned to you, soonest due first" />
      {message && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
      <Async state={state}>
        {(list) => (
          <TableContainer component={Paper}>
            <Table size="small" aria-label="My tasks">
              <TableHead>
                <TableRow>
                  <TableCell>Task</TableCell><TableCell>Project</TableCell><TableCell>Priority</TableCell><TableCell>Due</TableCell>
                  <TableCell>Status</TableCell><TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {list.items.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{t.milestoneName}</Typography>
                    </TableCell>
                    <TableCell><Link component={RouterLink} to={`/projects/${t.projectId}`}>{t.projectName}</Link></TableCell>
                    <TableCell>{PRIORITY_LABEL[t.priority]}</TableCell>
                    <TableCell>{t.dueDate ? (t.isOverdue ? <Chip size="small" color="error" label={`Overdue ${formatDate(t.dueDate)}`} /> : formatDate(t.dueDate)) : '—'}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={STATUS_LABEL[t.status]} /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        {t.status === 'todo' && <Button size="small" variant="contained" onClick={() => move(t, 'in_progress')} aria-label={`Start ${t.name}`}>Start</Button>}
                        {t.status === 'in_progress' && <Button size="small" onClick={() => move(t, 'todo')} aria-label={`Pause ${t.name}`}>Pause</Button>}
                        {t.status === 'done' && <Typography variant="caption" color="text.secondary">Reviewed</Typography>}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {list.items.length === 0 && <TableRow><TableCell colSpan={6}><Typography color="text.secondary">Nothing is assigned to you.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Async>
    </>
  )
}
