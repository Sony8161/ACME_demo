import { Avatar, Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { Task, TaskStatus } from '../api/types'
import { formatDate } from '../format'
import { tint } from '../theme'
import { PRIORITY_LABEL, STATUS_LABEL, initials, type Actor } from '../tasks'
import { TaskMenu } from './TaskCard'

interface Props {
  tasks: Task[]
  who: Actor
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
}

/** The same tasks as the board, as rows: easier to scan and sort by eye when there are many. */
export function TaskTable({ tasks, who, onMove, onEdit }: Props) {
  return (
    <TableContainer component={Paper}>
      <Table size="small" aria-label="Tasks">
        <TableHead>
          <TableRow>
            <TableCell>Task</TableCell><TableCell>Status</TableCell><TableCell>Priority</TableCell><TableCell>Owner</TableCell>
            <TableCell>Due</TableCell><TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.name}</Typography>
                <Typography variant="caption" color="text.secondary">{t.milestoneName}</Typography>
              </TableCell>
              <TableCell><Chip size="small" variant="outlined" label={STATUS_LABEL[t.status]} /></TableCell>
              <TableCell>{PRIORITY_LABEL[t.priority]}</TableCell>
              <TableCell>
                {t.assigneeName ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar variant="rounded" sx={{ width: 24, height: 24, borderRadius: '3px', fontSize: 10, fontWeight: 700, bgcolor: tint.strong, color: 'text.primary' }}>{initials(t.assigneeName)}</Avatar>
                    {t.assigneeName}
                  </Box>
                ) : 'Unassigned'}
              </TableCell>
              <TableCell>
                {t.dueDate ? (t.isOverdue ? <Chip size="small" color="error" label={`Overdue ${formatDate(t.dueDate)}`} /> : formatDate(t.dueDate)) : '—'}
              </TableCell>
              <TableCell align="right"><TaskMenu task={t} who={who} onMove={onMove} onEdit={onEdit} /></TableCell>
            </TableRow>
          ))}
          {tasks.length === 0 && <TableRow><TableCell colSpan={6}><Typography color="text.secondary">No tasks match.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
