import { Typography } from '@mui/material'

/** One line that says how to read the chart. */
export function TimelineLegend({ tasks }: { tasks: boolean }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
      A bar runs from start to end; the filled part is the work done. {tasks ? 'A diamond is a task’s due date. ' : ''}
      Red means late, and the vertical line is today.
    </Typography>
  )
}
