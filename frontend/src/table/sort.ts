export type Direction = 'asc' | 'desc'
export type SortValue = string | number | null | undefined

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const isEmpty = (v: SortValue) => v === null || v === undefined || v === ''

/**
 * A sorted copy. Text ignores case and reads numbers inside it as numbers ("Task 2" before "Task 10"); numbers compare as numbers.
 * Empty values go last whichever way you sort, and equal rows keep the order they came in.
 */
export function sortRows<T>(rows: T[], get: (row: T) => SortValue, dir: Direction): T[] {
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((a, b) => {
      const emptyA = isEmpty(a.value)
      const emptyB = isEmpty(b.value)
      if (emptyA || emptyB) return emptyA && emptyB ? a.index - b.index : emptyA ? 1 : -1
      const order = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : collator.compare(String(a.value), String(b.value))
      return (dir === 'desc' ? -order : order) || a.index - b.index
    })
    .map((entry) => entry.row)
}
