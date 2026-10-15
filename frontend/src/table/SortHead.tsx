import { TableCell, TableSortLabel, type TableCellProps } from '@mui/material'
import type { Direction } from './sort'

interface Props {
  label: string
  active: boolean
  dir: Direction
  onSort: () => void
  align?: TableCellProps['align']
}

/** A column header that sorts when pressed (mouse, Enter or Space) and tells a screen reader the direction. */
export function SortHead({ label, active, dir, onSort, align }: Props) {
  return (
    <TableCell align={align} sortDirection={active ? dir : false}>
      <TableSortLabel active={active} direction={active ? dir : 'asc'} onClick={onSort}>{label}</TableSortLabel>
    </TableCell>
  )
}
