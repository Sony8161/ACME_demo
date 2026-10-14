import { Button, Stack, Typography } from '@mui/material'

/** Previous / next for a list the server returns one page at a time. Renders nothing when everything fits on one page. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages === 1) return null
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 2 }}>
      <Typography variant="body2" color="text.secondary">Page {page} of {pages} · {total} entries</Typography>
      <Button size="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </Stack>
  )
}
