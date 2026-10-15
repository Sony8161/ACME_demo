import { useState } from 'react'
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import type { Task, TaskStatus } from '../api/types'
import { COLUMNS, canMove, type Actor } from '../tasks'
import { tint } from '../theme'
import { TaskCard } from './TaskCard'

interface Props {
  tasks: Task[]
  who: Actor
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
  onOpen?: (task: Task) => void
  /** When given, the To do column ends with a one-line "Add a task" box. It resolves once the task is saved. */
  onQuickAdd?: (name: string) => Promise<unknown>
}

/** Three columns, To do, In progress and Done. Drag a card to move it, or use its menu. */
export function TaskBoard({ tasks, who, onMove, onEdit, onOpen, onQuickAdd }: Props) {
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const drop = (to: TaskStatus, id: string) => {
    setOver(null)
    const task = tasks.find((t) => t.id === id)
    if (task && canMove(task, to, who)) onMove(task, to)
  }

  const add = async () => {
    const name = draft.trim()
    if (!name || !onQuickAdd) return
    setAdding(true)
    try {
      await onQuickAdd(name)
      setDraft('')
    } catch {
      // The page shows the server's message; the text stays so it can be sent again.
    } finally {
      setAdding(false)
    }
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
            sx={{ p: 1.5, minHeight: 120, bgcolor: over === col.value ? tint.strong : tint.soft, borderColor: over === col.value ? 'primary.main' : undefined, transition: 'background-color .12s' }}
          >
            <Typography variant="overline" component="h3" sx={{ display: 'block', mb: 1, px: 0.5 }}>{col.label} · {items.length}</Typography>
            <Stack spacing={1.25}>
              {items.map((t) => <TaskCard key={t.id} task={t} who={who} onMove={onMove} onEdit={onEdit} onOpen={onOpen} />)}
              {col.value === 'todo' && onQuickAdd && (
                <Stack
                  component="form" direction="row" spacing={1}
                  onSubmit={(e) => { e.preventDefault(); void add() }}
                >
                  <TextField size="small" fullWidth placeholder="Add a task" value={draft} onChange={(e) => setDraft(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'New task name' } }} />
                  <Button type="submit" variant="outlined" disabled={!draft.trim() || adding}>Add</Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        )
      })}
    </Box>
  )
}
