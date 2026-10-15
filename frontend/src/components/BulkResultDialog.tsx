import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography } from '@mui/material'

interface Props {
  open: boolean
  title: string
  /** Past tense of what was done: "Archived", "Moved". */
  verb: string
  done: number
  failed: { name: string; message: string }[]
  onClose: () => void
}

/** What a bulk action did: how many worked, and for each row that did not, who it was and why. */
export function BulkResultDialog({ open, title, verb, done, failed, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography>
          {done > 0 ? `${verb} ${done}.` : 'Nothing was changed.'}
          {failed.length > 0 && ` ${failed.length} could not be done:`}
        </Typography>
        {failed.length > 0 && (
          <List dense aria-label="Rows that could not be done">
            {failed.map((f, i) => (
              <ListItem key={`${f.name}-${i}`} disableGutters>
                <ListItemText primary={f.name} secondary={f.message} slotProps={{ primary: { sx: { fontWeight: 700 } } }} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
