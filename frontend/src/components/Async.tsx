import type { ReactNode } from 'react'
import { Alert, Box, Button, Skeleton } from '@mui/material'
import type { Loadable } from '../api/useApi'

/** Shows grey placeholder rows while loading and a readable error with a retry button; renders children once there is data. */
export function Async<T>({ state, children }: { state: Loadable<T>; children: (data: T) => ReactNode }) {
  if (state.data !== null) {
    return (
      <>
        {state.error && (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={state.reload}>Try again</Button>}>
            {state.error}
          </Alert>
        )}
        {children(state.data)}
      </>
    )
  }
  if (state.error) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={state.reload}>Try again</Button>}>
        {state.error}
      </Alert>
    )
  }
  return (
    <Box role="progressbar" aria-label="Loading" aria-busy sx={{ py: 1 }}>
      {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={i === 0 ? 28 : 56} sx={{ mb: 1.5, width: i === 0 ? '40%' : '100%' }} />)}
    </Box>
  )
}
