import { useMemo, useState } from 'react'
import { Box, Chip, Link, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { Project, RiskLevel } from '../api/types'
import { formatDate, percent } from '../format'
import { SelectAllCell, SelectCell } from '../table/SelectCells'
import { SelectionBar } from '../table/SelectionBar'
import { SortHead } from '../table/SortHead'
import { sortRows } from '../table/sort'
import { usePaged } from '../table/usePaged'
import { useSelection } from '../table/useSelection'
import { useSort } from '../table/useSort'
import { exportFileName, projectColumns } from '../export/columns'
import { ExportButton } from './ExportButton'
import { ExportDialog } from './ExportDialog'
import { Pager } from './Pager'
import { useToast } from './toast'
import { RiskChip } from './RiskChip'

type Key = 'name' | 'manager' | 'health' | 'milestones' | 'budget' | 'ends'
const PAGE_SIZE = 25
const URGENCY: Record<RiskLevel, number> = { overdue: 0, at_risk: 1, on_track: 2, done: 3 }

const VALUE: Record<Key, (p: Project) => string | number | null> = {
  name: (p) => p.name,
  manager: (p) => p.manager.name,
  health: (p) => URGENCY[p.summary.riskLevel],
  milestones: (p) => p.summary.milestonesPct,
  budget: (p) => p.summary.budgetPct,
  ends: (p) => p.endDate,
}

/** The projects as a table: sortable columns, tick boxes and 25 rows a page. Budget is left out when the server sent no money. */
export function ProjectsTable({ projects }: { projects: Project[] }) {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const sort = useSort<Key>('health')
  const showMoney = projects.some((p) => p.summary.totalCost !== null)
  const shown = useMemo(() => sortRows(projects, VALUE[sort.key], sort.dir), [projects, sort.key, sort.dir])
  const selection = useSelection(shown)
  const paged = usePaged(shown, PAGE_SIZE, `${sort.key}|${sort.dir}`)
  const chosen = selection.count > 0 ? shown.filter((p) => selection.has(p.id)) : shown
  const head = (key: Key, label: string) => <SortHead label={label} active={sort.key === key} dir={sort.dir} onSort={() => sort.toggle(key)} />

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
        <ExportButton selected={selection.count} total={shown.length} onClick={() => setExporting(true)} />
      </Box>
      <SelectionBar count={selection.count} total={shown.length} onSelectAll={selection.selectAll} onClear={selection.clear} />
      <TableContainer component={Paper}>
        <Table size="small" aria-label="Projects">
          <TableHead>
            <TableRow>
              <SelectAllCell pageIds={paged.pageRows.map((p) => p.id)} ticked={selection.ids} onChange={(on) => selection.toggleMany(paged.pageRows.map((p) => p.id), on)} />
              {head('name', 'Project')}
              {head('manager', 'Manager')}
              {head('health', 'Health')}
              {head('milestones', 'Milestones')}
              {showMoney && head('budget', 'Budget used')}
              {head('ends', 'Ends')}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.pageRows.map((p) => (
              <TableRow key={p.id} hover selected={selection.has(p.id)}>
                <SelectCell label={`Select ${p.name}`} checked={selection.has(p.id)} onChange={() => selection.toggle(p.id)} />
                <TableCell>
                  <Link component={RouterLink} to={`/projects/${p.id}`} sx={{ fontWeight: 700 }}>{p.name}</Link>
                  {p.blockedByCount > 0 && <Chip size="small" color="warning" label={`Waiting for ${p.blockedByCount}`} sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>{p.manager.name}</TableCell>
                <TableCell><RiskChip level={p.summary.riskLevel} /></TableCell>
                <TableCell><Typography variant="body2">{p.summary.milestonesDone} of {p.summary.milestonesTotal}</Typography></TableCell>
                {showMoney && <TableCell>{percent(p.summary.budgetPct)}</TableCell>}
                <TableCell>{formatDate(p.endDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Pager page={paged.page} pageSize={PAGE_SIZE} total={shown.length} onPage={paged.setPage} />
      <ExportDialog
        open={exporting} noun="projects" nounOne="project" rows={chosen} columns={projectColumns({ money: showMoney })} filename={exportFileName('projects')}
        onClose={() => setExporting(false)} onExported={(n) => toast({ message: `Exported ${n} ${n === 1 ? 'project' : 'projects'}` })}
      />
    </>
  )
}
