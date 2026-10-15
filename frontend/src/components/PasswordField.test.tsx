import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordField } from './PasswordField'

function Harness({ onSubmit = () => undefined }: { onSubmit?: () => void }) {
  const [value, setValue] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <PasswordField label="Password" value={value} onChange={(e) => setValue(e.target.value)} />
    </form>
  )
}

describe('PasswordField', () => {
  it('starts hidden and offers to show the password', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the typed text, then hides it again', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Password'), 'Secret-12')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Password')).toHaveValue('Secret-12')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Password')).toHaveValue('Secret-12')
  })

  it('does not submit the form when the button is pressed', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('type', 'button')
  })

  it('names the button after its own field', () => {
    render(<PasswordField label="Repeat new password" />)
    expect(screen.getByRole('button', { name: 'Show repeat new password' })).toBeInTheDocument()
  })
})
