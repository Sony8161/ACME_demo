import { act, renderHook } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts with the value it is given', () => {
    const { result } = renderHook(() => useDebouncedValue('a'))
    expect(result.current).toBe('a')
  })

  it('follows a change only after 300 ms by default', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    act(() => { vi.advanceTimersByTime(299) })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('b')
  })

  it('restarts the wait on every change, so typing settles once, on the last value', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 500), { initialProps: { v: '' } })
    for (const v of ['w', 'we', 'web']) {
      rerender({ v })
      act(() => { vi.advanceTimersByTime(400) })
      expect(result.current).toBe('')
    }
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('web')
  })

  it('does not apply a value that was replaced before its time, or after unmount', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    rerender({ v: 'a' })
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('a')
    rerender({ v: 'c' })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
