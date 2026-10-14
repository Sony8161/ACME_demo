import { useState } from 'react'
import {
  Alert, Avatar, Box, Button, ButtonBase, Checkbox, Chip, Collapse, FormControlLabel, IconButton, LinearProgress, ListItemText, Menu, MenuItem, Paper, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import { api } from '../api/client'
import type { AssigneeList, DeliverableList, Milestone, Overview, Project, UserList } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { dateRange, formatDate, hours, money } from '../format'
import { initials } from '../tasks'
import { tint } from '../theme'
import { ConfirmDialog } from './ConfirmDialog'
import { DependencyPanel } from './DependencyPanel'
import { DateField } from './fields'
import { FormDialog } from './FormDialog'
import { Stat } from './Stat'
import { useToast } from './toast'

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

/**
 * One milestone as one line (name, dates, progress, tags) that opens to its details. The actions live in one menu, and the
 * one obvious next step ("Ready to sign off") shows on the line when it is the next step. Open by default when it needs attention.
 */
export function MilestoneCard({ project, milestone: m, canManage, onChanged }: Props) {
  const base = `/projects/${project.id}/milestones/${m.id}`
  const [expanded, setExpanded] = useState(m.archivedAt === null && (m.status === 'in_progress' || m.isOverdue || m.blockedByCount > 0))
  const panel = `milestone-${m.id}`
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [addingLink, setAddingLink] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [newItem, setNewItem] = useState('')
  const deliverables = useApi(expanded ? () => api.get<DeliverableList>(`${base}/deliverables`) : null, [m.id, expanded])
  const team = useApi(expanded ? () => api.get<AssigneeList>(`${base}/team`) : null, [m.id, expanded])

  const open = canManage && m.archivedAt === null && m.status !== 'completed'
  const total = m.deliverablesTotal
  const allDone = total > 0 && m.deliverablesDone === total
  const ready = open && allDone && m.blockedByCount === 0
  const progress = total ? (100 * m.deliverablesDone) / total : 0
  const list = deliverables.data

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
  const start = () =>
    run(async () => {
      await api.patch(base, { status: 'in_progress' })
      toast({ message: `${m.name} started`, undo: async () => { await api.patch(base, { status: 'pending' }); refresh() } })
    })

  const state = m.archivedAt ? (m.status === 'completed' ? 'Completed, archived' : 'Cancelled, archived') : STATUS_LABEL[m.status]

  return (
    <Paper sx={{ p: 0, overflow: 'hidden' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ p: 1.5, pl: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2">
            <ButtonBase
              onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={panel}
              sx={{ textAlign: 'left', font: 'inherit', gap: 0.5, borderRadius: '3px', py: 0.25 }}
            >
              <ExpandIcon aria-hidden fontSize="small" sx={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
              {m.name}
            </ButtonBase>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 3.5 }}>
            {dateRange(m.startDate, m.dueDate)} · {m.deliverablesDone} of {total} tasks done
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {m.blockedByCount > 0 && <Chip size="small" color="warning" label={`Waiting for ${m.blockedByCount}`} />}
          {m.isOverdue && <Chip size="small" color="error" label="Past due" />}
          <Chip size="small" variant="outlined" label={state} />
          {ready && <Button size="small" variant="contained" onClick={() => setDialog('complete')}>Ready to sign off</Button>}
          {open && (
            <Tooltip title="Milestone actions">
              <IconButton aria-label={`Milestone actions: ${m.name}`} aria-haspopup="menu" onClick={(e) => setMenu(e.currentTarget)} sx={{ width: 44, height: 44 }}>
                <MoreIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
      <LinearProgress variant="determinate" value={progress} color="success" aria-label={`Tasks done in ${m.name}`} sx={{ height: 3 }} />

      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        {m.status === 'pending' && <MenuItem onClick={() => { setMenu(null); void start() }}>Mark as started</MenuItem>}
        <MenuItem disabled={!allDone} onClick={() => { setMenu(null); setDialog('complete') }}>
          <ListItemText secondary={allDone ? undefined : 'Every task must be done first'}>Complete milestone</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setMenu(null); setExpanded(true); setAddingLink(true) }}>Add dependency</MenuItem>
        <MenuItem onClick={() => { setMenu(null); setDialog('assign') }}>Assign a person</MenuItem>
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { setMenu(null); setDialog('cancel') }}>Cancel milestone</MenuItem>
      </Menu>

      <Collapse in={expanded} unmountOnExit>
        <Box id={panel} sx={{ px: 2, pb: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          {m.description && <Typography variant="body2" sx={{ mb: 1.5 }}>{m.description}</Typography>}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2, mb: 2 }}>
            <Stat label="Hours worked" value={`${hours(m.hoursWorked)} of ${hours(m.allocatedHours)}`} />
            <Stat label="Expected hours" value={hours(m.expectedHours)} />
            {m.laborCost !== null && m.expectedCost !== null && <Stat label="Labor cost" value={`${money(m.laborCost)} of ${money(m.expectedCost)}`} />}
            {m.budgetAmount !== null && <Stat label="Budget" value={money(m.budgetAmount)} />}
          </Box>

          {message && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>{message}</Alert>}
          {deliverables.error && !list && <Alert severity="error" sx={{ mb: 1.5 }}>{deliverables.error}</Alert>}

          <Typography variant="overline" component="h3">Tasks ({m.deliverablesDone} of {total} done)</Typography>
          {list?.items.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
              {canManage ? 'No tasks yet. A milestone needs at least one before it can be completed.' : 'No tasks have been listed yet.'}
            </Typography>
          )}
          <Box>
            {list?.items.map((d) => (
              <FormControlLabel
                key={d.id}
                sx={{ display: 'flex', ml: 0, mr: 0, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: tint.hover } }}
                control={
                  <Checkbox size="small" checked={d.done} disabled={!open} onChange={(e) => run(() => api.patch(`${base}/deliverables/${d.id}`, { done: e.target.checked }))} />
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
              <TextField size="small" fullWidth placeholder="Add a task" value={newItem} onChange={(e) => setNewItem(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'New task' } }} />
              <Button type="submit" variant="outlined" disabled={!newItem.trim()}>Add</Button>
            </Stack>
          )}

          <Box sx={{ mt: 2 }}>
            <DependencyPanel path={`${base}/dependencies`} kind="milestone" selfId={m.id} canManage={open} onChanged={onChanged} adding={addingLink} onAddingChange={setAddingLink} />
          </Box>

          {(team.data?.items.length ?? 0) > 0 || open ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="overline" component="h3">Team</Typography>
              {team.error && !team.data && <Alert severity="error" sx={{ mb: 1 }}>{team.error}</Alert>}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {team.data?.items.map((a) => (
                  <Chip
                    key={a.assignmentId} variant="outlined" label={a.name} title={`${a.name}${a.jobTitle ? ` · ${a.jobTitle}` : ''}`}
                    avatar={<Avatar variant="rounded" sx={{ borderRadius: '3px', fontSize: 11, bgcolor: tint.strong, color: 'text.primary' }}>{initials(a.name)}</Avatar>}
                  />
                ))}
                {open && <Chip clickable variant="outlined" color="primary" label="+ Assign a person" onClick={() => setDialog('assign')} />}
              </Stack>
            </Box>
          ) : null}
          {m.reviewNote && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Review note: {m.reviewNote}</Typography>}
        </Box>
      </Collapse>

      <AssignDialog open={dialog === 'assign'} base={base} milestone={m} onClose={() => setDialog(null)} onDone={refresh} />
      <CompleteDialog open={dialog === 'complete'} base={base} milestone={m} onClose={() => setDialog(null)} onDone={refresh} />
      <ConfirmDialog
        open={dialog === 'cancel'} title={`Cancel "${m.name}"?`} confirmLabel="Cancel milestone" cancelLabel="Keep milestone" danger
        onClose={() => setDialog(null)} onConfirm={async () => { await api.post(`${base}/archive`); refresh() }}
      >
        <Typography>
          The milestone is taken out of the plan. Nothing is deleted, and admins can still see it. Everyone on it is free from tomorrow.
        </Typography>
      </ConfirmDialog>
    </Paper>
  )
}

