import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiError, mockRoutes, restoreApi } from '../test/mockApi'
import { SampleDataFlow } from './SampleDataFlow'
import { ToastProvider } from './ToastProvider'

const created = {
  created: true, message: 'Added the larger sample company',
  accounts: [{ name: 'Hannah Weiss', role: 'manager', username: 'ha12ab', temporary_password: 'Temp-Pass-1' }],
}

function renderFlow(props: Partial<{ onClose: () => void; onDone: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onDone = props.onDone ?? vi.fn()
  render(<ToastProvider><SampleDataFlow open onClose={onClose} onDone={onDone} /></ToastProvider>)
  return { onClose, onDone }
}

afterEach(restoreApi)

describe('SampleDataFlow', () => {
  it('asks first, in plain words, and sends nothing until the admin agrees', async () => {
    const calls = mockRoutes({})
    renderFlow()
    const dialog = await screen.findByRole('dialog', { name: 'Add sample people and projects?' })
    expect(dialog).toHaveTextContent(/made-up company/i)
    expect(dialog).toHaveTextContent(/nothing you already have is changed/i)
    expect(calls).toEqual([])
  })

  it('shows the one-time passwords of the people that were created, then reports it is done', async () => {
    const calls = mockRoutes({ 'POST /admin/seed-demo': created })
    const { onClose, onDone } = renderFlow()
    await userEvent.click(await screen.findByRole('button', { name: 'Add sample data' }))
    const logins = await screen.findByRole('dialog', { name: 'Sample accounts created' })
    expect(logins).toHaveTextContent('username ha12ab')
    expect(logins).toHaveTextContent('password Temp-Pass-1')
    expect(calls).toEqual(['POST /admin/seed-demo'])
    expect(onClose).toHaveBeenCalled() // the question is gone; the logins are what is left
    expect(onDone).not.toHaveBeenCalled() // the page behind reloads once the passwords are safe
    await userEvent.click(within(logins).getByRole('button', { name: 'I have saved them' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sample accounts created' })).not.toBeInTheDocument())
  })

  it('says so when everything was already loaded, and shows no logins', async () => {
    mockRoutes({ 'POST /admin/seed-demo': { created: false, message: 'Demo data already exists', accounts: [] } })
    const { onDone } = renderFlow()
    await userEvent.click(await screen.findByRole('button', { name: 'Add sample data' }))
    expect(await screen.findByText('Sample data is already loaded')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Sample accounts created' })).not.toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows the server sentence inside the question when it fails, and keeps it open', async () => {
    mockRoutes({ 'POST /admin/seed-demo': apiError(403, 'forbidden', 'Only admins can do this') })
    const { onClose } = renderFlow()
    await userEvent.click(await screen.findByRole('button', { name: 'Add sample data' }))
    expect(await screen.findByText('Only admins can do this')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does nothing when the admin cancels', async () => {
    const calls = mockRoutes({})
    const { onClose } = renderFlow()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})
