import { useMemo, useState } from 'react'
import {
  Button, Chip, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Overview, PasswordReset, Role, User, UserCreated, UserList } from '../api/types'
import { useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { Async } from '../components/Async'
import { AvailabilityTable } from '../components/AvailabilityTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { CredentialsDialog, type Credential } from '../components/CredentialsDialog'
import { NumberField } from '../components/fields'
import { FormDialog } from '../components/FormDialog'
import { PageHeader } from '../components/PageHeader'
import { Pager } from '../components/Pager'
import { money } from '../format'
import { SelectAllCell, SelectCell } from '../table/SelectCells'
import { SelectionBar } from '../table/SelectionBar'
import { SortHead } from '../table/SortHead'
import { sortRows } from '../table/sort'
import { usePaged } from '../table/usePaged'
import { useSelection } from '../table/useSelection'
import { useSort } from '../table/useSort'
import { useDebouncedValue } from '../useDebouncedValue'

export function PeoplePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'availability' ? 'availability' : 'people'
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim())
  const [creating, setCreating] = useState(false)
  const [menu, setMenu] = useState<{ person: User; anchor: HTMLElement } | null>(null)
  const [target, setTarget] = useState<{ person: User; action: 'archive' | 'reset' } | null>(null)
  const [credentials, setCredentials] = useState<Credential[] | null>(null)

  const state = useApi(() => api.get<UserList>('/users', { q }), [q])
  const overview = useApi(view === 'availability' ? () => api.get<Overview>('/reports/overview') : null, [view])
  const managers = useApi(isAdmin ? () => api.get<UserList>('/users', { role: 'manager' }) : null, [isAdmin])

  return (
    <>
      <PageHeader
        title="People"
        subtitle={isAdmin ? 'Everyone with an account. Accounts are archived, never deleted.' : 'The people you can assign to your milestones'}
        actions={isAdmin ? <Button variant="contained" onClick={() => setCreating(true)}>New person</Button> : undefined}
      />
      <ToggleButtonGroup
        size="small" exclusive value={view} aria-label="View" sx={{ mb: 2 }}
        onChange={(_, v: 'people' | 'availability' | null) => v && setParams(v === 'availability' ? { view: 'availability' } : {}, { replace: true })}
      >
        <ToggleButton value="people">People</ToggleButton>
        <ToggleButton value="availability">Availability</ToggleButton>
      </ToggleButtonGroup>
      {view === 'availability' && <Async state={overview}>{(o) => <AvailabilityTable allocation={o.allocation} />}</Async>}
      {view === 'people' && <TextField size="small" label="Search by name, email or job title" value={text} onChange={(e) => setText(e.target.value)} fullWidth sx={{ mb: 2.5 }} />}
      {view === 'people' && <Async state={state}>
        {(list) => (
          <PeopleTable
            people={list.items} isAdmin={isAdmin} meId={user?.id} searching={text !== ''} onClearSearch={() => setText('')}
            nameOf={(id) => list.items.find((u) => u.id === id)?.name ?? managers.data?.items.find((m) => m.id === id)?.name}
            onMenu={(person, anchor) => setMenu({ person, anchor })}
          />
        )}
      </Async>}
      <Menu anchorEl={menu?.anchor} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setTarget({ person: menu!.person, action: 'reset' }); setMenu(null) }}>New password</MenuItem>
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { setTarget({ person: menu!.person, action: 'archive' }); setMenu(null) }}>Archive</MenuItem>
      </Menu>

      {isAdmin && (
        <NewPersonDialog
          open={creating} managers={managers.data?.items ?? []} onClose={() => setCreating(false)}
          onCreated={(c) => { setCredentials([{ name: c.user.name, role: c.user.role, username: c.user.username, password: c.temporaryPassword }]); state.reload() }}
        />
      )}
      <ConfirmDialog
        open={target?.action === 'archive'} title={`Archive ${target?.person.name}?`} confirmLabel="Archive" cancelLabel="Keep" danger
        onClose={() => setTarget(null)} onConfirm={async () => { await api.post(`/users/${target!.person.id}/archive`); state.reload() }}
      >
        <Typography>
          They can no longer sign in, and their future work on milestones ends. Nothing is deleted: you can restore them from the Archive page.
        </Typography>
      </ConfirmDialog>
      <FormDialog
        open={target?.action === 'reset'} title={`New password for ${target?.person.name}`} submitLabel="Create new password"
        onClose={() => setTarget(null)}
        onSubmit={async () => {
          const result = await api.post<PasswordReset>(`/users/${target!.person.id}/reset-password`)
          setCredentials([{ name: target!.person.name, username: target!.person.username, password: result.temporaryPassword }])
        }}
      >
        <Typography>Their current password stops working and every open session is signed out. They must choose a new password at the next sign-in.</Typography>
      </FormDialog>
      <CredentialsDialog open={credentials !== null} title="One-time password" accounts={credentials ?? []} onClose={() => setCredentials(null)} />
    </>
  )
}

type PeopleKey = 'name' | 'role' | 'username' | 'boss' | 'cost'
const PAGE_SIZE = 25
const ROLES: { value: Role; label: string }[] = [{ value: 'admin', label: 'Admin' }, { value: 'manager', label: 'Manager' }, { value: 'employee', label: 'Employee' }]

