import { useState } from 'react'
import { Alert, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api/client'
import type { DemoSeedResult, Overview } from '../api/types'
import { errorText, useApi } from '../api/useApi'
import { useAuth } from '../auth/context'
import { Async } from '../components/Async'
import { EmptyState } from '../components/EmptyState'
import { ChangesCard } from '../components/ChangesCard'
import { CredentialsDialog } from '../components/CredentialsDialog'
import { PageHeader } from '../components/PageHeader'
import { ProjectCard } from '../components/ProjectCard'
import { formatDate, money } from '../format'

export function DashboardPage() {
  const { user } = useAuth()
  const state = useApi(() => api.get<Overview>('/reports/overview'), [])
  const [seeded, setSeeded] = useState<DemoSeedResult | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const loadDemo = async () => {
    setSeeding(true)
    setSeedError(null)
    try {
      const result = await api.post<DemoSeedResult>('/admin/seed-demo')
      setSeeded(result)
      if (!result.created) setSeedError(result.message)
      state.reload()
    } catch (err) {
      setSeedError(errorText(err))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <>
      <Async state={state}>
        {(o) => {
          const needing = o.counts.atRisk + o.counts.overdue
          const free = o.allocation.filter((a) => a.state === 'available')
          const verdict = o.counts.projects === 0 ? '' : needing > 0 ? `${needing} of ${o.counts.projects} project${o.counts.projects === 1 ? '' : 's'} need${needing === 1 ? 's' : ''} attention` : 'Everything is on track'
          return (
            <>
              <PageHeader
                title="Dashboard"
                subtitle={`${formatDate(o.asOf)}${o.totals.budget > 0 ? ` · ${money(o.totals.spent)} spent of ${money(o.totals.budget)}` : ''}`}
              />

              <ChangesCard />

              {o.counts.projects === 0 && (
                <EmptyState
                  text={user?.role === 'admin' ? 'There are no projects yet.' : 'No projects are assigned to you yet.'}
                  action={user?.role === 'admin' ? { label: seeding ? 'Loading…' : 'Load sample data', onClick: loadDemo } : undefined}
                />
              )}
              {seedError && <Alert severity="error" sx={{ mb: 2 }}>{seedError}</Alert>}

              {verdict && (
                <Typography variant="h6" component="h2" sx={{ mb: 1.5, color: needing > 0 ? 'warning.dark' : 'success.dark' }}>{verdict}</Typography>
              )}
              <Stack spacing={1.5} sx={{ mb: 3 }}>
                {o.projects.map((p) => <ProjectCard key={p.id} project={p} />)}
              </Stack>

              {o.allocation.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {free.length === 0
                    ? 'Nobody is free today. '
                    : `Free today: ${free.slice(0, 3).map((f) => f.name).join(', ')}${free.length > 3 ? ` and ${free.length - 3} more` : ''}. `}
                  <Link component={RouterLink} to="/people?view=availability">See availability</Link>
                </Typography>
              )}
            </>
          )
        }}
      </Async>

      <CredentialsDialog
        open={seeded?.created === true}
        title="Sample accounts created"
        accounts={(seeded?.accounts ?? []).map((a) => ({ name: a.name, role: a.role, username: a.username, password: a.temporaryPassword }))}
        onClose={() => setSeeded(null)}
      />
    </>
  )
}
