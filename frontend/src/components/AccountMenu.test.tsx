import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '../api/types'
import { ThemeModeProvider } from '../ThemeMode'
import { AccountMenu } from './AccountMenu'

const user: User = { id: 'u1', username: 'ab12cd', name: 'Alex Kim', email: 'a@x.test', jobTitle: '', role: 'employee', managerId: null, mustChangePassword: false, archivedAt: null, salary: null }

afterEach(() => localStorage.clear())

describe('AccountMenu appearance', () => {
  it('offers System, Light and Dark as a choice of one, with the current one marked', async () => {
    render(<ThemeModeProvider><AccountMenu user={user} onSignOut={() => {}} /></ThemeModeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    const radios = screen.getAllByRole('menuitemradio')
    expect(radios.map((r) => r.textContent)).toEqual(['System', 'Light', 'Dark'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('choosing Dark switches the mode, remembers it and closes the menu', async () => {
    render(<ThemeModeProvider><AccountMenu user={user} onSignOut={() => {}} /></ThemeModeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(localStorage.getItem('pm.theme')).toBe('dark')
    await vi.waitFor(() => expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  })

  it('still has Sign out, and it signs out', async () => {
    const onSignOut = vi.fn()
    render(<ThemeModeProvider><AccountMenu user={user} onSignOut={onSignOut} /></ThemeModeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalled()
  })
})
