import { useState } from 'react'
import { api } from '../api/client'
import type { AuditList } from '../api/types'
import { useApi } from '../api/useApi'
import { Async } from '../components/Async'
import { HistoryList } from '../components/HistoryList'
import { Pager } from '../components/Pager'

const PAGE_SIZE = 20

/** The History tab of a project: everything that changed on it, for its manager and for admins. */
export function ProjectHistory({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const history = useApi(() => api.get<AuditList>(`/projects/${projectId}/history`, { page, page_size: PAGE_SIZE }), [projectId, page])
  return (
    <Async state={history}>
      {(list) => (
        <>
          <HistoryList entries={list.items} showProject={false} />
          <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
        </>
      )}
    </Async>
  )
}
