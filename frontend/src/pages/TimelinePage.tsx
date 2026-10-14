import { useState } from 'react'
import { FormControlLabel, Stack, Switch } from '@mui/material'
import { api } from '../api/client'
import type { Timeline } from '../api/types'
import { useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { TimelineChart, type TimelineRow } from '../components/TimelineChart'
import { TimelineLegend } from '../components/TimelineLegend'
import { dateRange } from '../format'
import { RISK_TONE, type Tone } from '../timeline'

/** Every open project (a manager's own, or all of them) on one calendar, with its milestones underneath. A view of the Projects page. */
export function TimelineView() {
  const [showMilestones, setShowMilestones] = useState(true)
  const state = useApi(() => api.get<Timeline>('/reports/timeline'), [])

  return (
    <Async state={state}>
      {(t) => {
        const rows: TimelineRow[] = []
        for (const p of t.projects) {
          rows.push({
            key: p.id, label: p.name, to: `/projects/${p.id}`, tone: RISK_TONE[p.riskLevel], start: p.startDate, end: p.endDate,
            sublabel: `${p.managerName} · ${dateRange(p.startDate, p.endDate)}${p.blockedByCount ? ` · waiting for ${p.blockedByCount}` : ''}`,
            summary: `Project ${p.name}, managed by ${p.managerName}, ${dateRange(p.startDate, p.endDate)}`,
          })
          if (showMilestones) {
            for (const m of p.milestones) {
              const tone: Tone = m.status === 'completed' ? 'quiet' : m.isOverdue ? 'bad' : 'brand'
              rows.push({
                key: m.id, label: m.name, indent: true, tone, start: m.startDate, end: m.dueDate,
                progress: m.status === 'completed' ? 100 : m.tasksTotal ? (100 * m.tasksDone) / m.tasksTotal : 0,
                sublabel: `${dateRange(m.startDate, m.dueDate)}${m.blockedByCount ? ` · waiting for ${m.blockedByCount}` : ''}`,
                summary: `Milestone ${m.name} of ${p.name}, ${dateRange(m.startDate, m.dueDate)}${m.isOverdue ? ', late' : ''}`,
              })
            }
          }
        }
        return (
          <Stack spacing={1}>
            <FormControlLabel control={<Switch checked={showMilestones} onChange={(e) => setShowMilestones(e.target.checked)} />} label="Show milestones" />
            <TimelineChart rows={rows} today={t.asOf} label="All projects" footer={<TimelineLegend tasks={false} />} />
          </Stack>
        )
      }}
    </Async>
  )
}
