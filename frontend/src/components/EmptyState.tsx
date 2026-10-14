import { Box, Button, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

interface Props {
  text: string
  /** The one thing to do about it: a button, or a link when `to` is given. */
  action?: { label: string; onClick?: () => void; to?: string }
}

/** "Nothing here" with one way forward, instead of a sentence that explains the emptiness. */
export function EmptyState({ text, action }: Props) {
  return (
    <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }}>
      <Typography color="text.secondary">{text}</Typography>
      {action && (action.to
        ? <Button variant="outlined" component={RouterLink} to={action.to}>{action.label}</Button>
        : <Button variant="outlined" onClick={action.onClick}>{action.label}</Button>)}
    </Box>
  )
}
