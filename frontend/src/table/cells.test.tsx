import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { SelectAllCell, SelectCell } from './SelectCells'
import { SelectionBar } from './SelectionBar'
import { SortHead } from './SortHead'

const inTable = (head: React.ReactNode, body?: React.ReactNode) => render(
  <Table><TableHead><TableRow>{head}</TableRow></TableHead><TableBody><TableRow>{body ?? <TableCell />}</TableRow></TableBody></Table>,
)

describe('SortHead', () => {
  it('announces the direction on the active column only, and sorts on click', async () => {
    const onSort = vi.fn()
    inTable(<><SortHead label="Name" active dir="asc" onSort={onSort} /><SortHead label="Ends" active={false} dir="asc" onSort={() => {}} /></>)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: 'Ends' })).not.toHaveAttribute('aria-sort')
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('can be sorted from the keyboard', async () => {
    const onSort = vi.fn()
    inTable(<SortHead label="Name" active={false} dir="asc" onSort={onSort} />)
    screen.getByRole('button', { name: 'Name' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onSort).toHaveBeenCalledTimes(1)
  })
})

describe('SelectCell', () => {
  it('has a label naming the row, and reports the change', async () => {
    const onChange = vi.fn()
    inTable(<TableCell />, <SelectCell label="Select Alex Kim" checked={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alex Kim' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Space ticks it', async () => {
    const onChange = vi.fn()
    inTable(<TableCell />, <SelectCell label="Select Alex Kim" checked={false} onChange={onChange} />)
    screen.getByRole('checkbox', { name: 'Select Alex Kim' }).focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('SelectAllCell', () => {
  it('is half ticked when some of the page is ticked, ticked when all are, and says how many it covers', () => {
    const { rerender } = inTable(<SelectAllCell pageIds={['a', 'b']} ticked={new Set(['a'])} onChange={() => {}} />)
    const box = screen.getByRole('checkbox', { name: 'Select all 2 on this page' })
    expect(box).toHaveAttribute('data-indeterminate', 'true')
    rerender(<Table><TableHead><TableRow><SelectAllCell pageIds={['a', 'b']} ticked={new Set(['a', 'b'])} onChange={() => {}} /></TableRow></TableHead></Table>)
    expect(screen.getByRole('checkbox', { name: 'Select all 2 on this page' })).toBeChecked()
  })

  it('ticks the whole page, or unticks it when it is all ticked already', async () => {
    const onChange = vi.fn()
    const { rerender } = inTable(<SelectAllCell pageIds={['a', 'b']} ticked={new Set()} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenLastCalledWith(true)
    rerender(<Table><TableHead><TableRow><SelectAllCell pageIds={['a', 'b']} ticked={new Set(['a', 'b'])} onChange={onChange} /></TableRow></TableHead></Table>)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('is disabled when the page is empty', () => {
    inTable(<SelectAllCell pageIds={[]} ticked={new Set()} onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})

describe('SelectionBar', () => {
  it('shows nothing until something is ticked', () => {
    const { container } = render(<SelectionBar count={0} total={10} onSelectAll={() => {}} onClear={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says how many are ticked, offers Select all when more match, and clears', async () => {
    const onSelectAll = vi.fn()
    const onClear = vi.fn()
    render(<SelectionBar count={3} total={31} onSelectAll={onSelectAll} onClear={onClear}><button>Export</button></SelectionBar>)
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Select all 31' }))
    expect(onSelectAll).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it('does not offer Select all when everything is already ticked', () => {
    render(<SelectionBar count={31} total={31} onSelectAll={() => {}} onClear={() => {}} />)
    expect(screen.queryByRole('button', { name: /Select all/ })).not.toBeInTheDocument()
  })
})
