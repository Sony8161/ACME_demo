export type Cell = string | number | null | undefined

const BOM = '﻿' // lets Excel read accents as UTF-8
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: Cell): string {
  if (value === null || value === undefined) return ''
  // A real number is safe as it is (a negative one starts with "-"); text that starts like a formula is not.
  const text = typeof value === 'number' ? String(value) : FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Spreadsheet-safe CSV: quoted where needed, formulas neutralised, UTF-8 byte-order mark first. */
export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

/** Hand the browser a file to save. */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
