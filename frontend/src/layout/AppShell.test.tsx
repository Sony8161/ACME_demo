import { useEffect } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { mockRoutes, restoreApi } from '../test/mockApi'
import { AppShell } from './AppShell'

let wide = true
vi.mock('react-responsive', () => ({ useMediaQuery: () => wide }))

const sessionFor = (role: string) => ({
  token: 't', expiresAt: Math.floor(Date.now() / 1000) + 3600,
  user: { id: '1', username: 'ab12cd', name: 'Alex Kim', email: 'a@x.test', jobTitle: '', role, managerId: null, mustChangePassword: false, archivedAt: null, salary: null },
})

let mounts = 0
function Dashboard() {
  useEffect(() => { mounts += 1 }, [])
  return <p>dashboard content</p>
}

function renderShell(role: string | null, path = '/dashboard') {
  if (role) localStorage.setItem('pm.auth', JSON.stringify(sessionFor(role)))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/projects/:id" element={<p>project content</p>} />
            <Route path="/projects" element={<p>projects content</p>} />
            <Route path="/people" element={<p>people content</p>} />
            <Route path="/archive" element={<p>archive content</p>} />
            <Route path="/history" element={<p>history content</p>} />
            <Route path="/my-work" element={<p>my work content</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => { wide = true })
afterEach(() => { localStorage.clear(); restoreApi() })

const bottomBar = () => document.querySelector('.MuiBottomNavigation-root') as HTMLElement | null
const barEntries = (bar: HTMLElement) => Array.from(bar.querySelectorAll('a, button')).map((e) => e.textContent)

describe('AppShell on a wide screen', () => {
  it('shows a top bar with the manager items and marks the open one', () => {
    renderShell('manager', '/people')
    const menu = screen.getByRole('navigation', { name: 'Main' })
    const links = within(menu).getAllByRole('link').map((l) => l.textContent)
    expect(links).toEqual(['Dashboard', 'Projects', 'People'])
    expect(within(menu).getByRole('link', { name: 'People' })).toHaveClass('Mui-selected')
    expect(within(menu).getByRole('link', { name: 'Dashboard' })).not.toHaveClass('Mui-selected')
    expect(screen.getByText('people content')).toBeInTheDocument()
  })

  it('keeps Projects highlighted on a project detail page', () => {
    renderShell('manager', '/projects/abc')
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveClass('Mui-selected')
  })

  it('shows the page content', () => {
    renderShell('manager')
    expect(screen.getByText('dashboard content')).toBeInTheDocument()
  })

  it('moves between pages through the menu', async () => {
    renderShell('manager')
    await userEvent.click(screen.getByRole('link', { name: 'Projects' }))
    expect(await screen.findByText('projects content')).toBeInTheDocument()
  })

  it('shows an employee one place, My work, and nothing else', () => {
    renderShell('employee', '/my-work')
    const menu = screen.getByRole('navigation', { name: 'Main' })
    expect(within(menu).getAllByRole('link').map((l) => l.textContent)).toEqual(['My work'])
    expect(within(menu).queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('draws nothing when nobody is signed in', () => {
    const { container } = renderShell(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('has no bottom bar', () => {
    renderShell('manager')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(bottomBar()).toBeNull()
  })

  describe('More menu', () => {
    it('holds History and Archive for an admin, and they stay out of the bar itself', async () => {
      renderShell('admin')
      const menu = screen.getByRole('navigation', { name: 'Main' })
      expect(within(menu).getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'Projects', 'People'])
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
      await userEvent.click(within(menu).getByRole('button', { name: 'More' }))
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['History', 'Archive', 'Sample data'])
    })

    it('opens the page picked from the menu and closes the menu', async () => {
      renderShell('admin')
      await userEvent.click(screen.getByRole('button', { name: 'More' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
      expect(await screen.findByText('archive content')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
    })

    it('marks More as the open place while on a page that lives in it, and not otherwise', async () => {
      const { unmount } = renderShell('admin', '/history')
      expect(screen.getByRole('button', { name: 'More' })).toHaveClass('Mui-selected')
      expect(within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link').some((l) => l.classList.contains('Mui-selected'))).toBe(false)
      await userEvent.click(screen.getByRole('button', { name: 'More' }))
      expect(screen.getByRole('menuitem', { name: 'History' })).toHaveClass('Mui-selected')
      expect(screen.getByRole('menuitem', { name: 'Archive' })).not.toHaveClass('Mui-selected')
      unmount()
      renderShell('admin', '/people')
      expect(screen.getByRole('button', { name: 'More' })).not.toHaveClass('Mui-selected')
    })

    it('opens the sample-data question from the menu, and a created company reloads the page behind it', async () => {
      mounts = 0
      mockRoutes({ 'POST /admin/seed-demo': { created: true, message: 'ok', accounts: [{ name: 'Hannah Weiss', role: 'manager', username: 'ha12ab', temporary_password: 'Temp-Pass-1' }] } })
      renderShell('admin')
      expect(mounts).toBe(1)
      await userEvent.click(screen.getByRole('button', { name: 'More' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Sample data' }))
      expect(await screen.findByRole('dialog', { name: 'Add sample people and projects?' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Add sample data' }))
      await userEvent.click(await screen.findByRole('button', { name: 'I have saved them' }))
      await waitFor(() => expect(mounts).toBe(2))
    })

    it.each(['manager', 'employee'])('is absent for a %s', (role) => {
      renderShell(role, role === 'employee' ? '/my-work' : '/dashboard')
      expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
      expect(screen.queryByText('History')).not.toBeInTheDocument()
      expect(screen.queryByText('Archive')).not.toBeInTheDocument()
    })
  })

  describe('account menu', () => {
    it('shows the initials on one button, and the name and role only once opened', async () => {
      renderShell('manager')
      const button = screen.getByRole('button', { name: 'Account menu' })
      expect(button.querySelector('[data-initials]')).toHaveAttribute('data-initials', 'AK')
      expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
      await userEvent.click(button)
      expect(screen.getByText('Alex Kim')).toBeInTheDocument()
      expect(screen.getByText('manager')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    })

    it('signs out and clears the saved session', async () => {
      renderShell('manager')
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
      expect(localStorage.getItem('pm.auth')).toBeNull()
      // With nobody signed in the frame draws nothing.
      expect(screen.queryByText('dashboard content')).not.toBeInTheDocument()
    })

    it('closes with Escape without signing out', async () => {
      renderShell('manager')
      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument())
      expect(localStorage.getItem('pm.auth')).not.toBeNull()
      expect(screen.getByText('dashboard content')).toBeInTheDocument()
    })
  })
})

describe('AppShell on a narrow screen', () => {
  beforeEach(() => { wide = false })

  it('uses a bottom bar instead of the top menu', () => {
    renderShell('manager', '/people')
    const bar = bottomBar() as HTMLElement
    expect(bar).toHaveAttribute('aria-label', 'Main')
    expect(within(bar).getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'Projects', 'People'])
    expect(within(bar).getByRole('link', { name: 'People' })).toHaveClass('Mui-selected')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByText('people content')).toBeInTheDocument()
  })

  it.each(['manager', 'admin', 'employee'])('never has more than four entries for a %s', (role) => {
    renderShell(role, role === 'employee' ? '/my-work' : '/dashboard')
    const bar = bottomBar()
    // An employee has a single place, so no bar is needed at all.
    if (role === 'employee') return expect(bar).toBeNull()
    expect(barEntries(bar as HTMLElement).length).toBeLessThanOrEqual(4)
  })

  it('shows an admin three places and More, which opens History, Archive and Sample data', async () => {
    renderShell('admin')
    const bar = bottomBar() as HTMLElement
    expect(barEntries(bar)).toEqual(['Dashboard', 'Projects', 'People', 'More'])
    await userEvent.click(within(bar).getByRole('button', { name: 'More' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['History', 'Archive', 'Sample data'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'History' }))
    expect(await screen.findByText('history content')).toBeInTheDocument()
  })

  it('gives a manager no More entry', () => {
    renderShell('manager')
    expect(barEntries(bottomBar() as HTMLElement)).toEqual(['Dashboard', 'Projects', 'People'])
  })

  it('draws no bottom bar for an employee, who has only one place', () => {
    renderShell('employee', '/my-work')
    expect(bottomBar()).toBeNull()
    expect(screen.getByText('my work content')).toBeInTheDocument()
  })

  it('still lets the person sign out, from the account menu', async () => {
    renderShell('admin')
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(localStorage.getItem('pm.auth')).toBeNull()
  })
})

describe('AppShell search', () => {
  it.each(['admin', 'manager', 'employee'])('puts the search box in the top bar of a %s on a wide screen', (role) => {
    renderShell(role, role === 'employee' ? '/my-work' : '/dashboard')
    expect(screen.getByRole('combobox', { name: 'Search projects, people, tasks' })).toBeInTheDocument()
  })

  it('shows a search icon instead of the box on a phone', async () => {
    wide = false
    renderShell('manager')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByRole('combobox', { name: 'Search projects, people, tasks' })).toBeInTheDocument()
  })

  it('shows nothing of it when nobody is signed in', () => {
    renderShell(null)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
