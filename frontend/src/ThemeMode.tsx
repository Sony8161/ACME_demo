import { useMemo, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import { buildTheme, type Mode } from './theme'
import { ThemeModeContext, type ThemeChoice } from './themeMode'

const KEY = 'pm.theme'
const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY)
    if (CHOICES.includes(stored as ThemeChoice)) return stored as ThemeChoice
  } catch {
    // storage blocked: follow the computer
  }
  return 'system'
}

/** Light, dark, or whatever the computer is set to. The choice is kept in this browser only. */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const mode: Mode = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice
  const theme = useMemo(() => buildTheme(mode), [mode])

  const setChoice = (next: ThemeChoice) => {
    setChoiceState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  }

  return (
    <ThemeModeContext.Provider value={{ choice, setChoice, mode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  )
}
