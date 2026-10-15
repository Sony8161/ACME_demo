import { createContext, useContext } from 'react'
import type { Mode } from './theme'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface ThemeModeValue {
  /** What the person picked. */
  choice: ThemeChoice
  setChoice: (choice: ThemeChoice) => void
  /** What is shown: the choice, or the computer's setting when the choice is System. */
  mode: Mode
}

export const ThemeModeContext = createContext<ThemeModeValue>({ choice: 'system', setChoice: () => undefined, mode: 'light' })

export const useThemeMode = () => useContext(ThemeModeContext)
