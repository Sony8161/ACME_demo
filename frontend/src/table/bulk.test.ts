import { ApiError } from '../api/client'
import { runBulk } from './bulk'

const people = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' }]
const label = (p: { name: string }) => p.name

describe('runBulk', () => {
  it('runs the action on every row, in order, and reports them all done', async () => {
    const seen: string[] = []
    const result = await runBulk(people, async (p) => { seen.push(p.id) }, label)
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(result.done.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(result.failed).toEqual([])
  })

  it('keeps going when one row fails, and reports it with the server sentence', async () => {
    const seen: string[] = []
    const result = await runBulk(people, async (p) => {
      seen.push(p.id)
      if (p.id === 'b') throw new ApiError(409, 'conflict', 'Bo still manages 2 open projects')
    }, label)
    expect(seen).toEqual(['a', 'b', 'c']) // Cy was not skipped
    expect(result.done.map((p) => p.id)).toEqual(['a', 'c'])
    expect(result.failed).toEqual([{ item: people[1], name: 'Bo', message: 'Bo still manages 2 open projects' }])
  })

  it('gives a plain sentence for a failure that has none of its own, and never throws', async () => {
    const result = await runBulk(people.slice(0, 1), async () => { throw new Error('boom') }, label)
    expect(result.failed[0].message).toBe('Something went wrong. Please try again.')
  })

  it('does nothing for an empty list', async () => {
    const act = vi.fn()
    expect(await runBulk([], act, label)).toEqual({ done: [], failed: [] })
    expect(act).not.toHaveBeenCalled()
  })

  it('runs one row at a time, so the server never sees them overlap', async () => {
    let running = 0
    let most = 0
    await runBulk(people, async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((r) => setTimeout(r, 5))
      running -= 1
    }, label)
    expect(most).toBe(1)
  })
})
