import { useState } from 'react'
import { FormControlLabel, Stack, Switch } from '@mui/material'
import { api } from '../api/client'
import type { TaskList, Timeline } from '../api/types'
import { useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { TimelineChart, type TimelineRow } from '../components/TimelineChart'
import { TimelineLegend } from '../components/TimelineLegend'
import { dateRange, formatDate } from '../format'
import { STATUS_LABEL } from '../tasks'
import { RISK_TONE, type Tone } from '../timeline'

/** The project's milestones as bars on a calendar, with each task as a diamond on its due date. For its manager and admins. */
export function ProjectTimeline({ projectId }: { projectId: string }) {
  const [showTasks, setShowTasks] = useState(true)
  const timeline = useApi(() => api.get<Timeline>('/reports/timeline', { project_id: projectId }), [projectId])
  const tasks = useApi(() => api.get<TaskList>(`/projects/${projectId}/tasks`), [projectId])

  return (
    <Async state={timeline}>
      {(t) => {
        const project = t.projects[0]
        if (!project) return null
        const rows: TimelineRow[] = [{
          key: project.id, label: project.name, sublabel: dateRange(project.startDate, project.endDate), tone: RISK_TONE[project.riskLevel],
          start: project.startDate, end: project.endDate, summary: `Project ${project.name}, ${dateRange(project.startDate, project.endDate)}`,
        }]
        for (const m of project.milestones) {
          const tone: Tone = m.status === 'completed' ? 'quiet' : m.isOverdue ? 'bad' : 'brand'
          const pct = m.tasksTotal ? (100 * m.tasksDone) / m.tasksTotal : m.status === 'completed' ? 100 : 0
          rows.push({
            key: m.id, label: m.name, indent: true, tone, start: m.startDate, end: m.dueDate, progress: m.status === 'completed' ? 100 : pct,
            sublabel: `${dateRange(m.startDate, m.dueDate)}${m.status === 'completed' ? ' · signed off' : m.isOverdue ? ' · late' : ''}${m.blockedByCount ? ` · waiting for ${m.blockedByCount}` : ''}`,
            summary: `Milestone ${m.name}, ${dateRange(m.startDate, m.dueDate)}, ${m.tasksDone} of ${m.tasksTotal} tasks done${m.isOverdue ? ', late' : ''}${m.blockedByCount ? `, waiting for ${m.blockedByCount} milestone(s)` : ''}`,
          })
          if (showTasks) {
            for (const task of (tasks.data?.items ?? []).filter((x) => x.milestoneId === m.id)) {
              const tone: Tone = task.status === 'done' ? 'good' : task.isOverdue ? 'bad' : 'brand'
              rows.push({
                key: task.id, label: task.name, indent: true, tone,
                sublabel: task.dueDate ? `due ${formatDate(task.dueDate)} · ${STATUS_LABEL[task.status]}` : `no due date · ${STATUS_LABEL[task.status]}`,
                markers: task.dueDate ? [{ date: task.dueDate, tone, title: `${task.name}: due ${formatDate(task.dueDate)}` }] : [],
                summary: `Task ${task.name}, ${task.dueDate ? `due ${formatDate(task.dueDate)}` : 'no due date'}, ${STATUS_LABEL[task.status]}`,
              })
            }
          }
        }
        return (
          <Stack spacing={1}>
            <FormControlLabel control={<Switch checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />} label="Show tasks" />
            <TimelineChart rows={rows} today={t.asOf} label="Project timeline" footer={<TimelineLegend tasks={showTasks} />} />
          </Stack>
        )
      }}
    </Async>
  )
}
