import type { Session as AuthSession } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isDemo, supabase } from './supabase'

type AuthState = {
  ready: boolean
  session: AuthSession | null
  name: string
  avatar: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [ready, setReady] = useState(isDemo)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const meta = session?.user.user_metadata ?? {}
  const value: AuthState = {
    ready,
    session,
    name: isDemo ? 'Nero' : (meta.full_name ?? meta.name ?? session?.user.email?.split('@')[0] ?? ''),
    avatar: meta.avatar_url ?? null,
    signOut: async () => {
      await supabase?.auth.signOut()
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
