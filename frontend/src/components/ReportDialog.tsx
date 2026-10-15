import { useState } from 'react'
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Typography } from '@mui/material'
import { api } from '../api/client'
import type { AssigneeList, AuditList, CostList, Milestone, Project, TaskList } from '../api/types'
import { errorText } from '../api/useApi'
import { saveBlob } from '../export/download'
import { buildProjectReport, reportFileName, type ReportData, type ReportSection } from '../export/pdf'
import { useToast } from './toast'

interface Props {
  open: boolean
  project: Project
  /** What the page already holds, so the report does not ask for it twice. */
  milestones: Milestone[]
  /** Whether this person may see money (the server sends none otherwise). */
  money: boolean
  /** Admin, or the manager of this project: the only people who may read its history. */
  manages: boolean
  onClose: () => void
}

const LABEL: Record<ReportSection, string> = { milestones: 'Milestones', tasks: 'Tasks', team: 'Team', costs: 'Costs', history: 'History' }

/** Tick what goes in the project report and save it as a PDF. Only the ticked parts are asked of the server. */
export function ReportDialog(props: Props) {
  return props.open ? <Picker {...props} /> : null
}

function Picker({ project, milestones, money, manages, onClose }: Props) {
  const toast = useToast()
  const offered: ReportSection[] = ['milestones', 'tasks', 'team', ...(money ? (['costs'] as const) : []), ...(manages ? (['history'] as const) : [])]
  const [ticked, setTicked] = useState<ReadonlySet<ReportSection>>(new Set(offered))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const toggle = (key: ReportSection) => setTicked((s) => { const next = new Set(s); if (!next.delete(key)) next.add(key); return next })

  const download = async () => {
    setBusy(true)
    setFailed(false)
    const base = `/projects/${project.id}`
    const asks: Partial<Record<ReportSection, () => Promise<unknown>>> = {
      tasks: () => api.get<TaskList>(`${base}/tasks`),
      team: () => api.get<AssigneeList>(`${base}/team`),
      costs: () => api.get<CostList>(`${base}/costs`),
      history: () => api.get<AuditList>(`${base}/history`, { page_size: 100 }),
    }
    const wanted = offered.filter((k) => ticked.has(k))
    const remote = wanted.filter((k) => asks[k])
    const answers = await Promise.allSettled(remote.map((k) => asks[k]!()))
    const data: ReportData = { project, milestones: wanted.includes('milestones') ? milestones : undefined, money }
    const leftOut: string[] = []
    answers.forEach((answer, i) => {
      const key = remote[i]
      if (answer.status === 'rejected') { leftOut.push(`${LABEL[key]} (${errorText(answer.reason)})`); return }
      if (key === 'tasks') data.tasks = (answer.value as TaskList).items
      if (key === 'team') data.team = answer.value as AssigneeList
      if (key === 'costs') data.costs = answer.value as CostList
      if (key === 'history') data.history = (answer.value as AuditList).items
    })
    const included = wanted.filter((k) => !leftOut.some((l) => l.startsWith(LABEL[k])))
    try {
      saveBlob(reportFileName(project.name), await buildProjectReport(data, included))
    } catch {
      setFailed(true)
      setBusy(false)
      return
    }
    if (leftOut.length > 0) {
      setSaved(`Saved. Left out: ${leftOut.join('; ')}.`)
      setBusy(false)
      return
    }
    toast({ message: 'Report saved' })
    onClose()
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Project report</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>A PDF of {project.name}. Tick what goes in it.</Typography>
        <FormGroup>
          <FormControlLabel label="Summary" control={<Checkbox checked disabled />} />
          {offered.map((k) => (
            <FormControlLabel key={k} label={LABEL[k]} control={<Checkbox checked={ticked.has(k)} onChange={() => toggle(k)} disabled={busy || saved !== null} />} />
          ))}
        </FormGroup>
        {failed && <Alert severity="error" sx={{ mt: 1.5 }}>The report could not be made.</Alert>}
        {saved && <Alert severity="warning" sx={{ mt: 1.5 }}>{saved}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {saved ? (
          <Button variant="contained" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download PDF'}</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
