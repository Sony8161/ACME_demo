import { useState, type ReactElement } from 'react'
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Divider, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Toolbar,
  Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined'
import FolderIcon from '@mui/icons-material/FolderOpenOutlined'
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined'
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import SampleDataIcon from '@mui/icons-material/GroupAddOutlined'
import WorkIcon from '@mui/icons-material/AssignmentTurnedInOutlined'
import { useMediaQuery } from 'react-responsive'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { AccountMenu } from '../components/AccountMenu'
import { AssistantChat } from '../components/AssistantChat'
import { SampleDataFlow } from '../components/SampleDataFlow'
import { ToastProvider } from '../components/ToastProvider'
import { moreFor, navFor, type NavItem } from './nav'

const ICONS: Record<NavItem['icon'], ReactElement> = {
  dashboard: <DashboardIcon />,
  projects: <FolderIcon />,
  people: <PeopleIcon />,
  archive: <ArchiveIcon />,
  history: <HistoryIcon />,
  work: <WorkIcon />,
}

/** Frame around every signed-in page: a short top bar on a laptop, a bottom bar (four entries at most) on a phone. */
export function AppShell() {
  const { user, logout } = useAuth()
  const isDesktop = useMediaQuery({ minWidth: 900 })
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [reloads, setReloads] = useState(0) // bumping it remounts the open page so it fetches again
  if (!user) return null
  const items = navFor(user.role)
  const more = moreFor(user.role)
  const inMore = more.some((m) => pathname.startsWith(m.to))
  const current = inMore ? 'more' : (items.find((item) => pathname.startsWith(item.to))?.to ?? false)
  const closeMore = () => setMoreAnchor(null)

  const moreMenu = (
    <Menu anchorEl={moreAnchor} open={moreAnchor !== null} onClose={closeMore}>
      {more.map((m) => (
        <MenuItem key={m.to} selected={pathname.startsWith(m.to)} onClick={() => { closeMore(); navigate(m.to) }}>
          <ListItemIcon>{ICONS[m.icon]}</ListItemIcon>
          {m.label}
        </MenuItem>
      ))}
      {user.role === 'admin' && <Divider component="li" />}
      {user.role === 'admin' && (
        <MenuItem onClick={() => { closeMore(); setSampleOpen(true) }}>
          <ListItemIcon><SampleDataIcon /></ListItemIcon>
          Sample data
        </MenuItem>
      )}
    </Menu>
  )

  return (
    <ToastProvider>
      <Box sx={{ minHeight: '100vh' }}>
        <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', backgroundImage: 'none', bgcolor: '#ffffff', color: 'text.primary' }}>
          <Toolbar sx={{ gap: 2, minHeight: { xs: 56, md: 60 } }}>
            <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: '3px', bgcolor: 'primary.light', border: '1px solid', borderColor: 'primary.main', flexShrink: 0 }} />
            <Typography variant="h6" noWrap sx={{ mr: isDesktop ? 2 : 0, flexGrow: isDesktop ? 0 : 1 }}>ACME Projects</Typography>
            {isDesktop && (
              <List component="nav" aria-label="Main" sx={{ display: 'flex', flexGrow: 1, p: 0, gap: 0.5, alignSelf: 'stretch' }}>
                {items.map((item) => (
                  <ListItemButton
                    key={item.to} component={NavLink} to={item.to} selected={current === item.to}
                    sx={{
                      flexGrow: 0, px: 1.75, borderRadius: 0, borderBottom: '3px solid transparent', mt: '3px', fontWeight: 600,
                      '&.Mui-selected': { bgcolor: 'rgba(94,234,212,.22)', borderBottomColor: 'primary.main', color: 'primary.dark', fontWeight: 800 },
                      '&.Mui-selected:hover': { bgcolor: 'rgba(94,234,212,.34)' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 28, color: 'inherit' }}>{ICONS[item.icon]}</ListItemIcon>
                    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 'inherit', fontSize: '0.875rem' } } }} />
                  </ListItemButton>
                ))}
                {more.length > 0 && (
                  <ListItemButton
                    aria-haspopup="menu" selected={current === 'more'} onClick={(e) => setMoreAnchor(e.currentTarget)}
                    sx={{
                      flexGrow: 0, px: 1.75, borderRadius: 0, borderBottom: '3px solid transparent', mt: '3px', fontWeight: 600,
                      '&.Mui-selected': { bgcolor: 'rgba(94,234,212,.22)', borderBottomColor: 'primary.main', color: 'primary.dark', fontWeight: 800 },
                    }}
                  >
                    <ListItemText primary="More" slotProps={{ primary: { sx: { fontWeight: 'inherit', fontSize: '0.875rem' } } }} />
                  </ListItemButton>
                )}
              </List>
            )}
            <AccountMenu user={user} onSignOut={logout} />
          </Toolbar>
        </AppBar>
        {moreMenu}
        <SampleDataFlow open={sampleOpen} onClose={() => setSampleOpen(false)} onDone={() => setReloads((n) => n + 1)} />

        <Box component="main" sx={{ pt: { xs: 9.5, md: 11 }, pb: isDesktop ? 6 : 19, px: { xs: 2, md: 4 } }}>
          <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
            <Outlet key={reloads} />
          </Box>
        </Box>

        <AssistantChat role={user.role} compact={!isDesktop && items.length > 1} />

        {!isDesktop && items.length > 1 && (
          <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, borderRadius: 0 }}>
            <BottomNavigation showLabels value={current} aria-label="Main">
              {items.map((item) => (
                <BottomNavigationAction key={item.to} component={NavLink} to={item.to} value={item.to} label={item.label} icon={ICONS[item.icon]} />
              ))}
              {more.length > 0 && <BottomNavigationAction value="more" label="More" icon={<MoreIcon />} onClick={(e) => setMoreAnchor(e.currentTarget)} />}
            </BottomNavigation>
          </Paper>
        )}
      </Box>
    </ToastProvider>
  )
}
