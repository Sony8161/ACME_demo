import { useState } from 'react'
import { Typography } from '@mui/material'
import { api } from '../api/client'
import type { DemoSeedResult } from '../api/types'
import { ConfirmDialog } from './ConfirmDialog'
import { CredentialsDialog } from './CredentialsDialog'
import { useToast } from './toast'

interface Props {
  open: boolean
  onClose: () => void
  /** The sample people exist now and their passwords were saved: reload whatever is on screen. */
  onDone: () => void
}

/** Add the made-up company to a live site: ask first, then show the one-time passwords of whoever was created. */
export function SampleDataFlow({ open, onClose, onDone }: Props) {
  const toast = useToast()
  const [logins, setLogins] = useState<DemoSeedResult['accounts'] | null>(null)

  return (
    <>
      <ConfirmDialog
        open={open} title="Add sample people and projects?" confirmLabel="Add sample data" onClose={onClose}
        onConfirm={async () => {
          const result = await api.post<DemoSeedResult>('/admin/seed-demo')
          if (result.created) setLogins(result.accounts)
          else toast({ message: 'Sample data is already loaded' })
        }}
      >
        <Typography>
          This adds a made-up company: managers, employees, projects and tasks, so the screens have something to show.
          Nothing you already have is changed or removed, and anything that is already loaded is skipped.
        </Typography>
      </ConfirmDialog>
      <CredentialsDialog
        open={logins !== null} title="Sample accounts created"
        accounts={(logins ?? []).map((a) => ({ name: a.name, role: a.role, username: a.username, password: a.temporaryPassword }))}
        onClose={() => { setLogins(null); onDone() }}
      />
    </>
  )
}
