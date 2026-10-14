import { useState } from 'react'
import { Alert, Box, Button, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import RemoveIcon from '@mui/icons-material/LinkOff'
import LinkIcon from '@mui/icons-material/AddLink'
import { api } from '../api/client'
import type { DependencyList, DependencyRef, Timeline } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { FormDialog } from './FormDialog'
import { useToast } from './toast'

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
  /**
   * When the page holds the "add" state itself (a menu opens it), the panel draws no button of its own and says nothing
   * while there is nothing to show. Left out, the panel is self-contained.
   */
  adding?: boolean
  onAddingChange?: (adding: boolean) => void
}

const WORD: Record<string, string> = { completed: 'Done', cancelled: 'Cancelled', pending: 'Not started', in_progress: 'In progress', planned: 'Planned', active: 'Active' }

function Tag({ r }: { r: DependencyRef }) {
  if (!r.visible) return <Chip size="small" variant="outlined" label="Not visible to you" />
  return (
    <Chip
      size="small" color={r.isDone ? 'success' : r.status === 'cancelled' ? 'default' : 'warning'} variant={r.status === 'cancelled' ? 'outlined' : 'filled'}
      label={r.isDone ? 'Done' : r.status === 'cancelled' ? 'Cancelled' : `Waiting: ${WORD[r.status] ?? r.status}`}
    />
  )
}

function Row({ r, kind, canRemove, onRemove }: { r: DependencyRef; kind: Props['kind']; canRemove: boolean; onRemove?: () => void }) {
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.name}</Typography>
        {kind === 'milestone' && r.projectName && <Typography variant="body2" color="text.secondary">{r.projectName}</Typography>}
        {r.scheduleConflict && <Typography variant="body2" sx={{ color: 'warning.dark' }}>Planned to start before this is due</Typography>}
      </Box>
      <Tag r={r} />
      {canRemove && onRemove && (
        <Tooltip title="Remove this dependency">
          <IconButton aria-label={`Remove dependency: ${r.name}`} onClick={onRemove} sx={{ width: 40, height: 40 }}><RemoveIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
    </Box>
  )
}

function Group({ title, items, kind, canRemove, onRemove }: { title: string; items: DependencyRef[]; kind: Props['kind']; canRemove: boolean; onRemove?: (r: DependencyRef) => void }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" component="h4">{title}</Typography>
      <Box component="ul" aria-label={title} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {items.map((r) => <Row key={r.id} r={r} kind={kind} canRemove={canRemove} onRemove={onRemove ? () => onRemove(r) : undefined} />)}
      </Box>
    </Box>
  )
}

/** What this milestone or project waits for, and what waits for it, with add and remove for its manager. Shows only what exists. */
export function DependencyPanel({ path, kind, selfId, canManage, onChanged, adding: addingProp, onAddingChange }: Props) {
  const state = useApi(() => api.get<DependencyList>(path), [path])
  const [addingOwn, setAddingOwn] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const toast = useToast()
  const controlled = addingProp !== undefined
  const adding = controlled ? addingProp : addingOwn
  const setAdding = (v: boolean) => (controlled ? onAddingChange?.(v) : setAddingOwn(v))
  const noun = kind === 'milestone' ? 'milestone' : 'project'
  const list = state.data
  const empty = !list || (list.blockedBy.length === 0 && list.blocks.length === 0)

  const remove = async (r: DependencyRef) => {
    setMessage(null)
    try {
      await api.post(`${path}/${r.id}/archive`)
      state.reload()
      onChanged()
      toast({
        message: `Removed the dependency on ${r.name}`,
        undo: r.itemId
          ? async () => {
              await api.post(path, kind === 'project' ? { dependsOnProjectId: r.itemId } : { dependsOnMilestoneId: r.itemId })
              state.reload()
              onChanged()
            }
          : undefined,
      })
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  return (
    <Box>
      {!controlled && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="overline" component="h3">Dependencies</Typography>
          {canManage && <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setAdding(true)}>Add dependency</Button>}
        </Stack>
      )}
      {state.error && !list && <Alert severity="error">{state.error}</Alert>}
      {message && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setMessage(null)}>{message}</Alert>}
      {!controlled && list && empty && <Typography variant="body2" color="text.secondary">No dependencies yet.</Typography>}
      {list && !empty && (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: list.blockedBy.length && list.blocks.length ? '1fr 1fr' : '1fr' } }}>
          {list.blockedBy.length > 0 && <Group title="Waits for" items={list.blockedBy} kind={kind} canRemove={canManage} onRemove={remove} />}
          {list.blocks.length > 0 && <Group title="Waited on by" items={list.blocks} kind={kind} canRemove={false} />}
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
      </Typography>
      <TextField select label={`Waits for this ${kind}`} value={chosen} onChange={(e) => setChosen(e.target.value)} required>
        {free.map((o) => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
      </TextField>
      {timeline.data && free.length === 0 && <Typography variant="body2" color="text.secondary">There is nothing else to choose.</Typography>}
    </FormDialog>
  )
}
