import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTheme } from '@mui/material'
import { ThemeModeProvider } from './ThemeMode'
import { useThemeMode } from './themeMode'

function Probe() {
  const { choice, setChoice, mode } = useThemeMode()
  const palette = useTheme().palette.mode
  return (
    <>
      <output aria-label="state">{`${choice}/${mode}/${palette}`}</output>
      {(['system', 'light', 'dark'] as const).map((c) => <button key={c} onClick={() => setChoice(c)}>{c}</button>)}
    </>
  )
}
const show = () => render(<ThemeModeProvider><Probe /></ThemeModeProvider>)
const state = () => screen.getByLabelText('state').textContent

function systemPrefers(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes('dark'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); Reflect.deleteProperty(window, 'matchMedia') })

describe('ThemeModeProvider', () => {
  it('follows the computer when nothing was chosen: light by default, dark when the computer is dark', () => {
    systemPrefers(false)
    const { unmount } = show()
    expect(state()).toBe('system/light/light')
    unmount()
    systemPrefers(true)
    show()
    expect(state()).toBe('system/dark/dark')
  })

  it('switches to the chosen mode, applies it to the theme and remembers it', async () => {
    systemPrefers(false)
    show()
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(state()).toBe('dark/dark/dark')
    expect(localStorage.getItem('pm.theme')).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(state()).toBe('light/light/light')
  })

  it('a chosen mode beats the computer, and System goes back to following it', async () => {
    systemPrefers(true)
    localStorage.setItem('pm.theme', 'light')
    show()
    expect(state()).toBe('light/light/light')
    await userEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(state()).toBe('system/dark/dark')
  })

  it('starts from the remembered choice', () => {
    systemPrefers(false)
    localStorage.setItem('pm.theme', 'dark')
    show()
    expect(state()).toBe('dark/dark/dark')
  })

  it('ignores a remembered value it does not know', () => {
    systemPrefers(false)
    localStorage.setItem('pm.theme', 'neon')
    show()
    expect(state()).toBe('system/light/light')
  })

  it('still works, for this visit, when storage is blocked', async () => {
    systemPrefers(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    show()
    expect(state()).toBe('system/light/light')
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(state()).toBe('dark/dark/dark')
  })

  it('outside a provider the hook answers System/light and does nothing when asked to change', async () => {
    render(<Probe />)
    expect(state()).toMatch(/^system\/light\//)
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(state()).toMatch(/^system\/light\//)
  })
})
