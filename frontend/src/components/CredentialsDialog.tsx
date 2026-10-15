import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { downloadCsv } from '../export/csv'

export interface Credential {
  name: string
  role?: string
  username?: string
  password: string
}

interface Props {
  open: boolean
  title: string
  accounts: Credential[]
  onClose: () => void
}

/** The server generates usernames and passwords and shows each password exactly once; this is where the admin copies them. */
export function CredentialsDialog({ open, title, accounts, onClose }: Props) {
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => undefined)
  const all = accounts.map((a) => `${a.name}${a.role ? ` (${a.role})` : ''}: ${a.username ? `${a.username} / ` : ''}${a.password}`).join('\n')

  // Only the button closes it: a click outside or Esc would throw away a password that is shown once.
  return (
    <Dialog open={open} onClose={(_, reason) => { if (!reason) onClose() }} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent tabIndex={0} role="region" aria-label="One-time logins">
        <Alert severity="warning" sx={{ mb: 2 }}>
          These passwords are shown only once and are not stored in readable form. Copy them now. Each person must choose a new password at first sign-in.
          A downloaded file holds the passwords in plain text: keep it somewhere private and delete the file once you have handed them out.
        </Alert>
        <Stack spacing={1.5}>
          {accounts.map((a) => (
            <Box key={`${a.name}-${a.password}`} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>{a.name}{a.role ? ` · ${a.role}` : ''}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {a.username ? `username ${a.username}   ` : ''}password {a.password}
              </Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => copy(all)}>Copy all</Button>
        <Button onClick={() => downloadCsv('acme-logins.csv', [
          ['Name', 'Role', 'Username', 'Password'],
          ...accounts.map((a) => [a.name, a.role ?? '', a.username ?? '', a.password]),
        ])}>Download CSV</Button>
        <Button variant="contained" onClick={onClose}>I have saved them</Button>
      </DialogActions>
    </Dialog>
  )
}
