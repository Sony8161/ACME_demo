import { useState } from 'react'
import { Alert, Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { api } from '../api/client'
import type { ProjectList, UserList } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/toast'
import { formatDate } from '../format'

interface Row { key: string; kind: 'Project' | 'Person'; name: string; detail: string; archivedAt: string; restorePath: string; reload: () => void }

/** Admin-only. Nothing in the system is ever deleted: removed projects and people wait here as one list and can be restored. */
export function ArchivePage() {
  const [message, setMessage] = useState<string | null>(null)
  const toast = useToast()
  const projects = useApi(() => api.get<ProjectList>('/projects', { include_archived: 'true', page_size: 100 }), [])
  const people = useApi(() => api.get<UserList>('/users', { include_archived: 'true' }), [])

  const restore = async (row: Row) => {
    setMessage(null)
    try {
      await api.post(row.restorePath)
      row.reload()
      toast({ message: `${row.name} restored` })
    } catch (err) {
      setMessage(errorText(err))
    }
  }

  const rows: Row[] = [
    ...(projects.data?.items ?? []).filter((p) => p.archivedAt !== null).map((p): Row => ({
      key: `p-${p.id}`, kind: 'Project', name: p.name, detail: `Manager ${p.manager.name}`, archivedAt: p.archivedAt!, restorePath: `/projects/${p.id}/unarchive`, reload: projects.reload,
    })),
    ...(people.data?.items ?? []).filter((u) => u.archivedAt !== null).map((u): Row => ({
      key: `u-${u.id}`, kind: 'Person', name: u.name, detail: `${u.role} · ${u.email}`, archivedAt: u.archivedAt!, restorePath: `/users/${u.id}/unarchive`, reload: people.reload,
    })),
  ].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))

  return (
    <>
      <PageHeader title="Archive" subtitle="Admins only. Nothing is deleted, and restoring brings it back." />
      {message && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
      <Async state={projects}>
        {() => (
          <Async state={people}>
            {() => (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow><TableCell>Name</TableCell><TableCell>Type</TableCell><TableCell>Archived</TableCell><TableCell align="right"><Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Actions</Box></TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>{r.name}<Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'capitalize' }}>{r.detail}</Typography></TableCell>
                        <TableCell>{r.kind}</TableCell>
                        <TableCell>{formatDate(r.archivedAt.slice(0, 10))}</TableCell>
                        <TableCell align="right"><Button size="small" aria-label={`Restore ${r.name}`} onClick={() => restore(r)}>Restore</Button></TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && <TableRow><TableCell colSpan={4}><Typography color="text.secondary">Nothing is archived.</Typography></TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Async>
        )}
      </Async>
    </>
  )
}
