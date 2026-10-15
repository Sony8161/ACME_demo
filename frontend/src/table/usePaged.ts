import { useState } from 'react'

/** One page of a list. Back to page 1 when `resetKey` (the filters) changes, and never past the last page. */
export function usePaged<T>(rows: T[], pageSize: number, resetKey: string) {
  const [state, setState] = useState({ page: 1, resetKey })
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const wanted = state.resetKey === resetKey ? state.page : 1
  const page = Math.min(Math.max(wanted, 1), pages)
  return {
    page,
    pages,
    setPage: (next: number) => setState({ page: next, resetKey }),
    pageRows: rows.slice((page - 1) * pageSize, page * pageSize),
  }
}
