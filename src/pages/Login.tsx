import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Layout'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function github() {
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin, scopes: 'read:user repo' },
    })
    if (error) setErr(error.message)
  }

  async function magic(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="login">
      <div className="login-card">
        <Logo className="logo-hero" />
        <p className="login-lede">Your projects, sessions and works, in one studio.</p>
        <button className="btn btn-primary btn-wide" onClick={github}>
          <Icon name="github" /> Continue with GitHub
        </button>
        <div className="or"><span>or</span></div>
        {sent ? (
          <p className="muted center">Check {email} for a sign-in link.</p>
        ) : (
          <form onSubmit={magic} className="login-form">
            <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-wide">
              <Icon name="mail" /> Email me a link
            </button>
          </form>
        )}
        {err && <p className="error-note">{err}</p>}
      </div>
    </div>
  )
}
