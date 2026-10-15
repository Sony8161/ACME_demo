import { errorText } from '../api/useApi'

export interface BulkResult<T> {
  done: T[]
  failed: { item: T; name: string; message: string }[]
}

/**
 * Run one action over the ticked rows, one after the other, through the same endpoints a single click uses (so every
 * permission rule and history entry applies). A row that fails does not stop the rest; it is reported with the server's sentence.
 */
export async function runBulk<T>(items: T[], act: (item: T) => Promise<unknown>, label: (item: T) => string): Promise<BulkResult<T>> {
  const result: BulkResult<T> = { done: [], failed: [] }
  for (const item of items) {
    try {
      await act(item)
      result.done.push(item)
    } catch (err) {
      result.failed.push({ item, name: label(item), message: errorText(err) })
    }
  }
  return result
}
