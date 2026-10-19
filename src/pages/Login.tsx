import { Icon } from '../components/Icon'
import { Logo } from '../components/Layout'

export function Login() {
  const error = new URLSearchParams(window.location.search).get('error')
  return (
    <div className="login">
      <div className="login-card">
        <Logo className="logo-hero" />
        <p className="login-lede">Your projects, sessions and works, in one studio.</p>
        <a className="btn btn-primary btn-wide" href="/api/auth/login">
          <Icon name="github" /> Continue with GitHub
        </a>
        {error && <p className="error-note">{error}</p>}
      </div>
    </div>
  )
}
