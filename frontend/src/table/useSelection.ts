import { useEffect, useMemo, useState } from 'react'

/** The ticked rows of a table, by id. Rows that leave the list (a filter, a search) are unticked for good, so nothing unseen stays ticked. */
export function useSelection<T extends { id: string }>(rows: T[]) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const present = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const ids = useMemo(() => new Set([...ticked].filter((id) => present.has(id))), [ticked, present])

  useEffect(() => {
    setTicked((current) => (ids.size === current.size ? current : ids))
  }, [ids])

  return {
    ids,
    count: ids.size,
    has: (id: string) => ids.has(id),
    toggle: (id: string) => setTicked(() => { const next = new Set(ids); if (!next.delete(id)) next.add(id); return next }),
    toggleMany: (many: string[], on: boolean) => setTicked(() => { const next = new Set(ids); many.forEach((id) => (on ? next.add(id) : next.delete(id))); return next }),
    selectAll: () => setTicked(new Set(present)),
    clear: () => setTicked(new Set()),
  }
}
