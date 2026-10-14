import { useState } from 'react'
import { Alert, Box, Breadcrumbs, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Milestone, MilestoneList, Project } from '../api/types'
import { useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { Async } from '../components/Async'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DependencyPanel } from '../components/DependencyPanel'
import { EmptyState } from '../components/EmptyState'
import { DateField, NumberField } from '../components/fields'
import { FormDialog } from '../components/FormDialog'
import { MilestoneCard } from '../components/MilestoneCard'
import { PageHeader } from '../components/PageHeader'
import { PulseBar, type PulseTick } from '../components/PulseBar'
import { RiskChip, StatusChip } from '../components/RiskChip'
import { dateRange, formatDate, hours, money, todayIso } from '../format'
import { CostsTab } from './CostsTab'
import { ProjectHistory } from './ProjectHistory'
import { ProjectTimeline } from './ProjectTimeline'
import { TasksTab } from './TasksTab'
import { TeamTab } from './TeamTab'

type TabKey = 'plan' | 'tasks' | 'team' | 'history'
type Dialog = 'milestone' | 'complete' | 'archive' | 'dependencies' | null

/** Where a milestone's due date falls on the project's calendar, 0 to 100 (for the ticks on the pulse bar). */
function position(project: Project, iso: string): number {
  const day = (s: string) => new Date(`${s}T00:00:00Z`).getTime()
  const span = day(project.endDate) - day(project.startDate)
  return span > 0 ? (100 * (day(iso) - day(project.startDate))) / span : 0
}

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const isAdmin = user?.role === 'admin'
  const project = useApi(() => api.get<Project>(`/projects/${projectId}`), [projectId])
  const milestones = useApi(
    () => api.get<MilestoneList>(`/projects/${projectId}/milestones`, { include_archived: isAdmin ? 'true' : undefined }),
    [projectId, isAdmin],
  )
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [whyOpen, setWhyOpen] = useState(false)
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'))

  const reloadAll = () => {
    project.reload()
    milestones.reload()
  }

  if (!project.data && (project.status === 403 || project.status === 404)) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Alert severity="error" sx={{ width: '100%' }}>{project.error}</Alert>
        <Button component={RouterLink} to="/projects" variant="outlined">Back to projects</Button>
      </Stack>
    )
  }

  return (
    <Async state={project}>
      {(p) => {
        const s = p.summary
        const finished = p.status === 'completed' || p.status === 'archived'
        const manages = !!user && (isAdmin || (user.role === 'manager' && p.manager.id === user.id))
        const canManage = manages && !finished
        const showMoney = s.totalCost !== null
        const tabs: { key: TabKey; label: string }[] = [
          { key: 'plan', label: 'Plan' },
          { key: 'tasks', label: 'Tasks' },
          { key: 'team', label: showMoney ? 'Team & costs' : 'Team' },
          ...(manages ? [{ key: 'history' as TabKey, label: 'History' }] : []),
        ]
        const requested = params.get('tab')
        const tab: TabKey = tabs.find((t) => t.key === requested)?.key ?? 'plan'
        const view = tab === 'plan' && manages && params.get('view') === 'timeline' ? 'timeline' : 'list'
        const go = (next: Record<string, string>) => setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'tab' && v === 'plan'))), { replace: true })

        const ticks: PulseTick[] = (milestones.data?.items ?? [])
          .filter((m) => m.archivedAt === null)
          .map((m) => ({ id: m.id, name: `${m.name}, due ${formatDate(m.dueDate)}`, at: position(p, m.dueDate), late: m.isOverdue }))
        const timeLeft = s.daysRemaining >= 0 ? `${s.daysRemaining} days left` : `${-s.daysRemaining} days late`
        const facts = [
          timeLeft,
          `${s.milestonesDone} of ${s.milestonesTotal} milestones`,
          `${hours(s.hoursWorked)} of ${hours(p.allocatedHours)}`,
          ...(showMoney ? [`${money(s.totalCost)} of ${money(p.budgetAmount)}`] : []),
        ]
        const hasMenu = canManage || (isAdmin && p.status !== 'archived') || manages

        return (
          <>
            <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 1 }}>
              <Link component={RouterLink} to="/projects" underline="hover" color="inherit">Projects</Link>
              <Typography color="text.primary" aria-current="page">{p.name}</Typography>
            </Breadcrumbs>
            <PageHeader
              title={p.name}
              subtitle={<>{p.manager.name} · {dateRange(p.startDate, p.endDate)}</>}
              actions={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <StatusChip status={p.status} />
                  {p.blockedByCount > 0 && (
                    <Chip size="small" color="warning" clickable label={`Waiting for ${p.blockedByCount}`} onClick={() => setDialog('dependencies')} />
                  )}
                  <RiskChip level={s.riskLevel} />
                  {hasMenu && (
                    <Tooltip title="Project actions">
                      <IconButton aria-label="Project actions" aria-haspopup="menu" onClick={(e) => setMenu(e.currentTarget)} sx={{ width: 44, height: 44 }}><MoreIcon /></IconButton>
                    </Tooltip>
                  )}
                </Stack>
              }
            />
            <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
              {canManage && p.status === 'active' && <MenuItem onClick={() => { setMenu(null); setDialog('complete') }}>Mark project complete</MenuItem>}
              {manages && <MenuItem onClick={() => { setMenu(null); setDialog('dependencies') }}>Project dependencies</MenuItem>}
              {isAdmin && p.status !== 'archived' && <MenuItem sx={{ color: 'error.main' }} onClick={() => { setMenu(null); setDialog('archive') }}>Archive project</MenuItem>}
            </Menu>
            {p.description && <Typography sx={{ mb: 2 }}>{p.description}</Typography>}

            <Paper sx={{ p: 2, mb: 2.5 }}>
              <PulseBar schedulePct={s.schedulePct} workPct={s.milestonesPct} risk={s.riskLevel} ticks={ticks} />
              <Typography variant="body2" sx={{ mt: 1.25, fontWeight: 600 }}>{facts.join(' · ')}</Typography>
              {s.riskReasons.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="body2" color={s.riskLevel === 'overdue' ? 'error.main' : 'warning.dark'} component="span">
                    {s.riskReasons[0]}
                  </Typography>
                  {s.riskReasons.length > 1 && (
                    <Button size="small" aria-expanded={whyOpen} onClick={() => setWhyOpen(!whyOpen)} sx={{ ml: 1, minHeight: 32 }}>{whyOpen ? 'Hide' : `Why? (+${s.riskReasons.length - 1})`}</Button>
                  )}
                  <Collapse in={whyOpen} unmountOnExit>
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{s.riskReasons.slice(1).map((r) => <li key={r}>{r}</li>)}</Box>
                  </Collapse>
                </Box>
              )}
            </Paper>

            <Tabs
              value={tab} onChange={(_, v: TabKey) => go({ tab: v })} variant="scrollable" aria-label="Project sections"
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}
            >
              {tabs.map((t) => <Tab key={t.key} value={t.key} label={t.label} id={`tab-${t.key}`} aria-controls={`panel-${t.key}`} />)}
            </Tabs>

            <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'plan' && (
                <Stack spacing={2}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    {manages ? (
                      <ToggleButtonGroup size="small" exclusive value={view} aria-label="Plan view" onChange={(_, v: 'list' | 'timeline' | null) => v && go({ tab: 'plan', view: v === 'timeline' ? 'timeline' : '' })}>
                        <ToggleButton value="list">List</ToggleButton>
                        <ToggleButton value="timeline">Timeline</ToggleButton>
                      </ToggleButtonGroup>
                    ) : <span />}
                    {canManage && <Button variant="contained" onClick={() => setDialog('milestone')}>Add milestone</Button>}
                  </Stack>
                  {view === 'timeline' ? (
                    <ProjectTimeline projectId={p.id} />
                  ) : (
                    <Async state={milestones}>
                      {(list) => (
                        <>
                          {list.items.length === 0 && (
                            <EmptyState text="No milestones yet." action={canManage ? { label: 'Add the first milestone', onClick: () => setDialog('milestone') } : undefined} />
                          )}
                          {list.items.map((m: Milestone) => <MilestoneCard key={m.id} project={p} milestone={m} canManage={canManage} onChanged={reloadAll} />)}
                        </>
                      )}
                    </Async>
                  )}
                </Stack>
              )}
              {tab === 'tasks' && <TasksTab projectId={p.id} canManage={canManage} milestones={milestones.data?.items ?? []} onChanged={reloadAll} />}
              {tab === 'team' && (
                <Stack spacing={4}>
                  <TeamTab projectId={p.id} />
                  {showMoney && <CostsTab project={p} canManage={canManage} onChanged={reloadAll} />}
                </Stack>
              )}
              {tab === 'history' && <ProjectHistory projectId={p.id} />}
            </Box>

            <NewMilestoneDialog open={dialog === 'milestone'} project={p} onClose={() => setDialog(null)} onDone={reloadAll} />
            <Dialog open={dialog === 'dependencies'} onClose={() => setDialog(null)} fullWidth maxWidth="sm" fullScreen={narrow}>
              <DialogTitle>Project dependencies</DialogTitle>
              <DialogContent>
                <DependencyPanel path={`/projects/${p.id}/dependencies`} kind="project" selfId={p.id} canManage={canManage && manages} onChanged={reloadAll} />
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={() => setDialog(null)}>Close</Button></DialogActions>
            </Dialog>
            <ConfirmDialog
              open={dialog === 'complete'} title="Mark this project complete?" confirmLabel="Mark complete"
              onClose={() => setDialog(null)} onConfirm={async () => { await api.post(`/projects/${p.id}/complete`); reloadAll() }}
            >
              <Typography>Everyone working on it is free from tomorrow, and the project can no longer be edited.</Typography>
            </ConfirmDialog>
            <ConfirmDialog
              open={dialog === 'archive'} title="Archive this project?" confirmLabel="Archive" cancelLabel="Keep project" danger
              onClose={() => setDialog(null)} onConfirm={async () => { await api.post(`/projects/${p.id}/archive`); reloadAll() }}
            >
              <Typography>It disappears for managers and employees, but nothing is deleted. You can restore it from the Archive page.</Typography>
            </ConfirmDialog>
          </>
        )
      }}
    </Async>
  )
}

