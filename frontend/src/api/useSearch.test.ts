import { act, renderHook } from '@testing-library/react'
import { api } from './client'
import type { SearchResults } from './types'
import { useSearch } from './useSearch'

const results = (query: string): SearchResults => ({ query, projects: [], people: [], tasks: [] })
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => {}
  let reject: (e: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('useSearch', () => {
  it('does nothing for fewer than two characters, spaces included', () => {
    const get = vi.spyOn(api, 'get')
    const { result, rerender } = renderHook(({ text }) => useSearch(text), { initialProps: { text: '' } })
    expect(result.current.state).toBe('idle')
    rerender({ text: 'a' })
    rerender({ text: ' a ' })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(get).not.toHaveBeenCalled()
    expect(result.current.state).toBe('idle')
  })

  it('waits for a pause in typing, asks once with the trimmed text, and then has the results', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(results('apo'))
    const { result, rerender } = renderHook(({ text }) => useSearch(text), { initialProps: { text: 'ap' } })
    rerender({ text: 'apo' })
    rerender({ text: '  apo ' })
    expect(result.current.state).toBe('loading')
    await act(async () => { await vi.advanceTimersByTimeAsync(249) })
    expect(get).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/search', { q: 'apo' })
    expect(result.current.state).toBe('ready')
    expect(result.current.results?.query).toBe('apo')
  })

  it('ignores an older, slower answer that arrives after a newer one', async () => {
    const slow = deferred<SearchResults>()
    const fast = deferred<SearchResults>()
    vi.spyOn(api, 'get').mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    const { result, rerender } = renderHook(({ text }) => useSearch(text), { initialProps: { text: 'ap' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) }) // the first request is on its way
    rerender({ text: 'apo' })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) }) // the second too
    await act(async () => { fast.resolve(results('apo')) })
    expect(result.current.results?.query).toBe('apo')
    await act(async () => { slow.resolve(results('ap')) })
    expect(result.current.results?.query).toBe('apo') // the late one did not win
    expect(result.current.state).toBe('ready')
  })

  it('says it failed, and recovers on the next search', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(results('apol'))
    const { result, rerender } = renderHook(({ text }) => useSearch(text), { initialProps: { text: 'ap' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.state).toBe('error')
    expect(result.current.results).toBeNull()
    rerender({ text: 'apol' })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.state).toBe('ready')
  })

  it('goes back to idle when the box is emptied', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(results('ap'))
    const { result, rerender } = renderHook(({ text }) => useSearch(text), { initialProps: { text: 'ap' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(result.current.state).toBe('ready')
    rerender({ text: '' })
    expect(result.current.state).toBe('idle')
    expect(result.current.results).toBeNull()
  })
})
