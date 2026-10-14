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

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: teal, light: tealMid, dark: '#075e59', contrastText: '#ffffff' },
    secondary: { main: '#3f6f6a', contrastText: '#ffffff' },
    success: { main: '#15803d', contrastText: '#ffffff' },
    warning: { main: '#f59e0b', contrastText: '#2a1a00' },
    error: { main: '#dc2626', contrastText: '#ffffff' },
    info: { main: '#0369a1', contrastText: '#ffffff' },
    background: { default: mint, paper: '#ffffff' },
    text: { primary: ink, secondary: '#4a6b68' },
    divider: rule,
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
    overline: { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', lineHeight: 1.6, color: '#3f6f6a' },
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
      styleOverrides: { root: { backgroundImage: 'none', borderColor: rule, boxShadow: 'none' } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: 3,
          ...(ownerState.variant === 'contained' && ownerState.color === 'primary'
            ? { backgroundColor: tealMid, color: '#052e2b', border: `1px solid ${teal}`, '&:hover': { backgroundColor: tealLight } }
            : {}),
          ...(ownerState.variant === 'outlined' && ownerState.color === 'primary' ? { borderColor: teal, borderWidth: 1 } : {}),
        }),
      },
    },
    MuiButtonGroup: { styleOverrides: { root: { borderRadius: 3 } } },
    MuiToggleButton: { styleOverrides: { root: { borderRadius: 3, textTransform: 'none', fontWeight: 700, '&.Mui-selected': { backgroundColor: alpha(tealMid, 0.3), color: ink } } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: 3, height: 24 } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: alpha('#087069', 0.16) },
        head: { fontWeight: 800, color: '#3f6f6a', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: `2px solid ${teal}` },
      },
    },
    MuiTabs: {
      styleOverrides: { root: { minHeight: 40 }, indicator: { height: 3, borderRadius: 0, backgroundColor: teal } },
    },
    MuiTab: { styleOverrides: { root: { minHeight: 40, fontWeight: 700, borderRadius: 0 } } },
    MuiLinearProgress: { styleOverrides: { root: { backgroundColor: alpha(tealMid, 0.2), borderRadius: 0 }, bar: { borderRadius: 0 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 3, backgroundColor: '#ffffff' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 4, border: `1px solid ${teal}`, boxShadow: `8px 8px 0 ${alpha(tealMid, 0.45)}` } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#0f3d3a', borderRadius: 3 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 3 } } },
    MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0 } } },
  },
})
