import { alpha, createTheme } from '@mui/material/styles'

// A flat, square-edged teal theme in Plus Jakarta Sans: hairline borders instead of shadows, small rectangular controls,
// capitalised micro-labels, and a top navigation bar. The colours are the same teal family as before.
// Colour means status and nothing else (green on track, amber at risk, red overdue, grey done); teal is the brand.
// The accent teal is light, which is too pale for text, so text and links use the deeper teal in `primary.main`.
// Every text colour keeps at least 4.5:1 contrast on its surface (the end-to-end test scans for it).
const teal = '#087069' // text and links
const tealLight = '#5eead4' // fills: the open menu item, the brand mark
const tealMid = '#2dd4bf' // the main button
const ink = '#12302e'
const mint = '#eefaf8'
const rule = alpha('#087069', 0.26) // the one border colour used everywhere

/** The few translucent teals used for hover, selected and quiet backgrounds, named once instead of repeated as numbers. */
export const tint = {
  soft: alpha(tealLight, 0.12),
  hover: alpha(tealLight, 0.1),
  selected: alpha(tealLight, 0.24),
  strong: alpha(tealLight, 0.34),
  rule: alpha(teal, 0.12),
}

export type Mode = 'light' | 'dark'

/** The theme for a mode. Same teal brand colours; on dark the text-sized teals and the status colours are the light versions. */
export function buildTheme(mode: Mode) {
  const dark = mode === 'dark'
  const accent = dark ? '#5eead4' : teal // text, links, the tab bar
  const muted = dark ? '#9fc4bf' : '#3f6f6a' // micro-labels and table headings
  const line = dark ? alpha('#5eead4', 0.22) : rule
  return createTheme({
    palette: {
      mode,
      primary: dark
        ? { main: '#5eead4', light: tealMid, dark: '#99f6e4', contrastText: '#052e2b' }
        : { main: teal, light: tealMid, dark: '#075e59', contrastText: '#ffffff' },
      secondary: dark ? { main: '#9fc4bf', contrastText: '#052e2b' } : { main: '#3f6f6a', contrastText: '#ffffff' },
      success: dark ? { main: '#4ade80', dark: '#86efac', contrastText: '#052e16' } : { main: '#15803d', dark: '#166534', contrastText: '#ffffff' },
      warning: dark ? { main: '#f59e0b', dark: '#fcd34d', contrastText: '#2a1a00' } : { main: '#f59e0b', dark: '#b45309', contrastText: '#2a1a00' },
      error: dark ? { main: '#f87171', dark: '#fca5a5', contrastText: '#2a0a0a' } : { main: '#dc2626', dark: '#b91c1c', contrastText: '#ffffff' },
      info: dark ? { main: '#38bdf8', dark: '#7dd3fc', contrastText: '#03283d' } : { main: '#0369a1', dark: '#075985', contrastText: '#ffffff' },
      background: dark ? { default: '#0a1716', paper: '#102624' } : { default: mint, paper: '#ffffff' },
      text: dark ? { primary: '#e6f4f1', secondary: '#9fc4bf' } : { primary: ink, secondary: '#4a6b68' },
      divider: line,
    },
    shape: { borderRadius: 3 },
    typography: {
      fontFamily: '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
      h4: { fontWeight: 800, letterSpacing: '-0.03em' },
      h5: { fontWeight: 800, letterSpacing: '-0.03em' },
      h6: { fontWeight: 700, letterSpacing: '-0.01em' },
      subtitle2: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 700, letterSpacing: '0.01em' },
      // The capitalised micro-label used over every figure and column.
      overline: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.5, textTransform: 'none', color: muted },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundImage: 'none', wordSpacing: '0.06em' }, // this face sets its spaces tight
          '::selection': { background: alpha(tealMid, 0.35) },
        },
      },
      MuiPaper: {
        defaultProps: { variant: 'outlined', square: false },
        styleOverrides: { root: { backgroundImage: 'none', borderColor: line, boxShadow: 'none' } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: ({ ownerState }) => ({
            borderRadius: 3,
            ...(ownerState.variant === 'contained' && ownerState.color === 'primary'
              ? { backgroundColor: tealMid, color: '#052e2b', border: `1px solid ${accent}`, '&:hover': { backgroundColor: tealLight } }
              : {}),
            ...(ownerState.variant === 'outlined' && ownerState.color === 'primary' ? { borderColor: accent, borderWidth: 1 } : {}),
          }),
        },
      },
      MuiButtonGroup: { styleOverrides: { root: { borderRadius: 3 } } },
      MuiToggleButton: {
        styleOverrides: {
          root: { borderRadius: 3, minHeight: 44, textTransform: 'none', fontWeight: 700, '&.Mui-selected': { backgroundColor: alpha(tealMid, 0.3), color: dark ? '#e6f4f1' : ink } },
        },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: 3, height: 24 } } },
      // Hidden labels inside a table (position: absolute) belong to the scrolling container, or they widen the whole page on a phone.
      MuiTableContainer: { styleOverrides: { root: { position: 'relative' } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: alpha(accent, 0.16) },
          head: { fontWeight: 700, color: muted, fontSize: '0.75rem', borderBottom: `1px solid ${accent}` },
        },
      },
      MuiTabs: {
        styleOverrides: { root: { minHeight: 40 }, indicator: { height: 3, borderRadius: 0, backgroundColor: accent } },
      },
      MuiTab: { styleOverrides: { root: { minHeight: 40, fontWeight: 700, borderRadius: 0 } } },
      MuiLinearProgress: { styleOverrides: { root: { backgroundColor: alpha(tealMid, 0.2), borderRadius: 0 }, bar: { borderRadius: 0 } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 3, backgroundColor: dark ? '#102624' : '#ffffff' } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 4, boxShadow: `0 16px 40px -16px ${dark ? alpha('#000000', 0.7) : alpha(teal, 0.45)}` } } },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: dark ? '#245853' : '#0f3d3a', color: '#ffffff', borderRadius: 3 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 3 } } },
      MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0 } } },
    },
  })
}

/** The light theme, for code and tests that do not care about the mode. */
export const theme = buildTheme('light')
