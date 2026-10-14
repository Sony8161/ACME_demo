import { useState } from 'react'
import { Alert, Box, Button, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import RemoveIcon from '@mui/icons-material/LinkOff'
import LinkIcon from '@mui/icons-material/AddLink'
import { api } from '../api/client'
import type { DependencyList, DependencyRef, Timeline } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { FormDialog } from './FormDialog'

interface Props {
  /** The dependencies endpoint of this milestone or project, e.g. `/projects/p1/dependencies`. */
  path: string
  kind: 'milestone' | 'project'
  /** The milestone or project this panel is about (left out of the choices). */
  selfId: string
  /** The person may add and remove links. */
  canManage: boolean
  /** Ask the page to refresh after a change here. */
  onChanged: () => void
}

const WORD: Record<string, string> = { completed: 'Done', cancelled: 'Cancelled', pending: 'Not started', in_progress: 'In progress', planned: 'Planned', active: 'Active' }

function Tag({ r }: { r: DependencyRef }) {
  if (!r.visible) return <Chip size="small" variant="outlined" label="Not visible to you" />
  return <Chip size="small" color={r.isDone ? 'success' : r.status === 'cancelled' ? 'default' : 'warning'} variant={r.status === 'cancelled' ? 'outlined' : 'filled'} label={r.isDone ? 'Done' : r.status === 'cancelled' ? 'Cancelled' : `Waiting: ${WORD[r.status] ?? r.status}`} />
}

function Row({ r, kind, canRemove, onRemove }: { r: DependencyRef; kind: Props['kind']; canRemove: boolean; onRemove?: () => void }) {
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: 1, borderColor: 'rgba(8,112,105,.12)', flexWrap: 'wrap' }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.name}</Typography>
        {kind === 'milestone' && r.projectName && <Typography variant="caption" color="text.secondary">{r.projectName}</Typography>}
        {r.scheduleConflict && (
          <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>
            Planned to start before this is due
          </Typography>
        )}
      </Box>
      <Tag r={r} />
      {canRemove && onRemove && (
        <Tooltip title="Remove this dependency">
          <IconButton size="small" aria-label={`Remove dependency: ${r.name}`} onClick={onRemove}><RemoveIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
    </Box>
  )
}

function Group({ title, items, kind, empty, canRemove, onRemove }: { title: string; items: DependencyRef[]; kind: Props['kind']; empty: string; canRemove: boolean; onRemove?: (r: DependencyRef) => void }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" component="h4">{title}</Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{empty}</Typography>
      ) : (
        <Box component="ul" aria-label={title} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {items.map((r) => <Row key={r.id} r={r} kind={kind} canRemove={canRemove} onRemove={onRemove ? () => onRemove(r) : undefined} />)}
        </Box>
      )}
    </Box>
  )
}

/** What this milestone or project waits for, and what waits for it, with add and remove for its manager. */
export function DependencyPanel({ path, kind, selfId, canManage, onChanged }: Props) {
  const state = useApi(() => api.get<DependencyList>(path), [path])
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const noun = kind === 'milestone' ? 'milestone' : 'project'

  const remove = async (r: DependencyRef) => {
    setMessage(null)
    try {
      await api.post(`${path}/${r.id}/archive`)
      state.reload()
      onChanged()
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const list = state.data
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="overline" component="h3">Dependencies</Typography>
        {canManage && <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setAdding(true)}>Add dependency</Button>}
      </Stack>
      {state.error && !list && <Alert severity="error">{state.error}</Alert>}
      {message && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setMessage(null)}>{message}</Alert>}
      {list && (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Group title={`Waits for`} items={list.blockedBy} kind={kind} canRemove={canManage} onRemove={remove} empty={`This ${noun} does not wait for anything.`} />
          <Group title="Waited on by" items={list.blocks} kind={kind} canRemove={false} empty={`Nothing waits for this ${noun}.`} />
        </Box>
      )}
      {list?.isBlocked && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          This {noun} cannot be {kind === 'milestone' ? 'started or completed' : 'completed'} until what it waits for is done.
        </Alert>
      )}
      {adding && (
        <AddDialog
          path={path} kind={kind} selfId={selfId} taken={new Set((list?.blockedBy ?? []).map((r) => r.itemId))}
          onClose={() => setAdding(false)} onDone={() => { state.reload(); onChanged() }}
        />
      )}
    </Box>
  )
}

function AddDialog({ path, kind, selfId, taken, onClose, onDone }: { path: string; kind: Props['kind']; selfId: string; taken: Set<string | null>; onClose: () => void; onDone: () => void }) {
  const timeline = useApi(() => api.get<Timeline>('/reports/timeline'), [])
  const [chosen, setChosen] = useState('')
  const options =
    kind === 'project'
      ? (timeline.data?.projects ?? []).map((p) => ({ id: p.id, label: p.name }))
      : (timeline.data?.projects ?? []).flatMap((p) => p.milestones.map((m) => ({ id: m.id, label: `${p.name} · ${m.name}` })))
  const free = options.filter((o) => o.id !== selfId && !taken.has(o.id))

  return (
    <FormDialog
      open title={`Add a ${kind} dependency`} submitLabel="Add dependency" submitDisabled={!chosen} onClose={onClose}
      onSubmit={async () => {
        await api.post(path, kind === 'project' ? { dependsOnProjectId: chosen } : { dependsOnMilestoneId: chosen })
        onDone()
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Choose what this {kind} must wait for. It cannot be {kind === 'milestone' ? 'started or completed' : 'completed'} until that one is completed.
        {kind === 'milestone' ? ' You can choose a milestone in any project you manage.' : ' You can choose any project you manage.'}
      </Typography>
      <TextField select label={`Waits for this ${kind}`} value={chosen} onChange={(e) => setChosen(e.target.value)} required>
        {free.map((o) => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
      </TextField>
      {timeline.data && free.length === 0 && <Typography variant="body2" color="text.secondary">There is nothing else to choose.</Typography>}
    </FormDialog>
  )
}
