import { useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api/client'
import type { CommentList, Task } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { formatDate, formatDateTime } from '../format'
import { PRIORITY_LABEL, STATUS_LABEL } from '../tasks'
import { Async } from './Async'

const LIMIT = 2000

interface Props {
  task: Task | null
  onClose: () => void
  /** A comment was added or removed: the page behind refreshes its counts. */
  onChanged: () => void
}

/** A task, and the thread of comments under it. Open to everyone who can see the project. */
export function TaskDetailDialog({ task, onClose, onChanged }: Props) {
  return task ? <Content key={task.id} task={task} onClose={onClose} onChanged={onChanged} /> : null
}

function Content({ task, onClose, onChanged }: { task: Task; onClose: () => void; onChanged: () => void }) {
  const base = `/projects/${task.projectId}/milestones/${task.milestoneId}/deliverables/${task.id}/comments`
  const comments = useApi(() => api.get<CommentList>(base), [base])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (run: () => Promise<unknown>, afterwards?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await run()
      afterwards?.()
      comments.reload()
      onChanged()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="task-title">
      <DialogTitle id="task-title" sx={{ overflowWrap: 'anywhere' }}>{task.name}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">{task.projectName} · {task.milestoneName}</Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, my: 1.5, alignItems: 'center' }}>
          <Chip size="small" variant="outlined" label={STATUS_LABEL[task.status]} />
          <Chip size="small" variant="outlined" label={PRIORITY_LABEL[task.priority]} />
          {task.dueDate && <Chip size="small" variant="outlined" label={`Due ${formatDate(task.dueDate)}`} />}
          <Typography variant="body2">{task.assigneeName ?? 'Unassigned'}</Typography>
        </Stack>
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mb: 2 }}>{task.description || 'No description.'}</Typography>

        <Typography variant="h6" component="h3" gutterBottom>Comments</Typography>
        <Async state={comments}>
          {(list) => list.items.length === 0 ? (
            <Typography color="text.secondary">No comments yet.</Typography>
          ) : (
            <List aria-label="Comments" disablePadding>
              {list.items.map((c) => (
                <ListItem key={c.id} disableGutters sx={{ display: 'block', borderTop: 1, borderColor: 'divider', py: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2"><strong>{c.authorName}</strong> <Typography component="span" variant="caption" color="text.secondary">{formatDateTime(c.createdAt)}</Typography></Typography>
                    {c.canRemove && (
                      <Button size="small" color="inherit" disabled={busy} aria-label={`Remove comment by ${c.authorName}`} onClick={() => act(() => api.post(`${base}/${c.id}/archive`))}>
                        Remove
                      </Button>
                    )}
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</Typography>
                </ListItem>
              ))}
            </List>
          )}
        </Async>

        <Box sx={{ mt: 2 }}>
          <TextField
            label="Add a comment" value={text} onChange={(e) => setText(e.target.value)} multiline minRows={2} fullWidth
            slotProps={{ htmlInput: { maxLength: LIMIT } }} helperText={text.length > 0 ? `${text.length} of ${LIMIT}` : ' '}
          />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={busy || text.trim() === ''} onClick={() => act(() => api.post(base, { body: text }), () => setText(''))}>Post</Button>
      </DialogActions>
    </Dialog>
  )
}
