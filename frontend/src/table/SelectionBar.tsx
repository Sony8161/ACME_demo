import type { ReactNode } from 'react'
import { Button, Paper, Stack, Typography } from '@mui/material'

interface Props {
  count: number
  /** How many rows match the filters in all (more than one page). */
  total: number
  onSelectAll: () => void
  onClear: () => void
  /** Actions for the ticked rows (Export, bulk changes). */
  children?: ReactNode
}

/** Appears when something is ticked: how many, a way to take them all or none, and the actions that work on them. */
export function SelectionBar({ count, total, onSelectAll, onClear, children }: Props) {
  if (count === 0) return null
  return (
    <Paper variant="outlined" sx={{ p: 1, mb: 1.5, bgcolor: 'primary.light' }}>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Typography role="status" sx={{ fontWeight: 700, px: 1 }}>{count} selected</Typography>
        {total > count && <Button size="small" onClick={onSelectAll}>Select all {total}</Button>}
        <Button size="small" onClick={onClear}>Clear</Button>
        {children}
      </Stack>
    </Paper>
  )
}
