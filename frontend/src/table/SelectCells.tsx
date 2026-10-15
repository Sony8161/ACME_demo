import { Checkbox, TableCell } from '@mui/material'

const BOX = { p: '10px' } // 24 px box + 10 px each side = a 44 px target

/** The tick box at the start of a row. `label` names the row for screen readers ("Select Alex Kim"). */
export function SelectCell({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <TableCell padding="checkbox">
      <Checkbox checked={checked} onChange={(_, on) => onChange(on)} slotProps={{ input: { 'aria-label': label } }} sx={BOX} />
    </TableCell>
  )
}

/** The tick box in the header: ticks or unticks the rows on this page; half ticked when only some are. */
export function SelectAllCell({ pageIds, ticked, onChange }: { pageIds: string[]; ticked: ReadonlySet<string>; onChange: (on: boolean) => void }) {
  const n = pageIds.filter((id) => ticked.has(id)).length
  const all = pageIds.length > 0 && n === pageIds.length
  return (
    <TableCell padding="checkbox">
      <Checkbox
        checked={all} indeterminate={n > 0 && !all} disabled={pageIds.length === 0} onChange={() => onChange(!all)}
        slotProps={{ input: { 'aria-label': `Select all ${pageIds.length} on this page` } }} sx={BOX}
      />
    </TableCell>
  )
}
