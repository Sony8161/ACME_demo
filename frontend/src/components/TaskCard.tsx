import { useState } from 'react'
import { Avatar, Box, Chip, IconButton, ListItemText, Menu, MenuItem, Paper, Tooltip, Typography } from '@mui/material'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import type { Task, TaskStatus } from '../api/types'
import { formatDate } from '../format'
import { COLUMNS, PRIORITY_COLOR, PRIORITY_LABEL, canMove, initials, type Actor } from '../tasks'

interface Props {
  task: Task
  who: Actor
  showProject?: boolean
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
}

/** The actions menu is also the keyboard and screen-reader way to move a card, because dragging needs a mouse. */
export function TaskMenu({ task, who, onMove, onEdit }: Omit<Props, 'showProject'>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  return (
    <>
      <Tooltip title="Task actions">
        <IconButton size="small" aria-label={`Task actions: ${task.name}`} onClick={(e) => setAnchor(e.currentTarget)}>
          <MoreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        {COLUMNS.map((c) => (
          <MenuItem key={c.value} disabled={!canMove(task, c.value, who)} onClick={() => { close(); onMove(task, c.value) }}>
            <ListItemText>Move to {c.label}</ListItemText>
          </MenuItem>
        ))}
        {onEdit && who.canManage && (
          <MenuItem onClick={() => { close(); onEdit(task) }}><ListItemText>Edit task</ListItemText></MenuItem>
        )}
      </Menu>
    </>
  )
}

/** One task on the board: what it is, which milestone, how urgent, when it is due and who owns it. */
export function TaskCard({ task, who, showProject, onMove, onEdit }: Props) {
  const draggable = COLUMNS.some((c) => canMove(task, c.value, who))
  return (
    <Paper
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move' }}
      sx={{ p: 1.5, borderLeft: 4, borderLeftColor: PRIORITY_COLOR[task.priority], cursor: draggable ? 'grab' : 'default', '&:active': { cursor: draggable ? 'grabbing' : 'default' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{task.name}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {showProject ? `${task.projectName} · ` : ''}{task.milestoneName}
          </Typography>
        </Box>
        <TaskMenu task={task} who={who} onMove={onMove} onEdit={onEdit} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
        <Chip
          size="small" variant="outlined" label={PRIORITY_LABEL[task.priority]}
          icon={<Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLOR[task.priority], ml: '8px !important' }} />}
        />
        {task.dueDate && (
          <Chip
            size="small" variant={task.isOverdue ? 'filled' : 'outlined'} color={task.isOverdue ? 'error' : 'default'}
            label={task.isOverdue ? `Overdue ${formatDate(task.dueDate)}` : `Due ${formatDate(task.dueDate)}`}
          />
        )}
        <Box sx={{ flexGrow: 1 }} />
        {task.assigneeName ? (
          <Tooltip title={task.assigneeName}>
            <Avatar variant="rounded" sx={{ width: 26, height: 26, borderRadius: '3px', fontSize: 11, fontWeight: 700, bgcolor: 'rgba(94,234,212,.5)', color: 'text.primary' }}>
              {initials(task.assigneeName)}
            </Avatar>
          </Tooltip>
        ) : (
          <Typography variant="caption" color="text.secondary">Unassigned</Typography>
        )}
      </Box>
    </Paper>
  )
}
