import { useState } from 'react'
import type { Direction } from './sort'

/** Which column a table is sorted by. A new column starts ascending; the same column flips. */
export function useSort<K extends string>(initialKey: K, initialDir: Direction = 'asc') {
  const [state, setState] = useState<{ key: K; dir: Direction }>({ key: initialKey, dir: initialDir })
  const toggle = (key: K) => setState((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  return { key: state.key, dir: state.dir, toggle }
}
