import { useMemo, useState } from 'react'
import { Avatar, Box, Button, Chip, Link, Menu, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { api } from '../api/client'
import type { Task, TaskStatus } from '../api/types'
import { exportFileName, taskColumns } from '../export/columns'
import { runBulk } from '../table/bulk'
import { formatDate } from '../format'
import { tint } from '../theme'
import { COLUMNS, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, initials, type Actor } from '../tasks'
import { SelectAllCell, SelectCell } from '../table/SelectCells'
import { SelectionBar } from '../table/SelectionBar'
import { SortHead } from '../table/SortHead'
import { sortRows } from '../table/sort'
import { usePaged } from '../table/usePaged'
import { useSelection } from '../table/useSelection'
import { useSort } from '../table/useSort'
import { BulkResultDialog } from './BulkResultDialog'
import { ExportButton } from './ExportButton'
import { ExportDialog } from './ExportDialog'
import { Pager } from './Pager'
import { TaskMenu } from './TaskCard'
import { useToast } from './toast'

interface Props {
  tasks: Task[]
  who: Actor
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
  /** Open the task (details and comments). When given, the task's name is a button. */
  onOpen?: (task: Task) => void
  /** Who a task can be given to. With `onChanged`, and the right to manage, this turns on Move to and Set owner for ticked tasks. */
  people?: { id: string; name: string }[]
  onChanged?: () => void
}

type Key = 'none' | 'name' | 'status' | 'priority' | 'owner' | 'due'
const PAGE_SIZE = 25
const STATUS_RANK = Object.fromEntries(COLUMNS.map((c, i) => [c.value, i]))
const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p.value, i]))
const VALUE: Record<Key, (t: Task) => string | number | null> = {
  none: () => null, // every row empty: the server's order is kept
  name: (t) => t.name,
  status: (t) => STATUS_RANK[t.status],
  priority: (t) => PRIORITY_RANK[t.priority],
  owner: (t) => t.assigneeName,
  due: (t) => t.dueDate,
}

/** The same tasks as the board, as rows: sortable columns, tick boxes and 25 rows a page. */
const taskPath = (t: Task) => `/projects/${t.projectId}/milestones/${t.milestoneId}/deliverables/${t.id}`

