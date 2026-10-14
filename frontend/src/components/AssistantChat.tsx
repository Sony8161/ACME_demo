import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Box, Chip, Fab, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import CloseIcon from '@mui/icons-material/Close'
import ClearIcon from '@mui/icons-material/DeleteSweepOutlined'
import SendIcon from '@mui/icons-material/SendOutlined'
import { api } from '../api/client'
import type { AssistantStatus, ChatMessage, ChatReply, Role } from '../api/types'
import { errorText } from '../api/useApi'

const SUGGESTIONS: Record<Role, string[]> = {
  employee: ['What am I working on?', 'Show my tasks', 'What is late?'],
  manager: ['What is late?', 'What is blocked?', 'Who is free this week?', 'List all projects'],
  admin: ['What is late?', 'What is blocked?', 'Who is free this week?', 'List all projects'],
}

const LOOKED_AT: Record<string, string> = {
  attention: 'what needs attention', list_projects: 'your projects', project_details: 'project details', my_tasks: 'your tasks',
  my_work: 'your work', who_is_free: 'who is free',
}

interface Turn extends ChatMessage { toolsUsed?: string[]; notice?: string | null }

/**
 * A chat box on every screen. It asks the server, which answers from read-only lookups made with your own permissions, so it
 * can only tell you what you could see yourself. The conversation lives in this component (and is gone when you sign out).
 */
export function AssistantChat({ role, compact }: { role: Role; compact: boolean }) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    if (status === null) api.get<AssistantStatus>('/assistant/status').then(setStatus).catch(() => undefined)
  }, [open, status])

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [turns, busy])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    const next: Turn[] = [...turns, { role: 'user', content: q }]
    setTurns(next)
    setText('')
    setError(null)
    setBusy(true)
    try {
      const answer = await api.post<ChatReply>('/assistant/chat', { messages: next.map(({ role: r, content }) => ({ role: r, content })) })
      setTurns([...next, { role: 'assistant', content: answer.reply, toolsUsed: answer.toolsUsed, notice: answer.notice }])
      setStatus((s) => (s ? { ...s, mode: answer.mode } : s))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void ask(text)
  }

  if (!open) {
    return (
      <Tooltip title="Ask the assistant">
        <Fab
          color="primary" variant="extended" aria-label="Ask the assistant" onClick={() => setOpen(true)}
          sx={{ position: 'fixed', right: 20, bottom: compact ? 84 : 24, zIndex: (t) => t.zIndex.modal - 1, borderRadius: '4px', boxShadow: 'none', border: '1px solid', borderColor: 'primary.main', bgcolor: 'primary.light', color: '#052e2b', '&:hover': { bgcolor: '#5eead4' } }}
        >
          <ChatIcon sx={{ mr: 1 }} /> Assistant
        </Fab>
      </Tooltip>
    )
  }

  return (
    <Paper
      role="complementary" aria-label="Assistant" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      sx={{
        position: 'fixed', right: { xs: 8, sm: 20 }, bottom: compact ? 76 : 20, zIndex: (t) => t.zIndex.modal - 1, width: { xs: 'calc(100vw - 16px)', sm: 400 },
        height: { xs: 'min(72vh, 560px)', sm: 540 }, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid', borderColor: 'primary.main',
        boxShadow: '6px 6px 0 rgba(45,212,191,.45)',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 1, bgcolor: 'rgba(94,234,212,.22)', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>Assistant</Typography>
        {status && <Chip size="small" variant="outlined" label={status.mode === 'ai' ? 'AI' : 'Built-in'} />}
        <Tooltip title="Clear the conversation">
          <span><IconButton size="small" aria-label="Clear the conversation" disabled={turns.length === 0 || busy} onClick={() => { setTurns([]); setError(null) }}><ClearIcon fontSize="small" /></IconButton></span>
        </Tooltip>
        <IconButton size="small" aria-label="Close the assistant" onClick={() => setOpen(false)}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Box role="log" aria-label="Conversation" aria-live="polite" tabIndex={0} sx={{ flexGrow: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {turns.length === 0 && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Ask about your projects, milestones and tasks. I can only read: I see what you can see, and I change nothing.
            </Typography>
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
              {SUGGESTIONS[role].map((s) => <Chip key={s} label={s} onClick={() => void ask(s)} variant="outlined" clickable />)}
            </Stack>
          </Box>
        )}
        {turns.map((t, i) => (
          <Box key={i} sx={{ alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
            <Typography variant="overline" sx={{ display: 'block', textAlign: t.role === 'user' ? 'right' : 'left' }}>{t.role === 'user' ? 'You' : 'Assistant'}</Typography>
            <Box
              sx={{
                p: 1.25, borderRadius: '3px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.875rem', border: 1, borderColor: 'divider',
                bgcolor: t.role === 'user' ? 'rgba(94,234,212,.3)' : '#ffffff',
              }}
            >
              {t.content}
            </Box>
            {t.notice && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{t.notice}</Typography>}
            {t.toolsUsed && t.toolsUsed.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Looked at: {t.toolsUsed.map((n) => LOOKED_AT[n] ?? n).join(', ')}
              </Typography>
            )}
          </Box>
        ))}
        {busy && <Typography variant="body2" color="text.secondary" role="status">Thinking…</Typography>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        <div ref={end} />
      </Box>

      <Box component="form" onSubmit={submit} sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: '#ffffff' }}>
        <TextField
          inputRef={input} size="small" fullWidth placeholder="Ask a question" value={text} onChange={(e) => setText(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Your question', maxLength: 2000 } }}
        />
        <Tooltip title="Send">
          <span>
            <IconButton type="submit" aria-label="Send" color="primary" disabled={busy || !text.trim()} sx={{ border: 1, borderRadius: '3px', borderColor: 'primary.main' }}>
              <SendIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Paper>
  )
}
