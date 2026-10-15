import { useState } from 'react'
import { Button, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { ProjectList, UserList } from '../api/types'
import { useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { Async } from '../components/Async'
import { EmptyState } from '../components/EmptyState'
import { DateField, NumberField } from '../components/fields'
import { FormDialog } from '../components/FormDialog'
import { PageHeader } from '../components/PageHeader'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectsTable } from '../components/ProjectsTable'
import { todayIso } from '../format'
import { useDebouncedValue } from '../useDebouncedValue'
import { TimelineView } from './TimelinePage'

export function ProjectsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const isManager = user?.role !== 'employee'
  const asked = params.get('view')
  const view = isManager && (asked === 'timeline' || asked === 'table') ? asked : 'list'
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim())
  const [status, setStatus] = useState('')
  const [health, setHealth] = useState('')
  const [creating, setCreating] = useState(false)

  const state = useApi(() => api.get<ProjectList>('/projects', { q, status, page_size: 100 }), [q, status])
  const clear = () => { setText(''); setStatus(''); setHealth('') }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={user?.role === 'employee' ? 'The projects you work on' : user?.role === 'manager' ? 'The projects you run' : 'Every project in the company'}
        actions={user?.role === 'admin' ? <Button variant="contained" onClick={() => setCreating(true)}>New project</Button> : undefined}
      />
      {isManager && (
        <ToggleButtonGroup
          size="small" exclusive value={view} aria-label="View" sx={{ mb: 2 }}
          onChange={(_, v: 'list' | 'table' | 'timeline' | null) => v && setParams(v === 'list' ? {} : { view: v }, { replace: true })}
        >
          <ToggleButton value="list">List</ToggleButton>
          <ToggleButton value="table">Table</ToggleButton>
          <ToggleButton value="timeline">Timeline</ToggleButton>
        </ToggleButtonGroup>
      )}
      {view === 'timeline' ? (
        <TimelineView />
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2.5 }}>
            <TextField size="small" label="Search by project or manager" value={text} onChange={(e) => setText(e.target.value)} sx={{ flex: 1 }} />
            <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="planned">Planned</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
            </TextField>
            <TextField select size="small" label="Health" value={health} onChange={(e) => setHealth(e.target.value)} sx={{ minWidth: 140 }}>
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="at_risk">At risk</MenuItem>
              <MenuItem value="on_track">On track</MenuItem>
            </TextField>
          </Stack>
          <Async state={state}>
            {(list) => {
              const shown = list.items.filter((p) => !health || p.summary.riskLevel === health)
              const filtered = Boolean(q || status || health)
              const none = shown.length === 0 && (
                filtered
                  ? <EmptyState text="No projects match." action={{ label: 'Clear filters', onClick: clear }} />
                  : <EmptyState text="There are no projects yet." action={user?.role === 'admin' ? { label: 'New project', onClick: () => setCreating(true) } : undefined} />
              )
              if (view === 'table' && shown.length > 0) return <ProjectsTable projects={shown} filterKey={`${q}|${status}|${health}`} />
              return (
                <Stack spacing={1.5}>
                  {none}
                  {shown.map((p) => <ProjectCard key={p.id} project={p} />)}
                </Stack>
              )
            }}
          </Async>
        </>
      )}
      {user?.role === 'admin' && <NewProjectDialog open={creating} onClose={() => setCreating(false)} onDone={state.reload} />}
    </>
  )
}

function NewProjectDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const managers = useApi(open ? () => api.get<UserList>('/users', { role: 'manager' }) : null, [open])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [managerId, setManagerId] = useState('')
  const [start, setStart] = useState(todayIso())
  const [end, setEnd] = useState(todayIso(90))
  const [projectHours, setProjectHours] = useState('')
  const [budget, setBudget] = useState('')

  return (
    <FormDialog
      open={open} title="Create a project" submitLabel="Create project" submitDisabled={!name.trim() || !managerId}
      onClose={onClose}
      onSubmit={async () => {
        await api.post('/projects', {
          name, description, managerId, startDate: start, endDate: end,
          allocatedHours: Number(projectHours || 0), budgetAmount: Number(budget || 0),
        })
        setName('')
        setDescription('')
        onDone()
      }}
    >
      <Typography variant="body2" color="text.secondary">Each project has exactly one manager, who then plans its milestones and team.</Typography>
      <TextField label="Project name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
      <TextField select label="Manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} required helperText={managers.error ?? ' '}>
        {managers.data?.items.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <DateField label="Starts" fullWidth value={start} onChange={(e) => setStart(e.target.value)} />
        <DateField label="Predicted end" fullWidth value={end} onChange={(e) => setEnd(e.target.value)} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <NumberField label="Total hours" fullWidth value={projectHours} onChange={(e) => setProjectHours(e.target.value)} />
        <NumberField label="Budget ($)" fullWidth value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Stack>
    </FormDialog>
  )
}