export function TaskTable({ tasks, who, onMove, onEdit, onOpen, people = [], onChanged }: Props) {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [menu, setMenu] = useState<{ kind: 'move' | 'owner'; anchor: HTMLElement } | null>(null)
  const [result, setResult] = useState<{ title: string; verb: string; done: number; failed: { name: string; message: string }[] } | null>(null)
  const sort = useSort<Key>('none')
  const shown = useMemo(() => sortRows(tasks, VALUE[sort.key], sort.dir), [tasks, sort.key, sort.dir])
  const selection = useSelection(shown)
  const paged = usePaged(shown, PAGE_SIZE, `${sort.key}|${sort.dir}`)
  const chosen = selection.count > 0 ? shown.filter((t) => selection.has(t.id)) : shown
  const canBulk = who.canManage && onChanged !== undefined
  const bulk = async (title: string, verb: string, body: Record<string, unknown>) => {
    setMenu(null)
    const outcome = await runBulk(chosen, (t) => api.patch(taskPath(t), body), (t) => t.name)
    selection.toggleMany(outcome.done.map((t) => t.id), false)
    setResult({ title, verb, done: outcome.done.length, failed: outcome.failed })
    onChanged?.()
  }
  const head = (key: Key, label: string) => <SortHead label={label} active={sort.key === key} dir={sort.dir} onSort={() => sort.toggle(key)} />
  return (
    <>
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
      <ExportButton selected={selection.count} total={shown.length} onClick={() => setExporting(true)} />
    </Box>
    <SelectionBar count={selection.count} total={shown.length} onSelectAll={selection.selectAll} onClear={selection.clear}>
      {canBulk && <Button size="small" aria-haspopup="menu" onClick={(e) => setMenu({ kind: 'move', anchor: e.currentTarget })}>Move to</Button>}
      {canBulk && <Button size="small" aria-haspopup="menu" onClick={(e) => setMenu({ kind: 'owner', anchor: e.currentTarget })}>Set owner</Button>}
    </SelectionBar>
    <TableContainer component={Paper}>
      <Table size="small" aria-label="Tasks">
        <TableHead>
          <TableRow>
            <SelectAllCell pageIds={paged.pageRows.map((t) => t.id)} ticked={selection.ids} onChange={(on) => selection.toggleMany(paged.pageRows.map((t) => t.id), on)} />
            {head('name', 'Task')}{head('status', 'Status')}{head('priority', 'Priority')}{head('owner', 'Owner')}{head('due', 'Due')}
            <TableCell align="right"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {paged.pageRows.map((t) => (
            <TableRow key={t.id} hover selected={selection.has(t.id)}>
              <SelectCell label={`Select ${t.name}`} checked={selection.has(t.id)} onChange={() => selection.toggle(t.id)} />
              <TableCell>
                {onOpen ? (
                  <Link component="button" type="button" variant="body2" underline="hover" onClick={() => onOpen(t)} sx={{ fontWeight: 700, textAlign: 'left', color: 'text.primary' }}>{t.name}</Link>
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.name}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {t.milestoneName}{t.commentCount > 0 ? ` · ${t.commentCount} ${t.commentCount === 1 ? 'comment' : 'comments'}` : ''}
                </Typography>
              </TableCell>
              <TableCell><Chip size="small" variant="outlined" label={STATUS_LABEL[t.status]} /></TableCell>
              <TableCell>{PRIORITY_LABEL[t.priority]}</TableCell>
              <TableCell>
                {t.assigneeName ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar variant="rounded" sx={{ width: 24, height: 24, borderRadius: '3px', fontSize: 10, fontWeight: 700, bgcolor: tint.strong, color: 'text.primary' }}>{initials(t.assigneeName)}</Avatar>
                    {t.assigneeName}
                  </Box>
                ) : 'Unassigned'}
              </TableCell>
              <TableCell>
                {t.dueDate ? (t.isOverdue ? <Chip size="small" color="error" label={`Overdue ${formatDate(t.dueDate)}`} /> : formatDate(t.dueDate)) : '—'}
              </TableCell>
              <TableCell align="right"><TaskMenu task={t} who={who} onMove={onMove} onEdit={onEdit} /></TableCell>
            </TableRow>
          ))}
          {tasks.length === 0 && <TableRow><TableCell colSpan={7}><Typography color="text.secondary">No tasks match.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
    <Pager page={paged.page} pageSize={PAGE_SIZE} total={shown.length} onPage={paged.setPage} />
    <Menu anchorEl={menu?.anchor} open={menu?.kind === 'move'} onClose={() => setMenu(null)}>
      {COLUMNS.map((c) => <MenuItem key={c.value} onClick={() => bulk('Move tasks', 'Moved', { status: c.value })}>{c.label}</MenuItem>)}
    </Menu>
    <Menu anchorEl={menu?.anchor} open={menu?.kind === 'owner'} onClose={() => setMenu(null)}>
      {people.map((p) => <MenuItem key={p.id} onClick={() => bulk('Set owner', 'Updated', { assigneeId: p.id })}>{p.name}</MenuItem>)}
      <MenuItem onClick={() => bulk('Set owner', 'Updated', { assigneeId: null })}>Unassigned</MenuItem>
    </Menu>
    <BulkResultDialog
      open={result !== null} title={result?.title ?? ''} verb={result?.verb ?? ''} done={result?.done ?? 0} failed={result?.failed ?? []}
      onClose={() => setResult(null)}
    />
    <ExportDialog
      open={exporting} noun="tasks" nounOne="task" rows={chosen} columns={taskColumns()} filename={exportFileName('tasks')}
      onClose={() => setExporting(false)} onExported={(n) => toast({ message: `Exported ${n} ${n === 1 ? 'task' : 'tasks'}` })}
    />
    </>
  )
}
