import { alpha, createTheme } from '@mui/material/styles'

// A dark purple theme in IBM Plex Mono. Violet is the brand colour: navigation, focus, and the main action on a screen.
// Colour still means status and nothing else: green on track, amber at risk, red overdue, grey done.
// Every text colour here has at least 4.5:1 contrast on the surface it sits on (the end-to-end test scans for it).
const violet = '#a78bfa'
const ink = '#ece8fa'
const night = '#0f0a1e'
const surface = '#171028'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: violet, light: '#c4b5fd', dark: '#7c3aed', contrastText: '#140b26' },
    secondary: { main: '#c4b5fd', contrastText: '#140b26' },
    success: { main: '#4ade80', contrastText: '#052e16' },
    warning: { main: '#fbbf24', contrastText: '#2a1a00' },
    error: { main: '#f87171', contrastText: '#2a0606' },
    info: { main: '#93c5fd', contrastText: '#0b1d36' },
    background: { default: night, paper: surface },
    text: { primary: ink, secondary: '#b3a8d1' },
    divider: alpha(violet, 0.18),
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    fontSize: 13, // a monospace face is wider than a proportional one: this keeps the screens as dense as before
    h4: { fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.02em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // A faint violet glow in the corner and a second one low on the right: the only decoration on the page.
          backgroundImage: `radial-gradient(900px 500px at 8% -10%, ${alpha('#7c3aed', 0.22)}, transparent 60%), radial-gradient(700px 480px at 100% 110%, ${alpha('#a78bfa', 0.1)}, transparent 60%)`,
          backgroundAttachment: 'fixed',
          fontVariantNumeric: 'tabular-nums',
        },
        '::selection': { background: alpha(violet, 0.4), color: '#fff' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': { background: alpha(violet, 0.3), borderRadius: 6 },
      },
    },
    MuiPaper: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { backgroundImage: 'none', backgroundColor: alpha(surface, 0.86), backdropFilter: 'blur(6px)' } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ ownerState }) =>
          ownerState.variant === 'contained' && ownerState.color === 'primary'
            ? { boxShadow: `0 0 0 1px ${alpha(violet, 0.5)}, 0 6px 22px -8px ${alpha('#7c3aed', 0.9)}` }
            : {},
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTableCell: { styleOverrides: { head: { color: '#b3a8d1', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.72rem' } } },
    MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0, paddingInline: 4 }, label: { fontSize: '0.62rem' } } },
    MuiTab: { styleOverrides: { root: { letterSpacing: '0.02em' } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3, boxShadow: `0 0 12px ${alpha(violet, 0.8)}` } } },
    MuiLinearProgress: { styleOverrides: { root: { backgroundColor: alpha(violet, 0.16) } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: alpha('#000', 0.18) } } },
    MuiDialog: { styleOverrides: { paper: { backgroundImage: 'none', backgroundColor: '#1a1230', boxShadow: `0 24px 80px -20px ${alpha('#7c3aed', 0.55)}` } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#2a1d4a', color: ink, border: `1px solid ${alpha(violet, 0.35)}` } } },
  },
})
