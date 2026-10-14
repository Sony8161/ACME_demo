import { IconButton, Tooltip } from '@mui/material'
import InfoIcon from '@mui/icons-material/InfoOutlined'

/** How to read the chart, kept out of the way behind an info icon instead of a sentence under every chart. */
export function TimelineLegend({ tasks }: { tasks: boolean }) {
  const text = `A bar runs from start to end; the filled part is the work done. ${tasks ? 'A diamond is a task’s due date. ' : ''}Red means late, and the vertical line is today.`
  return (
    <Tooltip title={text}>
      <IconButton size="small" aria-label="How to read this chart" sx={{ mt: 1 }}><InfoIcon fontSize="small" /></IconButton>
    </Tooltip>
  )
}
