import { useState, type FormEvent, type ReactNode } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, useMediaQuery, useTheme } from '@mui/material'
import { errorText } from '../api/useApi'

interface Props {
  open: boolean
  title: string
  submitLabel: string
  onClose: () => void
  /** Runs when the form is submitted. A thrown API error is shown in the dialog; success closes it. */
  onSubmit: () => Promise<unknown>
  children?: ReactNode
  submitDisabled?: boolean
  danger?: boolean
  /** What the cancel button says; defaults to "Cancel". */
  cancelLabel?: string
}

/** One dialog for every "fill in a few fields and confirm" action, so errors and busy states behave the same everywhere. */
export function FormDialog({ open, title, submitLabel, onClose, onSubmit, children, submitDisabled, danger, cancelLabel = 'Cancel' }: Props) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm')) // a phone gets the whole screen, not a cramped box
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" fullScreen={narrow}>
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {children}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={busy}>{cancelLabel}</Button>
          <Button type="submit" variant="contained" color={danger ? 'error' : 'primary'} disabled={busy || submitDisabled}>
            {busy ? 'Working…' : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
