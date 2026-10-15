import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { downloadCsv } from '../export/csv'
import { saveBlob } from '../export/download'
import { buildTablePdf } from '../export/pdf'
import type { ExportColumn } from '../export/columns'
import { ExportDialog } from './ExportDialog'

vi.mock('../export/csv', () => ({ downloadCsv: vi.fn() }))
vi.mock('../export/download', () => ({ saveBlob: vi.fn() }))
vi.mock('../export/pdf', () => ({ buildTablePdf: vi.fn() }))

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

beforeEach(() => {
  vi.mocked(downloadCsv).mockClear()
  vi.mocked(saveBlob).mockClear()
  vi.mocked(buildTablePdf).mockReset()
})

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

  describe('as a PDF', () => {
    const pdf = new Blob(['%PDF-'], { type: 'application/pdf' })
    const chooseDialogPdf = async () => {
      const dialog = await screen.findByRole('dialog', { name: 'Export 2 people' })
      await userEvent.click(within(dialog).getByRole('radio', { name: 'PDF' }))
      return dialog
    }

    it('offers CSV and PDF, CSV first, and the button and file name follow the choice', async () => {
      open()
      const dialog = await screen.findByRole('dialog', { name: 'Export 2 people' })
      expect(within(dialog).getByRole('radio', { name: 'CSV' })).toBeChecked()
      expect(within(dialog).getByRole('button', { name: 'Download CSV' })).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('radio', { name: 'PDF' }))
      expect(within(dialog).getByRole('button', { name: 'Download PDF' })).toBeInTheDocument()
      expect(dialog).toHaveTextContent('acme-people-2026-10-15.pdf')
      expect(dialog).not.toHaveTextContent('.csv')
    })

    it('cannot be cancelled while the PDF is being made, so a cancel never ends in a surprise download', async () => {
      let finish!: (b: Blob) => void
      vi.mocked(buildTablePdf).mockReturnValue(new Promise<Blob>((resolve) => { finish = resolve }))
      const { onClose } = open()
      const dialog = await chooseDialogPdf()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }))
      expect(await within(dialog).findByRole('button', { name: 'Preparing…' })).toBeDisabled()
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
      await userEvent.keyboard('{Escape}')
      expect(onClose).not.toHaveBeenCalled()
      finish(pdf)
      await vi.waitFor(() => expect(saveBlob).toHaveBeenCalled())
    })

    it('builds the PDF from the ticked columns and saves it, then reports and closes', async () => {
      vi.mocked(buildTablePdf).mockResolvedValue(pdf)
      const { onExported, onClose } = open()
      const dialog = await chooseDialogPdf()
      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Email' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }))
      await vi.waitFor(() => expect(saveBlob).toHaveBeenCalledWith('acme-people-2026-10-15.pdf', pdf))
      const opts = vi.mocked(buildTablePdf).mock.calls[0][0]
      expect(opts.title).toBe('People')
      expect(opts.subtitle).toMatch(/^2 people · \d{4}-\d{2}-\d{2} UTC$/)
      expect(opts.head).toEqual(['Name', 'Pay'])
      expect(opts.rows).toEqual([['Ann', 5], ['Bo', null]])
      expect(downloadCsv).not.toHaveBeenCalled()
      expect(onExported).toHaveBeenCalledWith(2)
      expect(onClose).toHaveBeenCalled()
    })

    it('shows Preparing… and cannot be pressed twice while the PDF is being made', async () => {
      let finish: (b: Blob) => void = () => {}
      vi.mocked(buildTablePdf).mockReturnValue(new Promise<Blob>((resolve) => { finish = resolve }))
      open()
      const dialog = await chooseDialogPdf()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }))
      expect(await within(dialog).findByRole('button', { name: 'Preparing…' })).toBeDisabled()
      finish(pdf)
      await vi.waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
      expect(buildTablePdf).toHaveBeenCalledTimes(1)
    })

    it('says so and stays open, saving nothing, when the PDF cannot be made', async () => {
      vi.mocked(buildTablePdf).mockRejectedValue(new Error('boom'))
      const { onClose, onExported } = open()
      const dialog = await chooseDialogPdf()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }))
      expect(await within(dialog).findByText('The PDF could not be made.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Download PDF' })).toBeEnabled()
      expect(saveBlob).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(onExported).not.toHaveBeenCalled()
    })

    it('still will not download with every column unticked', async () => {
      open()
      const dialog = await chooseDialogPdf()
      for (const label of ['Name', 'Email', 'Pay']) await userEvent.click(within(dialog).getByRole('checkbox', { name: label }))
      expect(within(dialog).getByRole('button', { name: 'Download PDF' })).toBeDisabled()
    })
  })
})
