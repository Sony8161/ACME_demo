import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from './ToastProvider'
import { useToast, type Toast } from './toast'

/** A button that shows the toast it is given. */
function Trigger({ label = 'Show', toast }: { label?: string; toast: Toast }) {
  const show = useToast()
  return <button onClick={() => show(toast)}>{label}</button>
}

describe('ToastProvider', () => {
  it('shows nothing until something asks for a toast', () => {
    render(<ToastProvider><p>Page</p></ToastProvider>)
    expect(screen.getByText('Page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('shows the message, and no Undo button when there is nothing to undo', async () => {
    render(<ToastProvider><Trigger toast={{ message: 'Milestone started' }} /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(await screen.findByText('Milestone started')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('Undo runs the callback once and dismisses the toast', async () => {
    const undo = vi.fn().mockResolvedValue(undefined)
    render(<ToastProvider><Trigger toast={{ message: 'Task moved to In progress', undo }} /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(await screen.findByText('Task moved to In progress')).toBeInTheDocument()
    expect(undo).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Task moved to In progress')).not.toBeInTheDocument())
  })

  it('a second toast replaces the first, and Undo undoes the second one', async () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <ToastProvider>
        <Trigger label="One" toast={{ message: 'First thing', undo: first }} />
        <Trigger label="Two" toast={{ message: 'Second thing', undo: second }} />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'One' }))
    expect(await screen.findByText('First thing')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Two' }))
    expect(await screen.findByText('Second thing')).toBeInTheDocument()
    expect(screen.queryByText('First thing')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1))
    expect(first).not.toHaveBeenCalled()
  })

  it('goes away by itself after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<ToastProvider><Trigger toast={{ message: 'Dependency removed' }} /></ToastProvider>)
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Show' }))
      expect(await screen.findByText('Dependency removed')).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
      await waitFor(() => expect(screen.queryByText('Dependency removed')).not.toBeInTheDocument())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useToast outside a provider', () => {
  it('does nothing and does not throw', async () => {
    const undo = vi.fn()
    render(<Trigger toast={{ message: 'Nobody hears this', undo }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.queryByText('Nobody hears this')).not.toBeInTheDocument()
    expect(undo).not.toHaveBeenCalled()
  })
})
