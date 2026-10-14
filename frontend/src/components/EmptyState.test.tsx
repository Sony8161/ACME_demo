import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EmptyState } from './EmptyState'

const renderIt = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('EmptyState', () => {
  it('says what is missing and offers nothing when there is no action', () => {
    renderIt(<EmptyState text="Nobody matches." />)
    expect(screen.getByText('Nobody matches.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers a button that runs the action', async () => {
    const onClick = vi.fn()
    renderIt(<EmptyState text="No projects match." action={{ label: 'Clear filters', onClick }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('offers a link, not a button, when the action has a destination', () => {
    renderIt(<EmptyState text="No tasks." action={{ label: 'Go to projects', to: '/projects' }} />)
    expect(screen.getByRole('link', { name: 'Go to projects' })).toHaveAttribute('href', '/projects')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
