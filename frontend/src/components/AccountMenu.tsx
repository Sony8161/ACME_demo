import { useState } from 'react'
import { Avatar, Box, Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import type { User } from '../api/types'
import { initials } from '../tasks'
import { useThemeMode, type ThemeChoice } from '../themeMode'

/** One place for who you are signed in as and for signing out, instead of a name, a role tag and an icon along the top bar. */
export function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const { choice, setChoice } = useThemeMode()
  return (
    <>
      <Tooltip title={user.name}>
        <IconButton aria-label="Account menu" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
          {/* The initials are drawn by CSS, not text, so the button's name ("Account menu") is the only name there is. */}
          <Avatar
            aria-hidden data-initials={initials(user.name)} variant="rounded"
            sx={{ width: 34, height: 34, borderRadius: '3px', fontSize: 13, fontWeight: 700, bgcolor: 'primary.light', color: '#052e2b', '&::before': { content: 'attr(data-initials)' } }}
          >
            <span />
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{user.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{user.role}</Typography>
        </Box>
        <Divider />
        <Typography variant="overline" component="div" sx={{ px: 2, pt: 1 }}>Appearance</Typography>
        {(['system', 'light', 'dark'] as ThemeChoice[]).map((c) => (
          <MenuItem key={c} role="menuitemradio" aria-checked={choice === c} onClick={() => { setChoice(c); setAnchor(null) }}>
            <ListItemIcon>{choice === c ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); onSignOut() }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  )
}
