import type { ReactElement } from 'react'
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Chip, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Paper, Toolbar, Tooltip, Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined'
import FolderIcon from '@mui/icons-material/FolderOpenOutlined'
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined'
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'
import TasksIcon from '@mui/icons-material/TaskAltOutlined'
import TimelineIcon from '@mui/icons-material/TimelineOutlined'
import WorkIcon from '@mui/icons-material/AssignmentTurnedInOutlined'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import { useMediaQuery } from 'react-responsive'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { AssistantChat } from '../components/AssistantChat'
import { navFor, type NavItem } from './nav'

const ICONS: Record<NavItem['icon'], ReactElement> = {
  dashboard: <DashboardIcon />,
  projects: <FolderIcon />,
  people: <PeopleIcon />,
  archive: <ArchiveIcon />,
  history: <HistoryIcon />,
  work: <WorkIcon />,
  tasks: <TasksIcon />,
  timeline: <TimelineIcon />,
}


/** Frame around every signed-in page: a side menu on a laptop, a bottom tab bar on a phone. */
export function AppShell() {
  const { user, logout } = useAuth()
  const isDesktop = useMediaQuery({ minWidth: 900 })
  const { pathname } = useLocation()
  if (!user) return null
  const items = navFor(user.role)
  const current = items.find((item) => pathname.startsWith(item.to))?.to ?? false

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', backgroundImage: 'none', bgcolor: '#ffffff', color: 'text.primary' }}>
        <Toolbar sx={{ gap: 2, minHeight: { xs: 56, md: 60 } }}>
          <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: '3px', bgcolor: 'primary.light', border: '1px solid', borderColor: 'primary.main', position: 'relative', flexShrink: 0 }}>
            <Box sx={{ position: 'absolute', left: 5, right: 5, bottom: 7, height: 3, bgcolor: 'rgba(5,46,43,.25)' }} />
            <Box sx={{ position: 'absolute', left: 5, width: 9, bottom: 7, height: 3, bgcolor: '#052e2b' }} />
            <Box sx={{ position: 'absolute', right: 5, top: 5, width: 5, height: 5, bgcolor: '#fff' }} />
          </Box>
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
            </List>
          )}
          {isDesktop && <Typography variant="body2" color="text.secondary">{user.name}</Typography>}
          <Chip size="small" label={user.role} sx={{ textTransform: 'capitalize' }} />
          <Tooltip title="Sign out">
            <IconButton aria-label="Sign out" onClick={logout}><LogoutIcon /></IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ pt: { xs: 9.5, md: 11 }, pb: isDesktop ? 6 : 12, px: { xs: 2, md: 4 } }}>
        <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>

      <AssistantChat role={user.role} compact={!isDesktop && items.length > 1} />

      {!isDesktop && items.length > 1 && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, borderRadius: 0 }}>
          <BottomNavigation showLabels value={current}>
            {items.map((item) => (
              <BottomNavigationAction key={item.to} component={NavLink} to={item.to} value={item.to} label={item.label} icon={ICONS[item.icon]} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
