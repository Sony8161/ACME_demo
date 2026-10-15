import { saveBlob } from './download'

describe('saveBlob', () => {
  it('saves the file under the given name and releases the temporary address', () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('report.pdf')
      expect(this.href).toBe('blob:test')
    })
    const blob = new Blob(['x'], { type: 'application/pdf' })

    saveBlob('report.pdf', blob)

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })
})
