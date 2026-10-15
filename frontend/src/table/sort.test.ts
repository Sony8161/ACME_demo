import { sortRows } from './sort'

const by = (r: { v: string | number | null | undefined }) => r.v
const rows = (...v: (string | number | null | undefined)[]) => v.map((x, i) => ({ v: x, id: i }))
const values = (r: { v: unknown }[]) => r.map((x) => x.v)

describe('sortRows', () => {
  it('sorts text ignoring case, and numbers numerically', () => {
    expect(values(sortRows(rows('banana', 'Apple', 'cherry'), by, 'asc'))).toEqual(['Apple', 'banana', 'cherry'])
    expect(values(sortRows(rows(10, 9, 100), by, 'asc'))).toEqual([9, 10, 100])
    expect(values(sortRows(rows(10, 9, 100), by, 'desc'))).toEqual([100, 10, 9])
  })

  it('natural order: Task 2 comes before Task 10', () => {
    expect(values(sortRows(rows('Task 10', 'Task 2', 'Task 1'), by, 'asc'))).toEqual(['Task 1', 'Task 2', 'Task 10'])
  })

  it('empty values sort last in both directions', () => {
    const input = rows('b', null, 'a', undefined, '')
    expect(values(sortRows(input, by, 'asc'))).toEqual(['a', 'b', null, undefined, ''])
    expect(values(sortRows(input, by, 'desc'))).toEqual(['b', 'a', null, undefined, ''])
  })

  it('zero is a value, not empty', () => {
    expect(values(sortRows(rows(2, 0, null, 1), by, 'asc'))).toEqual([0, 1, 2, null])
  })

  it('keeps equal rows in their original order, in both directions', () => {
    const input = [{ v: 'x', id: 'first' }, { v: 'x', id: 'second' }, { v: 'a', id: 'third' }]
    expect(sortRows(input, by, 'asc').map((r) => r.id)).toEqual(['third', 'first', 'second'])
    expect(sortRows(input, by, 'desc').map((r) => r.id)).toEqual(['first', 'second', 'third'])
  })

  it('does not change the list it is given', () => {
    const input = rows('b', 'a')
    sortRows(input, by, 'asc')
    expect(values(input)).toEqual(['b', 'a'])
  })
})
