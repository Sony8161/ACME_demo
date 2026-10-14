import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { ConfirmDialog } from './ConfirmDialog'

function setup(onConfirm: () => Promise<unknown>, extra: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <ConfirmDialog open title="Archive Bo?" confirmLabel="Archive" onConfirm={onConfirm} onClose={onClose} {...extra}>
      <p>They can no longer sign in.</p>
    </ConfirmDialog>,
  )
  return { onClose }
}

describe('ConfirmDialog', () => {
  it('asks the question with its sentence and two buttons', async () => {
    setup(() => Promise.resolve())
    const dialog = await screen.findByRole('dialog', { name: 'Archive Bo?' })
    expect(dialog).toHaveTextContent('They can no longer sign in.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled()
  })

  it('runs onConfirm only when confirmed, then closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const { onClose } = setup(onConfirm)
    await screen.findByRole('dialog')
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('uses the cancel label it is given, and cancelling does not confirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const { onClose } = setup(onConfirm, { cancelLabel: 'Keep milestone', confirmLabel: 'Cancel milestone' })
    await userEvent.click(await screen.findByRole('button', { name: 'Keep milestone' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the confirm button in the error colour when the action is dangerous', async () => {
    setup(() => Promise.resolve(), { danger: true })
    const confirm = await screen.findByRole('button', { name: 'Archive' })
    expect(confirm.className).toMatch(/colorError/)
  })

  it('keeps the dialog open and shows the server sentence when confirming fails', async () => {
    const { onClose } = setup(() => Promise.reject(new ApiError(409, 'conflict', 'Maya still manages 1 person')))
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Maya still manages 1 person')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Archive Bo?' })).toBeInTheDocument()
  })
})
