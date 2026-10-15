import { useMemo, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { Autocomplete, Box, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '../api/useSearch'
import { RISK_LABEL } from '../format'
import { STATUS_LABEL } from '../tasks'

interface Option {
  id: string
  group: 'Projects' | 'People' | 'Tasks'
  label: string
  detail: string
  to: string
}

const NAME = 'Search projects, people, tasks'

/** One box in the top bar that finds projects, people and tasks. Each result is a link; the list is an accessible combobox. */
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [shown, setShown] = useState(false) // compact only: the box under the bar
  if (!compact) return <Field />
  return (
    <>
      <IconButton aria-label="Search" onClick={() => setShown(true)} sx={{ width: 44, height: 44 }}><SearchIcon /></IconButton>
      {shown && (
        <Box sx={{ position: 'fixed', top: 56, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar + 1, p: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
          <Box sx={{ flex: 1 }}><Field autoFocus onDone={() => setShown(false)} /></Box>
          <IconButton aria-label="Close search" onClick={() => setShown(false)} sx={{ width: 44, height: 44 }}><CloseIcon /></IconButton>
        </Box>
      )}
    </>
  )
}

function Field({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const { state, results } = useSearch(text)

  const options = useMemo<Option[]>(() => {
    if (!results) return []
    return [
      ...results.projects.map((p): Option => ({ id: p.id, group: 'Projects', label: p.name, detail: `${p.managerName} · ${RISK_LABEL[p.riskLevel]}`, to: `/projects/${p.id}` })),
      ...results.people.map((p): Option => ({ id: p.id, group: 'People', label: p.name, detail: p.jobTitle || p.role, to: `/people?q=${encodeURIComponent(p.name)}` })),
      ...results.tasks.map((t): Option => ({ id: t.id, group: 'Tasks', label: t.name, detail: `${t.projectName} · ${STATUS_LABEL[t.status]}`, to: `/projects/${t.projectId}?tab=tasks` })),
    ]
  }, [results])

  const empty = { idle: 'Type at least 2 characters.', loading: 'Searching…', error: 'Search is not available right now.', ready: `No results for "${text.trim()}".` }[state]

  return (
    <Autocomplete<Option>
      options={options} groupBy={(o) => o.group} getOptionLabel={(o) => o.label} filterOptions={(all) => all}
      isOptionEqualToValue={(a, b) => a.id === b.id && a.group === b.group} value={null} inputValue={text}
      open={open} onClose={() => setOpen(false)} clearOnEscape noOptionsText={empty} forcePopupIcon={false} fullWidth
      sx={{ width: { md: 340 } }}
      onInputChange={(_, value, reason) => {
        if (reason === 'input') { setText(value); setOpen(value.trim().length >= 2) } else { setText(''); setOpen(false) }
      }}
      onChange={(_, option) => { if (option) { navigate(option.to); onDone?.() } }}
      // A listbox may only hold options and groups, so each group is a labelled role="group" list (MUI's default is not valid ARIA).
      renderGroup={(params) => (
        <li key={params.key} role="presentation" style={{ listStyle: 'none' }}>
          <Typography aria-hidden variant="overline" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, fontWeight: 700 }}>{params.group}</Typography>
          <div role="group" aria-label={params.group}>{params.children}</div>
        </li>
      )}
      // The option is itself the link (role="option" on an <a href>), so it opens in a new tab with a middle-click and nothing is nested.
      renderOption={(props, option) => {
        const { key, onClick, ...rest } = props as typeof props & { key: string; onClick?: (e: MouseEvent) => void }
        return (
          <a
            key={key} {...(rest as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)} href={option.to}
            style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onClick?.(e) }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{option.label}</Typography>
            <Typography variant="caption" color="text.secondary">{option.detail}</Typography>
          </a>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params} size="small" placeholder={NAME} autoFocus={autoFocus}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, 'aria-label': NAME },
            input: { ...params.slotProps.input, startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
        />
      )}
    />
  )
}
