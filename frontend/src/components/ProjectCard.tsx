import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { Project } from '../api/types'
import { dateRange, money, percent } from '../format'
import { PulseBar } from './PulseBar'
import { RiskChip } from './RiskChip'

const EDGE = { on_track: 'success.main', at_risk: 'warning.main', overdue: 'error.main', done: 'text.disabled' } as const

/** One project at a glance: health, pulse bar, the reasons behind the health, and the key numbers. */
export function ProjectCard({ project }: { project: Project }) {
  const s = project.summary
  return (
    <Paper
      component={RouterLink}
      to={`/projects/${project.id}`}
      sx={{ display: 'block', p: 2.5, textDecoration: 'none', color: 'inherit', borderLeft: 6, borderLeftColor: EDGE[s.riskLevel], '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(94,234,212,.08)' } }}
    >
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" noWrap>{project.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {project.manager.name} · {dateRange(project.startDate, project.endDate)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {project.blockedByCount > 0 && <Chip size="small" color="warning" label={`Waiting for ${project.blockedByCount}`} />}
          <RiskChip level={s.riskLevel} />
        </Stack>
      </Stack>

      <Box sx={{ my: 2 }}>
        <PulseBar schedulePct={s.schedulePct} workPct={s.milestonesPct} risk={s.riskLevel} />
      </Box>

      {s.riskReasons.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {s.riskReasons.join(' · ')}
        </Typography>
      )}

      <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Fact label="Milestones" value={`${s.milestonesDone} of ${s.milestonesTotal}`} />
        <Fact label="Team" value={String(s.teamSize)} />
        {/* The server sends no money to employees, so the figures are simply left out for them. */}
        {s.totalCost !== null && <Fact label="Budget used" value={percent(s.budgetPct)} />}
        {s.totalCost !== null && <Fact label="Spent" value={money(s.totalCost)} />}
      </Stack>
    </Paper>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
    </Box>
  )
}
