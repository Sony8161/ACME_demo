import { useState } from 'react'
import { Box, Chip, IconButton, Link, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import { Link as RouterLink } from 'react-router-dom'
import type { AuditAction, AuditChange, AuditEntry } from '../api/types'
import { formatDate, formatDateTime } from '../format'

// Only the outline carries the colour: coloured text on white fails the contrast rule the accessibility scan enforces.
const ACTION_OUTLINE: Record<AuditAction, string> = {
  create: 'success.main', update: 'divider', archive: 'warning.main', restore: 'info.main',
}
const ACTION_LABEL: Record<AuditAction, string> = { create: 'Created', update: 'Edited', archive: 'Archived', restore: 'Restored' }

/** Fields holding one of a few fixed words ('in_progress'), shown as 'In progress'. */
const ENUM_FIELDS = new Set(['status', 'role', 'category'])

/** A stored value as people say it: dates as dates, yes/no, and an em dash for nothing. */
function showValue(value: unknown, field = ''): string {
  if (typeof value === 'string' && ENUM_FIELDS.has(field)) return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
  return String(value)
}

function Changes({ changes }: { changes: AuditChange[] }) {
  if (changes.length === 0) return <Typography variant="body2" color="text.secondary">No field changed.</Typography>
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {changes.map((c) => (
        <li key={c.field}>
          <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>{c.label}: </Typography>
          <Typography variant="body2" component="span">
            {c.before === undefined || c.before === null ? showValue(c.after, c.field) : `${showValue(c.before, c.field)} → ${showValue(c.after, c.field)}`}
          </Typography>
        </li>
      ))}
    </Box>
  )
}

function Row({ entry, showProject }: { entry: AuditEntry; showProject: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TableRow hover>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.occurredAt)}</TableCell>
        <TableCell>{entry.actorName}</TableCell>
        <TableCell>
          <Chip size="small" label={ACTION_LABEL[entry.action]} variant="outlined" sx={{ mr: 1, borderColor: ACTION_OUTLINE[entry.action] }} />
          {entry.summary}
          {showProject && entry.projectId && entry.projectName && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              in <Link component={RouterLink} to={`/projects/${entry.projectId}`}>{entry.projectName}</Link>
            </Typography>
          )}
        </TableCell>
        <TableCell align="right" sx={{ width: 48 }}>
          <Tooltip title={open ? 'Hide details' : 'Show details'}>
            <IconButton
              size="small" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details: ${entry.summary}`}
              onClick={() => setOpen(!open)}
            >
              <ExpandIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={4} sx={{ bgcolor: 'action.hover' }}><Changes changes={entry.changes} /></TableCell>
        </TableRow>
      )}
    </>
  )
}

/** Past changes, newest first: when, who, what, and (on request) exactly which fields went from what to what. */
export function HistoryList({ entries, showProject = true }: { entries: AuditEntry[]; showProject?: boolean }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small" aria-label="History">
        <TableHead>
          <TableRow><TableCell>When</TableCell><TableCell>Who</TableCell><TableCell>What</TableCell><TableCell /></TableRow>
        </TableHead>
        <TableBody>
          {entries.map((e) => <Row key={e.id} entry={e} showProject={showProject} />)}
          {entries.length === 0 && (
            <TableRow><TableCell colSpan={4}><Typography color="text.secondary">Nothing has been recorded for this selection.</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
