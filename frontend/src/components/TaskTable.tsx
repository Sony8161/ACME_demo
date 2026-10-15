import { useMemo } from 'react'
import { Avatar, Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { Task, TaskStatus } from '../api/types'
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
import { Pager } from './Pager'
import { TaskMenu } from './TaskCard'

interface Props {
  tasks: Task[]
  who: Actor
  onMove: (task: Task, to: TaskStatus) => void
  onEdit?: (task: Task) => void
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
export function TaskTable({ tasks, who, onMove, onEdit }: Props) {
  const sort = useSort<Key>('none')
  const shown = useMemo(() => sortRows(tasks, VALUE[sort.key], sort.dir), [tasks, sort.key, sort.dir])
  const selection = useSelection(shown)
  const paged = usePaged(shown, PAGE_SIZE, `${sort.key}|${sort.dir}`)
  const head = (key: Key, label: string) => <SortHead label={label} active={sort.key === key} dir={sort.dir} onSort={() => sort.toggle(key)} />
  return (
    <>
    <SelectionBar count={selection.count} total={shown.length} onSelectAll={selection.selectAll} onClear={selection.clear} />
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
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.name}</Typography>
                <Typography variant="caption" color="text.secondary">{t.milestoneName}</Typography>
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
    </>
  )
}
