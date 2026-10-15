import { useEffect, useState } from 'react'
import { api } from './client'
import type { SearchResults } from './types'

const MIN = 2
const PAUSE_MS = 250

type Answer = { query: string; ok: boolean; results: SearchResults | null }

/**
 * The search box's data: ask the server once typing pauses (at least two characters), and keep only the newest answer.
 * While a new answer is coming the last one stays available, so the list does not blink empty on every key.
 */
export function useSearch(text: string): { state: 'idle' | 'loading' | 'ready' | 'error'; results: SearchResults | null } {
  const query = text.trim()
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (query.length < MIN) return
    let current = true // a newer search flips this, so a slow older answer is dropped
    const timer = setTimeout(async () => {
      try {
        const results = await api.get<SearchResults>('/search', { q: query })
        if (current) setAnswer({ query, ok: true, results })
      } catch {
        if (current) setAnswer({ query, ok: false, results: null })
      }
    }, PAUSE_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [query])

  if (query.length < MIN) return { state: 'idle', results: null }
  if (answer?.query !== query) return { state: 'loading', results: answer?.results ?? null }
  return { state: answer.ok ? 'ready' : 'error', results: answer.results }
}
