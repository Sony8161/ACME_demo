import { Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { Overview } from '../api/types'
import { formatDate } from '../format'

/** Who has a milestone today and who is free, with this week's hours. */
export function AvailabilityTable({ allocation }: { allocation: Overview['allocation'] }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small" aria-label="Availability">
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Today</TableCell>
            <TableCell>Working on</TableCell>
            <TableCell align="right">This week</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {allocation.map((p) => (
            <TableRow key={p.userId}>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                <Typography variant="body2" color="text.secondary">{p.jobTitle}</Typography>
              </TableCell>
              <TableCell>
                <Chip size="small" color={p.state === 'available' ? 'success' : 'default'} variant={p.state === 'available' ? 'filled' : 'outlined'} label={p.state === 'available' ? 'Free' : 'Busy'} />
              </TableCell>
              <TableCell>
                {p.currentWork ? (
                  <Typography variant="body2" component={RouterLink} to={`/projects/${p.currentWork.projectId}`} sx={{ color: 'inherit' }}>
                    {p.currentWork.milestoneName} · {p.currentWork.projectName}
                  </Typography>
                ) : p.nextWork ? (
                  <Typography variant="body2" color="text.secondary">Next: {p.nextWork.milestoneName} from {formatDate(p.nextWork.startDate)}</Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">Nothing planned</Typography>
                )}
              </TableCell>
              <TableCell align="right">{p.hoursThisWeek} of {p.weekCapacity} h</TableCell>
            </TableRow>
          ))}
          {allocation.length === 0 && <TableRow><TableCell colSpan={4}><Typography color="text.secondary">No employees yet.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
