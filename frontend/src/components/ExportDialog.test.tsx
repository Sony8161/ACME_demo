import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { downloadCsv } from '../export/csv'
import type { ExportColumn } from '../export/columns'
import { ExportDialog } from './ExportDialog'

vi.mock('../export/csv', () => ({ downloadCsv: vi.fn() }))

interface Row { name: string; email: string; pay: number | null }
const columns: ExportColumn<Row>[] = [
  { key: 'name', label: 'Name', get: (r) => r.name },
  { key: 'email', label: 'Email', get: (r) => r.email },
  { key: 'pay', label: 'Pay', get: (r) => r.pay },
]
const rows: Row[] = [{ name: 'Ann', email: 'a@x.test', pay: 5 }, { name: 'Bo', email: 'b@x.test', pay: null }]

function open(over: Partial<{ onClose: () => void; onExported: (n: number) => void; rows: Row[] }> = {}) {
  const onClose = over.onClose ?? vi.fn()
  const onExported = over.onExported ?? vi.fn()
  render(<ExportDialog open noun="people" nounOne="person" rows={over.rows ?? rows} columns={columns} filename="acme-people-2026-10-15.csv" onClose={onClose} onExported={onExported} />)
  return { onClose, onExported }
}

beforeEach(() => vi.mocked(downloadCsv).mockClear())

describe('ExportDialog', () => {
  it('says what is being exported and offers every column, all ticked', async () => {
    open()
    const dialog = await screen.findByRole('dialog', { name: 'Export 2 people' })
    for (const label of ['Name', 'Email', 'Pay']) expect(within(dialog).getByRole('checkbox', { name: label })).toBeChecked()
    expect(dialog).toHaveTextContent('acme-people-2026-10-15.csv')
  })

  it('says one person, not one people, for a single row', async () => {
    open({ rows: [rows[0]] })
    expect(await screen.findByRole('dialog', { name: 'Export 1 person' })).toBeInTheDocument()
  })

  it('downloads the ticked columns only, header first, rows in the order given', async () => {
    const { onExported, onClose } = open()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Email' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(downloadCsv).toHaveBeenCalledWith('acme-people-2026-10-15.csv', [['Name', 'Pay'], ['Ann', 5], ['Bo', null]])
    expect(onExported).toHaveBeenCalledWith(2)
    expect(onClose).toHaveBeenCalled()
  })

  it('will not download with every column unticked', async () => {
    open()
    for (const label of ['Name', 'Email', 'Pay']) await userEvent.click(await screen.findByRole('checkbox', { name: label }))
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
    expect(screen.getByText('Tick at least one column.')).toBeInTheDocument()
  })

  it('starts again with every column ticked each time it opens', async () => {
    const { rerender } = render(<ExportDialog open noun="people" nounOne="person" rows={rows} columns={columns} filename="f.csv" onClose={() => {}} onExported={() => {}} />)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Pay' }))
    rerender(<ExportDialog open={false} noun="people" nounOne="person" rows={rows} columns={columns} filename="f.csv" onClose={() => {}} onExported={() => {}} />)
    rerender(<ExportDialog open noun="people" nounOne="person" rows={rows} columns={columns} filename="f.csv" onClose={() => {}} onExported={() => {}} />)
    expect(await screen.findByRole('checkbox', { name: 'Pay' })).toBeChecked()
  })

  it('closes on Cancel without downloading', async () => {
    const { onClose } = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(downloadCsv).not.toHaveBeenCalled()
  })
})
