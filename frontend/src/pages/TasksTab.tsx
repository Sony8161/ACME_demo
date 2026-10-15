import { useState } from 'react'
import { Alert, Box, Button, IconButton, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import { api } from '../api/client'
import type { AssigneeList, Milestone, Task, TaskList, TaskStatus } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { Async } from '../components/Async'
import { TaskBoard } from '../components/TaskBoard'
import { TaskTable } from '../components/TaskTable'
import { useToast } from '../components/toast'
import { STATUS_LABEL } from '../tasks'
import { TaskDialog } from './TaskDialog'

interface Props {
  projectId: string
  canManage: boolean
  milestones: Milestone[]
  /** Called after a change so the milestone cards (their task counts) refresh too. */
  onChanged: () => void
}

/** The project's tasks as a board or a list, with a filter by owner and by milestone. */
export function TasksTab({ projectId, canManage, milestones, onChanged }: Props) {
  const { user } = useAuth()
  const toast = useToast()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [owner, setOwner] = useState('')
  const [milestone, setMilestone] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ task: Task | null } | null>(null)
  const tasks = useApi(
    () => api.get<TaskList>(`/projects/${projectId}/tasks`, { assignee_id: owner || undefined, milestone_id: milestone || undefined }),
    [projectId, owner, milestone],
  )
  const team = useApi(() => api.get<AssigneeList>(`/projects/${projectId}/team`), [projectId])
  const live = milestones.filter((m) => m.archivedAt === null)
  // A task is added to the milestone being filtered on, or else the first one still open.
  const target = live.find((m) => m.id === milestone) ?? live.find((m) => m.status !== 'completed') ?? live[0]
  const who = { canManage, userId: user?.id }
  const path = (t: Task) => `/projects/${projectId}/milestones/${t.milestoneId}/deliverables/${t.id}`

  const changed = () => { tasks.reload(); onChanged() }

  const move = async (task: Task, to: TaskStatus) => {
    setMessage(null)
    try {
      await api.patch(path(task), { status: to })
      changed()
      toast({
        message: `${task.name} moved to ${STATUS_LABEL[to]}`,
        undo: async () => { await api.patch(path(task), { status: task.status }); changed() },
      })
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const quickAdd = async (name: string) => {
    if (!target) return
    setMessage(null)
    try {
      await api.post(`/projects/${projectId}/milestones/${target.id}/deliverables`, { name })
      changed()
      toast({ message: `Added "${name}" to ${target.name}` })
    } catch (err) {
      setMessage(errorText(err))
      throw err
    }
  }

  const people = Array.from(new Map((team.data?.items ?? []).map((m) => [m.userId, m.name])).entries())

  return (
    <Stack spacing={2}>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: 'board' | 'list' | null) => v && setView(v)} aria-label="Task view">
          <ToggleButton value="board">Board</ToggleButton>
          <ToggleButton value="list">List</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Everyone</MenuItem>
          {people.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">All milestones</MenuItem>
          {live.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
        </TextField>
        <Tooltip title={canManage ? 'Drag a card to move it, or use its menu.' : 'You can start or pause your own tasks. A manager reviews and finishes them.'}>
          <IconButton aria-label="How tasks move" sx={{ width: 40, height: 40 }}><InfoIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Box sx={{ flexGrow: 1 }} />
        {canManage && live.length > 0 && <Button variant="outlined" onClick={() => setDialog({ task: null })}>Add task with details</Button>}
      </Stack>
      {message && <Alert severity="error" onClose={() => setMessage(null)}>{message}</Alert>}
      <Async state={tasks}>
        {(list) => (
          view === 'board'
            ? <TaskBoard tasks={list.items} who={who} onMove={move} onEdit={(task) => setDialog({ task })} onQuickAdd={canManage && target ? quickAdd : undefined} />
            : <TaskTable
              tasks={list.items} who={who} onMove={move} onEdit={(task) => setDialog({ task })}
              people={people.map(([id, name]) => ({ id, name }))} onChanged={canManage ? changed : undefined}
            />
        )}
      </Async>
      {dialog && (
        <TaskDialog
          key={dialog.task?.id ?? 'new'} open projectId={projectId} task={dialog.task} milestones={live}
          team={team.data?.items ?? []} onClose={() => setDialog(null)} onDone={changed}
        />
      )}
    </Stack>
  )
}
