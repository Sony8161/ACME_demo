import { Box, Typography } from '@mui/material'

/** One figure with its label above it: the single replacement for the near-identical tiles and facts the screens used to carry. */
export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Box>
      <Typography variant="overline" component="p">{label}</Typography>
      <Typography variant="body1" component="p" sx={{ fontWeight: 700, color: tone }}>{value}</Typography>
      {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
    </Box>
  )
}
