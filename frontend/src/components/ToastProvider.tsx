import { useState, type ReactNode } from 'react'
import { Button, Snackbar } from '@mui/material'
import { ToastContext, type Toast } from './toast'

/** Shows the toasts that `useToast()` asks for. One at a time: a new one replaces the old. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)

  const undo = async () => {
    const run = toast?.undo
    setToast(null)
    if (run) await run()
  }

  return (
    <ToastContext.Provider value={setToast}>
      {children}
      <Snackbar
        open={toast !== null} autoHideDuration={6000} onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        message={toast?.message} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        action={toast?.undo ? <Button color="inherit" size="small" onClick={undo}>Undo</Button> : undefined}
      />
    </ToastContext.Provider>
  )
}
