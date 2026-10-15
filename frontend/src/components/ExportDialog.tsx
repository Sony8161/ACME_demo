import { useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, FormHelperText, Typography } from '@mui/material'
import type { ExportColumn } from '../export/columns'
import { downloadCsv } from '../export/csv'

interface Props<T> {
  open: boolean
  /** What the rows are, plural ("people") and singular ("person"), for the title. */
  noun: string
  nounOne: string
  rows: T[]
  columns: ExportColumn<T>[]
  filename: string
  onClose: () => void
  onExported: (count: number) => void
}

/** Pick the columns, then save the rows as a CSV file. The columns offered are only the ones this person may see. */
export function ExportDialog<T>(props: Props<T>) {
  // Remounted on every open, so each export starts with every column ticked.
  return props.open ? <Picker {...props} /> : null
}

function Picker<T>({ noun, nounOne, rows, columns, filename, onClose, onExported }: Props<T>) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set(columns.map((c) => c.key)))
  const chosen = columns.filter((c) => ticked.has(c.key))
  const toggle = (key: string) => setTicked((s) => { const next = new Set(s); if (!next.delete(key)) next.add(key); return next })

  const download = () => {
    downloadCsv(filename, [chosen.map((c) => c.label), ...rows.map((r) => chosen.map((c) => c.get(r)))])
    onExported(rows.length)
    onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Export {rows.length} {rows.length === 1 ? nounOne : noun}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Choose what goes in the file. It opens in Excel, Numbers or Google Sheets.</Typography>
        <FormGroup>
          {columns.map((c) => (
            <FormControlLabel key={c.key} label={c.label} control={<Checkbox checked={ticked.has(c.key)} onChange={() => toggle(c.key)} />} />
          ))}
        </FormGroup>
        {chosen.length === 0 && <FormHelperText error>Tick at least one column.</FormHelperText>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{filename}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={download} disabled={chosen.length === 0}>Download CSV</Button>
      </DialogActions>
    </Dialog>
  )
}
