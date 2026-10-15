import { useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, FormHelperText, Radio, RadioGroup, Typography } from '@mui/material'
import type { ExportColumn } from '../export/columns'
import { downloadCsv } from '../export/csv'
import { saveBlob } from '../export/download'
import { buildTablePdf } from '../export/pdf'

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

/** Pick the columns and the format (CSV or PDF), then save the rows. The columns offered are only the ones this person may see. */
export function ExportDialog<T>(props: Props<T>) {
  // Remounted on every open, so each export starts with every column ticked.
  return props.open ? <Picker {...props} /> : null
}

function Picker<T>({ noun, nounOne, rows, columns, filename, onClose, onExported }: Props<T>) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set(columns.map((c) => c.key)))
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const chosen = columns.filter((c) => ticked.has(c.key))
  const shownName = format === 'pdf' ? filename.replace(/\.csv$/, '.pdf') : filename
  const toggle = (key: string) => setTicked((s) => { const next = new Set(s); if (!next.delete(key)) next.add(key); return next })

  const download = async () => {
    const head = chosen.map((c) => c.label)
    const body = rows.map((r) => chosen.map((c) => c.get(r)))
    if (format === 'csv') {
      downloadCsv(filename, [head, ...body])
    } else {
      setBusy(true)
      setFailed(false)
      try {
        const title = noun.charAt(0).toUpperCase() + noun.slice(1)
        saveBlob(shownName, await buildTablePdf({ title, subtitle: `${rows.length} ${rows.length === 1 ? nounOne : noun} · ${new Date().toISOString().slice(0, 10)} UTC`, head, rows: body }))
      } catch {
        setFailed(true)
        setBusy(false)
        return
      }
    }
    onExported(rows.length)
    onClose()
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Export {rows.length} {rows.length === 1 ? nounOne : noun}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Choose what goes in the file. A CSV opens in Excel, Numbers or Google Sheets; a PDF is ready to read or print.</Typography>
        <RadioGroup row aria-label="Format" value={format} onChange={(_, v) => setFormat(v as 'csv' | 'pdf')} sx={{ mb: 1 }}>
          <FormControlLabel value="csv" control={<Radio />} label="CSV" />
          <FormControlLabel value="pdf" control={<Radio />} label="PDF" />
        </RadioGroup>
        <FormGroup>
          {columns.map((c) => (
            <FormControlLabel key={c.key} label={c.label} control={<Checkbox checked={ticked.has(c.key)} onChange={() => toggle(c.key)} />} />
          ))}
        </FormGroup>
        {chosen.length === 0 && <FormHelperText error>Tick at least one column.</FormHelperText>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{shownName}</Typography>
        {failed && <Alert severity="error" sx={{ mt: 1.5 }}>The PDF could not be made.</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={download} disabled={chosen.length === 0 || busy}>{busy ? 'Preparing…' : `Download ${format.toUpperCase()}`}</Button>
      </DialogActions>
    </Dialog>
  )
}
