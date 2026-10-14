import { useState } from 'react'
import { MenuItem, Stack, TextField } from '@mui/material'
import { api } from '../api/client'
import type { Assignee, Milestone, Task, TaskPriority } from '../api/types'
import { DateField } from '../components/fields'
import { FormDialog } from '../components/FormDialog'
import { PRIORITIES } from '../tasks'

interface Props {
  open: boolean
  projectId: string
  /** The task being edited, or null to add a new one. */
  task: Task | null
  milestones: Milestone[]
  team: Assignee[]
  onClose: () => void
  onDone: () => void
}

/** Add or edit a task. The owner list is the people on the chosen milestone, because the server only accepts them. */
export function TaskDialog({ open, projectId, task, milestones, team, onClose, onDone }: Props) {
  const [name, setName] = useState(task?.name ?? '')
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? milestones[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const owners = team.filter((m) => m.milestoneId === milestoneId)
  const base = `/projects/${projectId}/milestones/${milestoneId}/deliverables`

  return (
    <FormDialog
      open={open} title={task ? 'Edit task' : 'Add a task'} submitLabel={task ? 'Save task' : 'Add task'}
      submitDisabled={!name.trim() || !milestoneId} onClose={onClose}
      onSubmit={async () => {
        if (task) {
          await api.patch(`${base}/${task.id}`, { name, priority, dueDate: dueDate || null, assigneeId: assigneeId || null })
        } else {
          await api.post(base, { name, priority, dueDate: dueDate || null, assigneeId: assigneeId || null })
          setName('')
          setDueDate('')
          setAssigneeId('')
        }
        onDone()
      }}
    >
      <TextField label="Task" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <TextField select label="Milestone" value={milestoneId} disabled={task !== null} onChange={(e) => { setMilestoneId(e.target.value); setAssigneeId('') }} required>
        {milestones.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
      </TextField>
      <TextField select label="Owner" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} helperText={owners.length === 0 ? 'Nobody is on this milestone yet.' : undefined}>
        <MenuItem value="">Unassigned</MenuItem>
        {owners.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.name}</MenuItem>)}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select fullWidth label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          {PRIORITIES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </TextField>
        <DateField fullWidth required={false} label="Due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Stack>
    </FormDialog>
  )
}
