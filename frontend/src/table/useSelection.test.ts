import { act, renderHook } from '@testing-library/react'
import { useSelection } from './useSelection'

const rows = (...ids: string[]) => ids.map((id) => ({ id }))

describe('useSelection', () => {
  it('ticks and unticks one row', () => {
    const { result } = renderHook(() => useSelection(rows('a', 'b')))
    act(() => result.current.toggle('a'))
    expect([result.current.count, result.current.has('a'), result.current.has('b')]).toEqual([1, true, false])
    act(() => result.current.toggle('a'))
    expect(result.current.count).toBe(0)
  })

  it('ticks and unticks several at once', () => {
    const { result } = renderHook(() => useSelection(rows('a', 'b', 'c')))
    act(() => result.current.toggleMany(['a', 'b'], true))
    expect(result.current.count).toBe(2)
    act(() => result.current.toggleMany(['a'], false))
    expect([...result.current.ids]).toEqual(['b'])
  })

  it('selects every row it was given, across pages, and clears them', () => {
    const { result } = renderHook(() => useSelection(rows('a', 'b', 'c')))
    act(() => result.current.selectAll())
    expect(result.current.count).toBe(3)
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('drops rows that leave the list, and does not bring them back when they return', () => {
    const { result, rerender } = renderHook(({ r }) => useSelection(r), { initialProps: { r: rows('a', 'b', 'c') } })
    act(() => result.current.selectAll())
    rerender({ r: rows('b') })
    expect([...result.current.ids]).toEqual(['b'])
    rerender({ r: rows('a', 'b', 'c') })
    expect([...result.current.ids]).toEqual(['b'])
  })
})
