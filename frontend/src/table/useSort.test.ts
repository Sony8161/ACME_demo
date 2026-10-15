import { act, renderHook } from '@testing-library/react'
import { useSort } from './useSort'

describe('useSort', () => {
  it('starts on the given column and direction', () => {
    const { result } = renderHook(() => useSort('name', 'desc'))
    expect([result.current.key, result.current.dir]).toEqual(['name', 'desc'])
  })

  it('a new column sorts ascending; the same column flips the direction', () => {
    const { result } = renderHook(() => useSort<'name' | 'ends'>('name'))
    act(() => result.current.toggle('ends'))
    expect([result.current.key, result.current.dir]).toEqual(['ends', 'asc'])
    act(() => result.current.toggle('ends'))
    expect(result.current.dir).toBe('desc')
    act(() => result.current.toggle('ends'))
    expect(result.current.dir).toBe('asc')
    act(() => result.current.toggle('name'))
    expect([result.current.key, result.current.dir]).toEqual(['name', 'asc'])
  })
})
