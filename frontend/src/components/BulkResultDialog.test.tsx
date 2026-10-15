import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkResultDialog } from './BulkResultDialog'

describe('BulkResultDialog', () => {
  it('says how many were done and lists each failure with its reason', async () => {
    const onClose = vi.fn()
    render(<BulkResultDialog open title="Archive people" verb="Archived" done={2} failed={[{ name: 'Ada Admin', message: 'You cannot archive yourself' }]} onClose={onClose} />)
    const dialog = await screen.findByRole('dialog', { name: 'Archive people' })
    expect(dialog).toHaveTextContent('Archived 2.')
    expect(dialog).toHaveTextContent('1 could not be done')
    expect(dialog).toHaveTextContent('Ada Admin')
    expect(dialog).toHaveTextContent('You cannot archive yourself')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('says nothing about failures when there were none', async () => {
    render(<BulkResultDialog open title="Move tasks" verb="Moved" done={3} failed={[]} onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Move tasks' })
    expect(dialog).toHaveTextContent('Moved 3.')
    expect(dialog).not.toHaveTextContent('could not be done')
  })

  it('says so plainly when nothing could be done', async () => {
    render(<BulkResultDialog open title="Move tasks" verb="Moved" done={0} failed={[{ name: 'A', message: 'No' }, { name: 'B', message: 'No' }]} onClose={() => {}} />)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Nothing was changed. 2 could not be done')
  })
})
