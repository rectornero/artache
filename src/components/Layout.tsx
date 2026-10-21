import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isDemo } from '../lib/mode'
import { Icon, type IconName } from './Icon'

// Sessions stays off the phone tab bar to keep it at five; Overview links to it.
const nav: { to: string; label: string; icon: IconName; tab?: false }[] = [
  { to: '/', label: 'Overview', icon: 'home' },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/briefs', label: 'Briefs', icon: 'brief' },
  { to: '/sessions', label: 'Sessions', icon: 'chat', tab: false },
  { to: '/studio', label: 'Studio', icon: 'star' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function Logo({ className = '' }: { className?: string }) {
  return (
    <picture className={`logo ${className}`}>
      <source srcSet="/logo-dark.png" media="(prefers-color-scheme: dark)" />
      <img src="/logo-sm.png" alt="Artache" />
    </picture>
  )
}

export function Layout() {
  const { name, avatar, signOut } = useAuth()
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-logo" aria-label="Artache home">
          <Logo />
        </NavLink>
        <nav className="sidebar-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            {avatar ? <img src={avatar} alt="" className="avatar" /> : <span className="avatar">{name.slice(0, 1)}</span>}
            <span className="me-name">{name}</span>
            {!isDemo && (
              <button className="icon-btn" onClick={signOut} title="Sign out">
                <Icon name="logout" size={16} />
              </button>
            )}
          </div>
          <p className="tagline">With AI. By People.</p>
        </div>
      </aside>

      <header className="topbar">
        <NavLink to="/" aria-label="Artache home">
          <Logo className="logo-top" />
        </NavLink>
        {avatar ? <img src={avatar} alt="" className="avatar" /> : <span className="avatar">{name.slice(0, 1)}</span>}
      </header>

      <main className="main">
        {isDemo && (
          <div className="demo-banner">
            Preview mode with sample data. Your real projects appear once the database and GitHub sign-in are set up.
          </div>
        )}
        <Outlet />
      </main>

      <nav className="tabbar">
        {nav.filter((n) => n.tab !== false).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="tab">
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
