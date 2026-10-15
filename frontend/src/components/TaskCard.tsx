import { useState } from 'react'
import { Avatar, Box, Chip, IconButton, Link, ListItemText, Menu, MenuItem, Paper, Tooltip, Typography } from '@mui/material'
import CommentIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import type { Task, TaskStatus } from '../api/types'
import { dueIn, formatDate } from '../format'
import { tint } from '../theme'
import { COLUMNS, PRIORITY_LABEL, canMove, initials, type Actor } from '../tasks'

interface Props {
  task: Task
  who: Actor
  showProject?: boolean
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
  /** Open the task (its details and comments). When given, the task's name is a button. */
  onOpen?: (task: Task) => void
}

/** The actions menu is also the keyboard and screen-reader way to move a card, because dragging needs a mouse. */
export function TaskMenu({ task, who, onMove, onEdit }: Omit<Props, 'showProject' | 'onOpen'>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  return (
    <>
      <Tooltip title="Task actions">
        <IconButton aria-label={`Task actions: ${task.name}`} onClick={(e) => setAnchor(e.currentTarget)} sx={{ width: 44, height: 44, mt: -0.75, mr: -0.75 }}>
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
export function TaskCard({ task, who, showProject, onMove, onEdit, onOpen }: Props) {
  const draggable = COLUMNS.some((c) => canMove(task, c.value, who))
  return (
    <Paper
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move' }}
      sx={{ p: 1.5, cursor: draggable ? 'grab' : 'default', '&:active': { cursor: draggable ? 'grabbing' : 'default' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {onOpen ? (
            <Link component="button" type="button" variant="body2" underline="hover" onClick={() => onOpen(task)} sx={{ fontWeight: 700, overflowWrap: 'anywhere', textAlign: 'left', color: 'text.primary' }}>
              {task.name}
            </Link>
          ) : (
            <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{task.name}</Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {showProject ? `${task.projectName} · ` : ''}{task.milestoneName}
          </Typography>
        </Box>
        <TaskMenu task={task} who={who} onMove={onMove} onEdit={onEdit} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
        {(task.priority === 'urgent' || task.priority === 'high') && (
          <Chip size="small" color={task.priority === 'urgent' ? 'error' : 'warning'} label={PRIORITY_LABEL[task.priority]} />
        )}
        {task.dueDate && task.status !== 'done' && (
          <Chip
            size="small" variant={task.isOverdue ? 'filled' : 'outlined'} color={task.isOverdue ? 'error' : 'default'}
            label={dueIn(task.dueDate) ?? `Due ${formatDate(task.dueDate)}`}
          />
        )}
        {task.commentCount > 0 && (
          <Chip size="small" variant="outlined" icon={<CommentIcon />} label={task.commentCount} aria-label={`${task.commentCount} ${task.commentCount === 1 ? 'comment' : 'comments'}`} />
        )}
        <Box sx={{ flexGrow: 1 }} />
        {task.assigneeName ? (
          <Tooltip title={task.assigneeName}>
            <Avatar variant="rounded" sx={{ width: 26, height: 26, borderRadius: '3px', fontSize: 11, fontWeight: 700, bgcolor: tint.strong, color: 'text.primary' }}>
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
