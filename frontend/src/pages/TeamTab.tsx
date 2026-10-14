import { IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import { api } from '../api/client'
import type { AssigneeList } from '../api/types'
import { useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { dateRange, hours, money } from '../format'

/** Everyone working on any milestone of the project, with the hours and cost the calendar produces. */
export function TeamTab({ projectId }: { projectId: string }) {
  const state = useApi(() => api.get<AssigneeList>(`/projects/${projectId}/team`), [projectId])
  return (
    <Async state={state}>
      {(team) => (
        <>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 0.5 }}>
            <Typography variant="overline" component="h3">Team</Typography>
            <Tooltip title='Hours are not typed in. Every Monday to Friday of an assignment is an 8-hour shift. "Expected" is the whole range at the rate it was planned at; "so far" counts up to today.'>
              <IconButton aria-label="How hours are counted" sx={{ width: 40, height: 40 }}><InfoIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Milestone</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell align="right">Days</TableCell>
                  <TableCell align="right">Hours so far</TableCell>
                  <TableCell align="right">Expected hours</TableCell>
                  {team.laborCost !== null && <TableCell align="right">Cost so far</TableCell>}
                  {team.laborCost !== null && <TableCell align="right">Expected cost</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {team.items.map((a) => (
                  <TableRow key={a.assignmentId}>
                    <TableCell>{a.name}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{a.jobTitle}</Typography></TableCell>
                    <TableCell>{a.milestoneName}</TableCell>
                    <TableCell>{dateRange(a.startDate, a.endDate)}</TableCell>
                    <TableCell align="right">{a.daysWorked}</TableCell>
                    <TableCell align="right">{hours(a.hoursWorked)}</TableCell>
                    <TableCell align="right">{hours(a.expectedHours)}</TableCell>
                    {team.laborCost !== null && <TableCell align="right">{money(a.laborCost)}</TableCell>}
                    {team.laborCost !== null && (
                      <TableCell align="right">
                        {money(a.expectedCost)}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>at {money(a.hourlyRate)}/h</Typography>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {team.items.length === 0 && <TableRow><TableCell colSpan={8}><Typography color="text.secondary">Nobody is assigned yet. Assign people from a milestone on the Plan tab.</Typography></TableCell></TableRow>}
                {team.items.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={4}><strong>Total</strong></TableCell>
                    <TableCell align="right"><strong>{hours(team.hoursWorked)}</strong></TableCell>
                    <TableCell align="right"><strong>{hours(team.expectedHours)}</strong></TableCell>
                    {team.laborCost !== null && <TableCell align="right"><strong>{money(team.laborCost)}</strong></TableCell>}
                    {team.laborCost !== null && <TableCell align="right"><strong>{money(team.expectedCost)}</strong></TableCell>}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Async>
  )
}