interface DialogProps { open: boolean; base: string; milestone: Milestone; onClose: () => void; onDone: () => void }

function AssignDialog({ open, base, milestone, onClose, onDone }: DialogProps) {
  const people = useApi(open ? () => api.get<UserList>('/users', { role: 'employee' }) : null, [open])
  // Who is free today, so the choice is made before the server has to refuse an overlap (managers and admins can read this).
  const availability = useApi(open ? () => api.get<Overview>('/reports/overview') : null, [open])
  const [userId, setUserId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const state = new Map((availability.data?.allocation ?? []).map((a) => [a.userId, a]))
  const options = [...(people.data?.items ?? [])].sort(
    (a, b) => Number(state.get(b.id)?.state === 'available') - Number(state.get(a.id)?.state === 'available') || a.name.localeCompare(b.name),
  )
  const note = (id: string) => {
    const a = state.get(id)
    if (!a) return ''
    if (a.state === 'available') return a.nextWork ? `Free, next on ${a.nextWork.milestoneName} from ${formatDate(a.nextWork.startDate)}` : 'Free'
    return `Busy on ${a.currentWork?.milestoneName ?? 'a milestone'}${a.currentWork ? ` until ${formatDate(a.currentWork.endDate)}` : ''}`
  }

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
        A person can work on one milestone per day, so someone who is busy cannot be given overlapping dates.
      </Typography>
      <TextField select label="Employee" value={userId} onChange={(e) => setUserId(e.target.value)} required helperText={people.error ?? ' '}>
        {options.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            <ListItemText primary={`${u.name}${u.jobTitle ? ` · ${u.jobTitle}` : ''}`} secondary={note(u.id) || undefined} />
          </MenuItem>
        ))}
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
        Complete a milestone once you have reviewed its tasks. It then counts as done in the project's progress, and its team is free from tomorrow.
      </Typography>
      <TextField label="Review note" placeholder="What did you review? e.g. Wireframes signed off by the client" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  )
}
