import { useState } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { Task, TaskStatus } from '../api/types'
import { COLUMNS, canMove, type Actor } from '../tasks'
import { TaskCard } from './TaskCard'

const EDGE = { todo: 'text.disabled', in_progress: 'primary.light', done: 'success.main' } as const

interface Props {
  tasks: Task[]
  who: Actor
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
}

/** Three columns, To do, In progress and Done. Drag a card to move it, or use its menu. */
export function TaskBoard({ tasks, who, onMove, onEdit }: Props) {
  const [over, setOver] = useState<TaskStatus | null>(null)

  const drop = (to: TaskStatus, id: string) => {
    setOver(null)
    const task = tasks.find((t) => t.id === id)
    if (task && canMove(task, to, who)) onMove(task, to)
  }

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'start' }}>
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.value)
        return (
          <Paper
            key={col.value}
            role="group"
            aria-label={`${col.label}, ${items.length} tasks`}
            onDragOver={(e) => { e.preventDefault(); setOver(col.value) }}
            onDragLeave={() => setOver((o) => (o === col.value ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(col.value, e.dataTransfer.getData('text/plain')) }}
            sx={{ p: 1.5, minHeight: 160, borderTop: 4, borderTopColor: EDGE[col.value], bgcolor: over === col.value ? 'rgba(94,234,212,.28)' : 'rgba(255,255,255,.7)', transition: 'background-color .12s' }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, px: 0.5 }}>
              <Typography variant="overline" component="h3">{col.label}</Typography>
              <Chip size="small" label={items.length} />
            </Stack>
            <Stack spacing={1.25}>
              {items.map((t) => <TaskCard key={t.id} task={t} who={who} onMove={onMove} onEdit={onEdit} />)}
              {items.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Nothing here.</Typography>}
            </Stack>
          </Paper>
        )
      })}
    </Box>
  )
}