interface TableProps {
  people: User[]
  isAdmin: boolean
  meId: string | undefined
  searching: boolean
  onClearSearch: () => void
  nameOf: (id: string | null) => string | undefined
  onMenu: (person: User, anchor: HTMLElement) => void
}

/** Everyone the server returned, with filters, sortable columns, tick boxes and 25 rows a page. */
function PeopleTable({ people, isAdmin, meId, searching, onClearSearch, nameOf, onMenu }: TableProps) {
  const [role, setRole] = useState('')
  const [boss, setBoss] = useState('')
  const sort = useSort<PeopleKey>('name')

  const bosses = useMemo(
    () => Array.from(new Set(people.map((p) => p.managerId).filter((id): id is string => id !== null)))
      .map((id) => ({ id, name: nameOf(id) ?? '—' })).sort((a, b) => a.name.localeCompare(b.name)),
    [people, nameOf],
  )
  const shown = useMemo(() => {
    const value = {
      name: (p: User) => p.name, role: (p: User) => p.role, username: (p: User) => p.username,
      boss: (p: User) => (p.managerId ? nameOf(p.managerId) : null), cost: (p: User) => p.salary,
    }[sort.key]
    return sortRows(people.filter((p) => (!role || p.role === role) && (!boss || p.managerId === boss)), value, sort.dir)
  }, [people, role, boss, sort.key, sort.dir, nameOf])
  const selection = useSelection(shown)
  const paged = usePaged(shown, PAGE_SIZE, `${role}|${boss}|${sort.key}|${sort.dir}`)
  const head = (key: PeopleKey, label: string, align?: 'right') => (
    <SortHead label={label} active={sort.key === key} dir={sort.dir} onSort={() => sort.toggle(key)} align={align} />
  )

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All roles</MenuItem>
          {ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Reports to" value={boss} onChange={(e) => setBoss(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Anyone</MenuItem>
          {bosses.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
        </TextField>
      </Stack>
      <SelectionBar count={selection.count} total={shown.length} onSelectAll={selection.selectAll} onClear={selection.clear} />
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SelectAllCell pageIds={paged.pageRows.map((p) => p.id)} ticked={selection.ids} onChange={(on) => selection.toggleMany(paged.pageRows.map((p) => p.id), on)} />
              {head('name', 'Name')}
              {head('role', 'Role')}
              {head('username', 'Username')}
              {head('boss', 'Reports to')}
              {isAdmin && head('cost', 'Hourly cost', 'right')}
              {isAdmin && <TableCell align="right"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.pageRows.map((p) => (
              <TableRow key={p.id} selected={selection.has(p.id)}>
                <SelectCell label={`Select ${p.name}`} checked={selection.has(p.id)} onChange={() => selection.toggle(p.id)} />
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.jobTitle || p.email}</Typography>
                </TableCell>
                <TableCell><Chip size="small" variant="outlined" label={p.role} sx={{ textTransform: 'capitalize' }} /></TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>{p.username}</TableCell>
                <TableCell>{nameOf(p.managerId) ?? '—'}</TableCell>
                {isAdmin && <TableCell align="right">{p.salary === null ? '—' : `${money(p.salary)}/h`}</TableCell>}
                {isAdmin && (
                  <TableCell align="right">
                    {/* Not on your own row: a reset signs you out and shows the new password once. */}
                    {p.id !== meId && (
                      <Tooltip title="More">
                        <IconButton aria-label={`Actions for ${p.name}`} onClick={(e) => onMenu(p, e.currentTarget)} sx={{ width: 44, height: 44 }}>
                          <MoreIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {shown.length === 0 && (
          <EmptyState
            text="Nobody matches."
            action={searching || role || boss ? { label: searching ? 'Clear search' : 'Clear filters', onClick: () => { onClearSearch(); setRole(''); setBoss('') } } : undefined}
          />
        )}
      </TableContainer>
      <Pager page={paged.page} pageSize={PAGE_SIZE} total={shown.length} onPage={paged.setPage} />
    </>
  )
}

function NewPersonDialog({ open, managers, onClose, onCreated }: { open: boolean; managers: User[]; onClose: () => void; onCreated: (c: UserCreated) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [managerId, setManagerId] = useState('')
  const [salary, setSalary] = useState('')

  return (
    <FormDialog
      open={open} title="Add a person" submitLabel="Create account"
      submitDisabled={!name.trim() || !email.trim() || (role === 'employee' && !managerId)}
      onClose={onClose}
      onSubmit={async () => {
        const created = await api.post<UserCreated>('/users', {
          name, email, jobTitle, role, managerId: role === 'employee' ? managerId : null, salary: Number(salary || 0),
        })
        setName('')
        setEmail('')
        setJobTitle('')
        onCreated(created)
      }}
    >
      <Typography variant="body2" color="text.secondary">The username and a one-time password are generated for you.</Typography>
      <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <TextField label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select label="Role" fullWidth value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <MenuItem value="employee">Employee</MenuItem>
          <MenuItem value="manager">Manager</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
        </TextField>
        <NumberField label="Hourly cost ($)" fullWidth value={salary} onChange={(e) => setSalary(e.target.value)} />
      </Stack>
      {role === 'employee' && (
        <TextField select label="Reports to (their one manager)" value={managerId} onChange={(e) => setManagerId(e.target.value)} required>
          {managers.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
        </TextField>
      )}
    </FormDialog>
  )
}
