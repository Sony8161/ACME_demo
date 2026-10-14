import { useState } from 'react'
import { Box, Button, MenuItem, Stack, TextField } from '@mui/material'
import { api } from '../api/client'
import type { AuditAction, AuditEntity, AuditList, ProjectList, UserList } from '../api/types'
import { useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { DateField } from '../components/fields'
import { HistoryList } from '../components/HistoryList'
import { PageHeader } from '../components/PageHeader'
import { Pager } from '../components/Pager'

const PAGE_SIZE = 25
const ENTITIES: { value: AuditEntity; label: string }[] = [
  { value: 'project', label: 'Projects' }, { value: 'milestone', label: 'Milestones' }, { value: 'deliverable', label: 'Deliverables' },
  { value: 'assignment', label: 'Team members' }, { value: 'cost', label: 'Costs' }, { value: 'person', label: 'People' },
]
const ACTIONS: { value: AuditAction; label: string }[] = [
  { value: 'create', label: 'Created' }, { value: 'update', label: 'Edited' }, { value: 'archive', label: 'Archived' }, { value: 'restore', label: 'Restored' },
]

interface Filters { projectId: string; actorId: string; entity: string; action: string; from: string; to: string }
const NONE: Filters = { projectId: '', actorId: '', entity: '', action: '', from: '', to: '' }

/** Admin-only. Who changed what, and when, across the whole company. Nothing here can be edited or removed. */
export function HistoryPage() {
  const [filters, setFilters] = useState<Filters>(NONE)
  const [page, setPage] = useState(1)
  const projects = useApi(() => api.get<ProjectList>('/projects', { include_archived: 'true', page_size: 100 }), [])
  const people = useApi(() => api.get<UserList>('/users', { include_archived: 'true' }), [])
  const history = useApi(
    () => api.get<AuditList>('/audit', {
      project_id: filters.projectId || undefined, actor_id: filters.actorId || undefined, entity: filters.entity || undefined,
      action: filters.action || undefined, from: filters.from || undefined, to: filters.to || undefined, page, page_size: PAGE_SIZE,
    }),
    [filters, page],
  )

  const set = (key: keyof Filters) => (value: string) => { setFilters({ ...filters, [key]: value }); setPage(1) }
  const filtered = JSON.stringify(filters) !== JSON.stringify(NONE)

  return (
    <>
      <PageHeader title="History" subtitle="Everything that was created, edited, archived or restored, newest first. It cannot be edited or removed." />
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2, mb: 3, alignItems: 'center' }}>
        <TextField select size="small" label="Project" value={filters.projectId} onChange={(e) => set('projectId')(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All projects</MenuItem>
          {(projects.data?.items ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Person" value={filters.actorId} onChange={(e) => set('actorId')(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Anyone</MenuItem>
          {(people.data?.items ?? []).map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Kind" value={filters.entity} onChange={(e) => set('entity')(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Everything</MenuItem>
          {ENTITIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Action" value={filters.action} onChange={(e) => set('action')(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">Any</MenuItem>
          {ACTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <DateField size="small" required={false} label="From" value={filters.from} onChange={(e) => set('from')(e.target.value)} />
        <DateField size="small" required={false} label="To" value={filters.to} onChange={(e) => set('to')(e.target.value)} />
        {filtered && <Box><Button onClick={() => { setFilters(NONE); setPage(1) }}>Clear filters</Button></Box>}
      </Stack>
      <Async state={history}>
        {(list) => (
          <>
            <HistoryList entries={list.items} />
            <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
          </>
        )}
      </Async>
    </>
  )
}
