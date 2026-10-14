import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setToken, setUnauthorizedHandler } from '../api/client'
import type { TokenResponse, User } from '../api/types'
import { AuthContext, type AuthState } from './context'

const STORAGE_KEY = 'pm.auth'

interface Saved { token: string; expiresAt: number; user: User }

// Browser storage can be missing or blocked (private windows), so every use is guarded.
function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null
    return saved && saved.expiresAt * 1000 > Date.now() ? saved : null
  } catch {
    return null
  }
}

function write(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* the session simply will not survive a page reload */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = readSaved()
    setToken(saved?.token ?? null)
    return saved?.user ?? null
  })

  const logout = useCallback(() => {
    setToken(null)
    write(null)
    setUser(null)
  }, [])

  const accept = useCallback((response: TokenResponse) => {
    setToken(response.accessToken)
    write({ token: response.accessToken, expiresAt: response.expiresAt, user: response.user })
    setUser(response.user)
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await api.post<TokenResponse>('/auth/login', { username: username.trim(), password })
      accept(response)
      return response.user
    },
    [accept],
  )

  useEffect(() => setUnauthorizedHandler(logout), [logout])

  const value = useMemo<AuthState>(() => ({ user, login, accept, logout }), [user, login, accept, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
