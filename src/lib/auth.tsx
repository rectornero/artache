import { createContext, useContext, type ReactNode } from 'react'
import { isDemo, me } from './mode'

type AuthState = {
  signedIn: boolean
  name: string
  login: string | null
  avatar: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// The session is read once at startup (see detectMode); signing in or out
// reloads the page, so this never changes while the app is running.
export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthState = {
    signedIn: isDemo || Boolean(me),
    name: isDemo ? 'Nero' : (me?.name ?? me?.login ?? ''),
    login: me?.login ?? null,
    avatar: me?.avatar_url ?? null,
    signOut: async () => {
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.href = '/'
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
