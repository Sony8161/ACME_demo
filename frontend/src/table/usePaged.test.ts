import { act, renderHook } from '@testing-library/react'
import { usePaged } from './usePaged'

const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('usePaged', () => {
  it('shows the first page and counts the pages', () => {
    const { result } = renderHook(() => usePaged(list(60), 25, ''))
    expect(result.current.pages).toBe(3)
    expect(result.current.pageRows).toHaveLength(25)
    expect(result.current.pageRows[0]).toBe(1)
  })

  it('moves to another page, and the last page holds the rest', () => {
    const { result } = renderHook(() => usePaged(list(60), 25, ''))
    act(() => result.current.setPage(3))
    expect(result.current.pageRows).toEqual(list(60).slice(50))
  })

  it('goes back to page 1 when the filters change', () => {
    const { result, rerender } = renderHook(({ key }) => usePaged(list(60), 25, key), { initialProps: { key: 'a' } })
    act(() => result.current.setPage(3))
    rerender({ key: 'b' })
    expect(result.current.page).toBe(1)
  })

  it('falls back to the last page when the list shrinks below the current page', () => {
    const { result, rerender } = renderHook(({ n }) => usePaged(list(n), 25, ''), { initialProps: { n: 60 } })
    act(() => result.current.setPage(3))
    rerender({ n: 30 })
    expect(result.current.page).toBe(2)
    expect(result.current.pageRows).toHaveLength(5)
  })

  it('has one empty page for an empty list', () => {
    const { result } = renderHook(() => usePaged([], 25, ''))
    expect([result.current.page, result.current.pages, result.current.pageRows]).toEqual([1, 1, []])
  })
})
