import { downloadCsv, toCsv } from './csv'

const BOM = '﻿'

describe('toCsv', () => {
  it('quotes cells that hold commas, quotes or new lines, and keeps accents', () => {
    expect(toCsv([['a,b', 'say "hi"'], ['x\ny', 'é']])).toBe(`${BOM}"a,b","say ""hi"""\r\n"x\ny",é`)
  })

  it('neutralises text that a spreadsheet would run as a formula', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-1', '@cmd', '\t=x']])).toBe(`${BOM}'=SUM(A1),'+1,'-1,'@cmd,'\t=x`)
  })

  it('keeps real numbers as they are, including negatives', () => {
    expect(toCsv([[-5, 12.5, 0]])).toBe(`${BOM}-5,12.5,0`)
  })

  it('writes null and undefined as empty cells', () => {
    expect(toCsv([['a', null, undefined, 'b']])).toBe(`${BOM}a,,,b`)
  })

  it('is just the byte-order mark for no rows', () => {
    expect(toCsv([])).toBe(BOM)
  })
})

describe('downloadCsv', () => {
  it('saves the file under the given name and releases the temporary address', async () => {
    const created: Blob[] = []
    const createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return 'blob:test' })
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('people.csv')
      expect(this.href).toBe('blob:test')
    })

    downloadCsv('people.csv', [['Name'], ['Ann']])

    expect(click).toHaveBeenCalledTimes(1)
    expect(created[0].type).toBe('text/csv;charset=utf-8')
    const bytes = new Uint8Array(await created[0].arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]) // the byte-order mark Excel needs
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(toCsv([['Name'], ['Ann']]))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })
})
