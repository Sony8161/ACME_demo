import { buildTheme } from './theme'
import { heatColors } from './components/heatColors'

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}
/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** MUI may hand back rgb() or #rrggbb; this test only uses colours written as hex. */
const hex = (value: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`expected #rrggbb, got ${value}`)
  return value
}

describe.each(['light', 'dark'] as const)('the %s theme', (mode) => {
  const p = buildTheme(mode).palette

  it('is the mode it says it is', () => {
    expect(p.mode).toBe(mode)
  })

  it('keeps ordinary text readable on every surface (7:1 for the main text, 4.5:1 for the rest)', () => {
    for (const surface of [p.background.default, p.background.paper]) {
      expect(contrast(hex(p.text.primary), hex(surface))).toBeGreaterThanOrEqual(7)
      expect(contrast(hex(p.text.secondary), hex(surface))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(hex(p.primary.main), hex(surface))).toBeGreaterThanOrEqual(4.5) // links and outlined buttons
      expect(contrast(hex(p.primary.dark), hex(surface))).toBeGreaterThanOrEqual(4.5) // the selected menu entry
    }
  })

  it.each(['success', 'warning', 'error', 'info'] as const)('keeps %s readable as a filled chip and as text', (name) => {
    const c = p[name]
    expect(contrast(hex(c.contrastText), hex(c.main))).toBeGreaterThanOrEqual(4.5) // label on a filled chip
    expect(contrast(hex(c.dark), hex(p.background.paper))).toBeGreaterThanOrEqual(4.5) // headings and warnings written in that colour
  })

  it('makes a table container the home of the hidden labels inside it, so they cannot widen the page on a phone', () => {
    const root = buildTheme(mode).components?.MuiTableContainer?.styleOverrides?.root as Record<string, string> | undefined
    expect(root?.position).toBe('relative')
  })

  it('gives toggle buttons a 44 px touch target', () => {
    const root = buildTheme(mode).components?.MuiToggleButton?.styleOverrides?.root as Record<string, unknown> | undefined
    expect(root?.minHeight).toBe(44)
  })

  it('keeps the main button readable', () => {
    const button = buildTheme(mode).components?.MuiButton?.styleOverrides?.root
    const style = typeof button === 'function' ? (button as (o: unknown) => Record<string, string>)({ ownerState: { variant: 'contained', color: 'primary' } }) : {}
    expect(contrast(hex(style.color), hex(style.backgroundColor))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps every shade of the workload heatmap readable', () => {
    for (const level of Object.values(heatColors(mode)).filter((c) => c.bg !== 'transparent')) {
      expect(contrast(hex(level.fg), hex(level.bg))).toBeGreaterThanOrEqual(4.5)
    }
    expect(heatColors(mode).free.bg).toBe('transparent')
  })
})

it('the two modes really differ: a light page and a dark page', () => {
  expect(luminance(buildTheme('light').palette.background.paper)).toBeGreaterThan(0.8)
  expect(luminance(buildTheme('dark').palette.background.paper)).toBeLessThan(0.1)
})
