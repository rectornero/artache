import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Without credentials the app runs in demo mode on sample data, so the UI can
// be previewed before the backend exists.
export const isDemo = !url || !key
export const supabaseUrl = url ?? ''

export const supabase = isDemo
  ? null
  : createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } })
