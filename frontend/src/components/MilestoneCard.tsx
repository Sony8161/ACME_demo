import { useState } from 'react'
import {
  Alert, Box, Button, ButtonGroup, Checkbox, Chip, FormControlLabel, LinearProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material'
import AddPersonIcon from '@mui/icons-material/PersonAddAltOutlined'
import CancelIcon from '@mui/icons-material/CancelOutlined'
import DoneIcon from '@mui/icons-material/TaskAltOutlined'
import StartIcon from '@mui/icons-material/PlayArrowOutlined'
import { api } from '../api/client'
import type { AssigneeList, DeliverableList, Milestone, Project, UserList } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { dateRange, hours, money } from '../format'
import { DateField } from './fields'
import { DependencyPanel } from './DependencyPanel'
import { FormDialog } from './FormDialog'

interface Props {
  project: Project
  milestone: Milestone
  /** The signed-in person is this project's manager or an admin, and the project is still open. */
  canManage: boolean
  /** Ask the page to refresh its totals after a change here. */
  onChanged: () => void
}

type Dialog = 'assign' | 'complete' | 'cancel' | null

const STATUS_LABEL = { pending: 'Not started', in_progress: 'In progress', completed: 'Completed' } as const

/** One milestone: its checklist of deliverables, who works on it, and the manager's actions on it. */
export function MilestoneCard({ project, milestone: m, canManage, onChanged }: Props) {
  const base = `/projects/${project.id}/milestones/${m.id}`
  const deliverables = useApi(() => api.get<DeliverableList>(`${base}/deliverables`), [m.id])
  const team = useApi(() => api.get<AssigneeList>(`${base}/team`), [m.id])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [newItem, setNewItem] = useState('')

  const open = canManage && m.archivedAt === null && m.status !== 'completed'
  const refresh = () => {
    deliverables.reload()
    team.reload()
    onChanged()
  }

  const run = async (action: () => Promise<unknown>) => {
    setMessage(null)
    try {
      await action()
      refresh()
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const progress = m.deliverablesTotal ? (100 * m.deliverablesDone) / m.deliverablesTotal : 0
  const list = deliverables.data
  const stripe = m.archivedAt ? 'text.disabled' : m.isOverdue ? 'error.main' : m.status === 'in_progress' ? 'primary.light' : 'divider'

  return (
    <Paper sx={{ p: 0, overflow: 'hidden', borderLeft: 6, borderLeftColor: stripe }}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ p: 2, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">{m.name}</Typography>
          <Typography variant="body2" color="text.secondary">{dateRange(m.startDate, m.dueDate)}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {m.blockedByCount > 0 && <Chip size="small" color="warning" label={`Waiting for ${m.blockedByCount}`} />}
          {m.isOverdue && <Chip size="small" color="error" label="Past due" />}
          <Chip size="small" variant="outlined" label={m.archivedAt ? (m.status === 'completed' ? 'Completed, archived' : 'Cancelled, archived') : STATUS_LABEL[m.status]} />
        </Stack>
      </Stack>

      {m.description && <Typography variant="body2" sx={{ px: 2, pb: 1.5 }}>{m.description}</Typography>}

      {open && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, py: 1, flexWrap: 'wrap', alignItems: 'center', bgcolor: 'rgba(94,234,212,.12)', borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="overline" sx={{ mr: 0.5 }}>Actions</Typography>
          <ButtonGroup size="small" variant="outlined" aria-label="Milestone actions" sx={{ maxWidth: '100%', overflowX: 'auto', '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
            {m.status === 'pending' && (
              <Button startIcon={<StartIcon />} onClick={() => run(() => api.patch(base, { status: 'in_progress' }))}>Mark as started</Button>
            )}
            <Button startIcon={<DoneIcon />} onClick={() => setDialog('complete')}>Complete milestone</Button>
            <Button color="error" startIcon={<CancelIcon />} onClick={() => setDialog('cancel')}>Cancel milestone</Button>
          </ButtonGroup>
        </Stack>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2, px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
        <Fact label="Planned" value={hours(m.allocatedHours)} />
        <Fact label="Expected" value={hours(m.expectedHours)} />
        <Fact label="Worked" value={hours(m.hoursWorked)} />
        {m.budgetAmount !== null && <Fact label="Budget" value={money(m.budgetAmount)} />}
        {m.expectedCost !== null && <Fact label="Expected cost" value={money(m.expectedCost)} />}
        {m.laborCost !== null && <Fact label="Labor so far" value={money(m.laborCost)} />}
      </Box>

      <Box sx={{ px: 2, pt: 1.75 }}>
        <Typography variant="overline" component="h3">
          Deliverables ({m.deliverablesDone} of {m.deliverablesTotal} done)
        </Typography>
        <LinearProgress variant="determinate" value={progress} color="success" aria-label="Deliverables done" sx={{ height: 4, my: 0.75 }} />
        {list?.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            {canManage ? 'No deliverables yet. A milestone needs at least one before it can be completed.' : 'No deliverables have been listed yet.'}
          </Typography>
        )}
        <Box>
          {list?.items.map((d) => (
            <FormControlLabel
              key={d.id}
              sx={{ display: 'flex', ml: 0, mr: 0, borderBottom: 1, borderColor: 'rgba(8,112,105,.12)', '&:hover': { bgcolor: 'rgba(94,234,212,.1)' } }}
              control={
                <Checkbox
                  size="small" checked={d.done} disabled={!open}
                  onChange={(e) => run(() => api.patch(`${base}/deliverables/${d.id}`, { done: e.target.checked }))}
                />
              }
              label={d.name}
            />
          ))}
        </Box>
        {open && (
          <Stack
            component="form" direction="row" spacing={1} sx={{ mt: 1.25 }}
            onSubmit={(e) => {
              e.preventDefault()
              const name = newItem.trim()
              if (!name) return
              run(() => api.post(`${base}/deliverables`, { name }).then(() => setNewItem('')))
            }}
          >
            <TextField size="small" fullWidth placeholder="Add a deliverable, e.g. Design file" value={newItem} onChange={(e) => setNewItem(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'New deliverable' } }} />
            <Button type="submit" variant="outlined" disabled={!newItem.trim()}>Add</Button>
          </Stack>
        )}
      </Box>

      <Box sx={{ px: 2, pt: 2, pb: 1, borderTop: 1, borderColor: 'divider', mt: 2 }}>
        <DependencyPanel path={`${base}/dependencies`} kind="milestone" selfId={m.id} canManage={open} onChanged={onChanged} />
      </Box>

      <Box sx={{ px: 2, pt: 1, pb: 2 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
          <Typography variant="overline" component="h3">Team</Typography>
          {open && <Button size="small" variant="outlined" startIcon={<AddPersonIcon />} onClick={() => setDialog('assign')}>Assign a person</Button>}
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {team.data?.items.length === 0 && <Typography variant="body2" color="text.secondary">Nobody assigned yet.</Typography>}
          {team.data?.items.map((a) => (
            <Chip key={a.assignmentId} label={`${a.name} · ${a.jobTitle || 'Employee'}`} variant="outlined" />
          ))}
        </Stack>
        {m.reviewNote && <Alert severity="success" sx={{ mt: 2 }}>Review note: {m.reviewNote}</Alert>}
        {message && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
      </Box>

      <AssignDialog open={dialog === 'assign'} base={base} milestone={m} onClose={() => setDialog(null)} onDone={refresh} />
      <CompleteDialog open={dialog === 'complete'} base={base} milestone={m} onClose={() => setDialog(null)} onDone={refresh} />
      <FormDialog
        open={dialog === 'cancel'} title={`Cancel "${m.name}"?`} submitLabel="Cancel milestone" danger
        onClose={() => setDialog(null)} onSubmit={async () => { await api.post(`${base}/archive`); refresh() }}
      >
        <Typography>
          The milestone moves to the archive, which only admins can see. Nothing is deleted. Everyone on it is free from tomorrow.
        </Typography>
      </FormDialog>
    </Paper>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
    </Box>
  )
}

interface DialogProps { open: boolean; base: string; milestone: Milestone; onClose: () => void; onDone: () => void }

function AssignDialog({ open, base, milestone, onClose, onDone }: DialogProps) {
  const people = useApi(open ? () => api.get<UserList>('/users', { role: 'employee' }) : null, [open])
  const [userId, setUserId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  return (
    <FormDialog
      open={open} title={`Assign a person to "${milestone.name}"`} submitLabel="Assign" submitDisabled={!userId}
      onClose={onClose}
      onSubmit={async () => {
        await api.post(`${base}/team`, { userId, startDate: start || undefined, endDate: end || undefined })
        setUserId('')
        onDone()
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Every Monday to Friday in the range is an 8-hour shift. A person can work only one milestone per day, so the server refuses dates that overlap their other work.
      </Typography>
      <TextField select label="Employee" value={userId} onChange={(e) => setUserId(e.target.value)} required helperText={people.error ?? ' '}>
        {people.data?.items.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` · ${u.jobTitle}` : ''}</MenuItem>)}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <DateField label="From (optional)" required={false} fullWidth value={start} onChange={(e) => setStart(e.target.value)} helperText={`Default: ${milestone.startDate} or today`} />
        <DateField label="Until (optional)" required={false} fullWidth value={end} onChange={(e) => setEnd(e.target.value)} helperText={`Default: ${milestone.dueDate}`} />
      </Stack>
    </FormDialog>
  )
}

function CompleteDialog({ open, base, milestone, onClose, onDone }: DialogProps) {
  const [note, setNote] = useState('')
  return (
    <FormDialog
      open={open} title={`Complete "${milestone.name}"`} submitLabel="Sign off and complete"
      onClose={onClose}
      onSubmit={async () => {
        await api.post(`${base}/complete`, { reviewNote: note })
        onDone()
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Complete a milestone after you have reviewed its deliverables. Every deliverable must be ticked. The milestone then moves to the archive (still counted in project progress) and its team is free from tomorrow.
      </Typography>
      <TextField label="Review note" placeholder="What did you review? e.g. Wireframes signed off by the client" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  )
}
