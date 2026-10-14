import { alpha, createTheme } from '@mui/material/styles'

// A light teal theme in Plus Jakarta Sans: airy mint surfaces, soft shadows instead of hard borders, pill shapes.
// Colour means status and nothing else (green on track, amber at risk, red overdue, grey done); teal is the brand.
// The accent teal is light (#2dd4bf), which is too pale for text, so text and links use the deeper teal in `primary.main`.
// Every text colour keeps at least 4.5:1 contrast on its surface (the end-to-end test scans for it).
const teal = '#087069' // text and links
const tealLight = '#5eead4' // fills: buttons, the brand mark, the open menu item
const tealMid = '#2dd4bf'
const ink = '#12302e'
const mint = '#eefaf8'

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
    divider: alpha('#0b7f78', 0.14),
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 800, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Two soft teal washes, top left and bottom right: the only decoration on the page.
          backgroundImage: `radial-gradient(900px 520px at 0% -8%, ${alpha(tealLight, 0.45)}, transparent 62%), radial-gradient(760px 520px at 100% 108%, ${alpha('#99f6e4', 0.4)}, transparent 62%)`,
          backgroundAttachment: 'fixed',
          wordSpacing: '0.06em', // this face sets its spaces tight
        },
        '::selection': { background: alpha(tealMid, 0.35) },
      },
    },
    MuiPaper: {
      defaultProps: { variant: 'elevation', elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', border: `1px solid ${alpha('#0b7f78', 0.1)}`, boxShadow: `0 1px 2px ${alpha('#0b4f4a', 0.05)}, 0 10px 30px -14px ${alpha('#0b7f78', 0.28)}` },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: 999,
          ...(ownerState.variant === 'contained' && ownerState.color === 'primary'
            ? { background: `linear-gradient(135deg, ${tealLight}, ${tealMid})`, color: '#052e2b', boxShadow: `0 6px 18px -8px ${alpha('#0b7f78', 0.8)}`, '&:hover': { background: `linear-gradient(135deg, #7ff0dd, ${tealMid})` } }
            : {}),
        }),
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: 999 } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, color: '#3f6f6a', backgroundColor: alpha(tealLight, 0.14) } } },
    MuiTabs: { styleOverrides: { indicator: { height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${tealMid}, ${tealLight})` } } },
    MuiLinearProgress: { styleOverrides: { root: { backgroundColor: alpha(tealMid, 0.2), borderRadius: 999 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, backgroundColor: '#ffffff' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20, boxShadow: `0 30px 80px -24px ${alpha('#0b4f4a', 0.45)}` } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#0f3d3a', borderRadius: 10 } } },
    MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0 } } },
  },
})
