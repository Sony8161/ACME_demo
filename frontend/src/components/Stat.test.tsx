import { render, screen } from '@testing-library/react'
import { Stat } from './Stat'

describe('Stat', () => {
  it('shows the label and the value, and no hint unless one is given', () => {
    const { container } = render(<Stat label="Hours" value="344 h" />)
    expect(screen.getByText('Hours')).toBeInTheDocument()
    expect(screen.getByText('344 h')).toBeInTheDocument()
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('shows the hint under the value', () => {
    render(<Stat label="Budget" value="$21k" hint="of $60k" />)
    expect(screen.getByText('of $60k')).toBeInTheDocument()
  })

  it('colours the value with the tone it is given', () => {
    render(<Stat label="Late" value="3" tone="rgb(255, 0, 0)" />)
    expect(screen.getByText('3')).toHaveStyle({ color: 'rgb(255, 0, 0)' })
  })
})
