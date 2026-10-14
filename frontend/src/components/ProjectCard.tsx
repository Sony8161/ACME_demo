import { Box, Chip, Link, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { Project } from '../api/types'
import { formatDate, percent } from '../format'
import { tint } from '../theme'
import { PulseBar } from './PulseBar'
import { RiskChip } from './RiskChip'

/**
 * One project as one compact row: its name (the link), its health, a thin progress bar, and one line of facts.
 * The whole row is clickable through the name, so a screen reader hears the name and not every figure.
 */
export function ProjectCard({ project }: { project: Project }) {
  const s = project.summary
  const reasons = s.riskReasons
  const facts = [
    project.manager.name,
    `${s.milestonesDone} of ${s.milestonesTotal} milestones`,
    `ends ${formatDate(project.endDate)}`,
    // The server sends no money to employees, so the figure is simply left out for them.
    ...(s.totalCost !== null ? [`${percent(s.budgetPct)} of budget used`] : []),
  ]
  return (
    <Paper sx={{ p: 2, position: 'relative', '&:hover': { borderColor: 'primary.main', bgcolor: tint.hover } }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          component={RouterLink} to={`/projects/${project.id}`} underline="none" variant="h6"
          sx={{ color: 'text.primary', minWidth: 0, '&::after': { content: '""', position: 'absolute', inset: 0 } }}
        >
          {project.name}
        </Link>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {project.blockedByCount > 0 && <Chip size="small" color="warning" label={`Waiting for ${project.blockedByCount}`} />}
          <RiskChip level={s.riskLevel} />
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{facts.join(' · ')}</Typography>
      <Box sx={{ my: 1.25 }}>
        <PulseBar schedulePct={s.schedulePct} workPct={s.milestonesPct} risk={s.riskLevel} />
      </Box>
      {reasons.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          {reasons[0]}{reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ''}
        </Typography>
      )}
    </Paper>
  )
}
