export type Level = 'free' | 'light' | 'medium' | 'full'

// Teal steps. On a light page more booked is darker; on a dark page it is brighter. Every pair is contrast-checked in the tests,
// and the hours are always written in the cell too.
export function heatColors(mode: 'light' | 'dark'): Record<Level, { bg: string; fg: string; label: string }> {
  return mode === 'dark'
    ? {
        free: { bg: 'transparent', fg: 'text.secondary', label: 'Free' },
        light: { bg: '#134e4a', fg: '#ccfbf1', label: 'Up to half booked' },
        medium: { bg: '#0f766e', fg: '#ffffff', label: 'Mostly booked' },
        full: { bg: '#5eead4', fg: '#052e2b', label: 'Full week (40 h)' },
      }
    : {
        free: { bg: 'transparent', fg: 'text.secondary', label: 'Free' },
        light: { bg: '#ccfbf1', fg: '#134e4a', label: 'Up to half booked' },
        medium: { bg: '#5eead4', fg: '#134e4a', label: 'Mostly booked' },
        full: { bg: '#0f766e', fg: '#ffffff', label: 'Full week (40 h)' },
      }
}