function NewMilestoneDialog({ open, project, onClose, onDone }: { open: boolean; project: Project; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState(project.startDate > todayIso() ? project.startDate : todayIso())
  const [due, setDue] = useState(project.endDate)
  const [plannedHours, setPlannedHours] = useState('')
  const [budget, setBudget] = useState('')

  return (
    <FormDialog
      open={open} title="Add a milestone" submitLabel="Add milestone" submitDisabled={!name.trim()}
      onClose={onClose}
      onSubmit={async () => {
        await api.post(`/projects/${project.id}/milestones`, {
          name, description, startDate: start, dueDate: due,
          allocatedHours: Number(plannedHours || 0), budgetAmount: Number(budget || 0),
        })
        setName('')
        setDescription('')
        onDone()
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Dates, hours and budget must fit inside the project ({dateRange(project.startDate, project.endDate)}).
      </Typography>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <TextField label="What is this milestone for?" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <DateField label="Starts" fullWidth value={start} onChange={(e) => setStart(e.target.value)} />
        <DateField label="Due" fullWidth value={due} onChange={(e) => setDue(e.target.value)} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <NumberField label="Planned hours" fullWidth value={plannedHours} onChange={(e) => setPlannedHours(e.target.value)} />
        <NumberField label="Budget ($)" fullWidth value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Stack>
    </FormDialog>
  )
}
