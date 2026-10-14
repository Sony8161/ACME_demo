import type { ReactElement } from 'react'
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Chip, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Paper, Toolbar, Tooltip, Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined'
import FolderIcon from '@mui/icons-material/FolderOpenOutlined'
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined'
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'
import WorkIcon from '@mui/icons-material/AssignmentTurnedInOutlined'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import { useMediaQuery } from 'react-responsive'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { navFor, type NavItem } from './nav'

const ICONS: Record<NavItem['icon'], ReactElement> = {
  dashboard: <DashboardIcon />,
  projects: <FolderIcon />,
  people: <PeopleIcon />,
  archive: <ArchiveIcon />,
  history: <HistoryIcon />,
  work: <WorkIcon />,
}

const DRAWER_WIDTH = 224

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
      <AppBar
        position="fixed" color="inherit" elevation={0}
        sx={{
          borderBottom: 1, borderColor: 'divider', zIndex: (t) => t.zIndex.drawer + 1, backgroundImage: 'none', color: 'text.primary',
          bgcolor: 'rgba(255,255,255,.72)', backdropFilter: 'blur(12px)',
          '&::after': { content: '""', position: 'absolute', left: 0, right: 0, bottom: -1, height: '2px', background: 'linear-gradient(90deg, #2dd4bf, rgba(45,212,191,0) 60%)' },
        }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <Box
            sx={{
              width: 30, height: 30, borderRadius: '50%', position: 'relative', flexShrink: 0,
              background: 'linear-gradient(135deg, #99f6e4 0%, #2dd4bf 100%)', boxShadow: '0 6px 16px -6px rgba(11,127,120,.7)',
            }}
            aria-hidden
          >
            <Box sx={{ position: 'absolute', left: 7, right: 7, bottom: 9, height: 3, borderRadius: 2, bgcolor: 'rgba(5,46,43,.25)' }} />
            <Box sx={{ position: 'absolute', left: 7, width: 9, bottom: 9, height: 3, borderRadius: 2, bgcolor: '#052e2b' }} />
            <Box sx={{ position: 'absolute', right: 7, top: 7, width: 6, height: 6, borderRadius: '50%', bgcolor: '#fff' }} />
          </Box>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>ACME Projects</Typography>
          {isDesktop && <Typography variant="body2" color="text.secondary">{user.name}</Typography>}
          <Chip size="small" label={user.role} sx={{ textTransform: 'capitalize' }} />
          <Tooltip title="Sign out">
            <IconButton aria-label="Sign out" onClick={logout}><LogoutIcon /></IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {isDesktop && (
        <Drawer
          variant="permanent"
          sx={{ width: DRAWER_WIDTH, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider', bgcolor: 'rgba(255,255,255,.55)', backdropFilter: 'blur(8px)', backgroundImage: 'none' } }}
        >
          <Toolbar />
          <List component="nav" aria-label="Main" sx={{ p: 1.5 }}>
            {items.map((item) => (
              <ListItemButton key={item.to} component={NavLink} to={item.to} selected={current === item.to}
                sx={{
                  borderRadius: 999, mb: 0.5, position: 'relative',
                  '&.Mui-selected': { bgcolor: 'rgba(94,234,212,.32)', color: 'primary.dark', fontWeight: 700 },
                  '&.Mui-selected:hover': { bgcolor: 'rgba(94,234,212,.42)' },
                  '&.Mui-selected .MuiListItemIcon-root': { color: 'primary.dark' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{ICONS[item.icon]}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ pt: 11, pb: isDesktop ? 6 : 12, px: { xs: 2, md: 4 }, ml: isDesktop ? `${DRAWER_WIDTH}px` : 0 }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>

      {!isDesktop && items.length > 1 && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar }} elevation={3}>
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
