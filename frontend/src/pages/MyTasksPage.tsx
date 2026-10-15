import { useState } from 'react'
import { Alert, Button, Chip, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api/client'
import type { Task, TaskList, TaskStatus } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { TaskDetailDialog } from '../components/TaskDetailDialog'
import { formatDate } from '../format'
import { PRIORITY_LABEL, STATUS_LABEL } from '../tasks'

/** Everything assigned to me across projects, soonest due first. I can start or pause my tasks; a manager finishes them. A section of My work. */
export function MyTasks() {
  const state = useApi(() => api.get<TaskList>('/tasks/mine'), [])
  const [message, setMessage] = useState<string | null>(null)
  const [detail, setDetail] = useState<Task | null>(null)

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
      <Typography variant="h6" component="h2" gutterBottom>My tasks</Typography>
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
                      <Link component="button" type="button" variant="body2" underline="hover" onClick={() => setDetail(t)} sx={{ fontWeight: 700, textAlign: 'left', color: 'text.primary' }}>{t.name}</Link>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {t.milestoneName}{t.commentCount > 0 ? ` · ${t.commentCount} ${t.commentCount === 1 ? 'comment' : 'comments'}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell><Link component={RouterLink} to={`/projects/${t.projectId}`}>{t.projectName}</Link></TableCell>
                    <TableCell>{PRIORITY_LABEL[t.priority]}</TableCell>
                    <TableCell>{t.dueDate ? (t.isOverdue ? <Chip size="small" color="error" label={`Overdue ${formatDate(t.dueDate)}`} /> : formatDate(t.dueDate)) : '—'}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={STATUS_LABEL[t.status]} /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        {t.status === 'todo' && <Button size="small" variant="contained" onClick={() => move(t, 'in_progress')} aria-label={`Start ${t.name}`}>Start</Button>}
                        {t.status === 'in_progress' && <Button size="small" onClick={() => move(t, 'todo')} aria-label={`Pause ${t.name}`}>Pause</Button>}
                        {t.status === 'done' && <Typography variant="body2" color="text.secondary">Done</Typography>}
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
      <TaskDetailDialog task={detail} onClose={() => setDetail(null)} onChanged={state.reload} />
    </>
  )
}
