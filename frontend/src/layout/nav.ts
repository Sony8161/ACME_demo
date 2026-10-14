import type { Role } from '../api/types'

export interface NavItem {
  label: string
  to: string
  icon: 'dashboard' | 'projects' | 'people' | 'archive' | 'history' | 'work'
}

/** What each role sees along the top (or bottom) bar. The server enforces the same rules; this only decides what to show. */
export function navFor(role: Role): NavItem[] {
  if (role === 'employee') return [{ label: 'My work', to: '/my-work', icon: 'work' }]
  return [
    { label: 'Dashboard', to: '/dashboard', icon: 'dashboard' },
    { label: 'Projects', to: '/projects', icon: 'projects' },
    { label: 'People', to: '/people', icon: 'people' },
  ]
}

/** The rarely needed pages, kept under one "More" menu so the bar stays short. Only admins have any. */
export function moreFor(role: Role): NavItem[] {
  return role === 'admin'
    ? [{ label: 'History', to: '/history', icon: 'history' }, { label: 'Archive', to: '/archive', icon: 'archive' }]
    : []
}
