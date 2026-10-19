import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { shortModel, timeAgo } from '../lib/hooks'
import type { Project, Session } from '../lib/types'
import { Icon } from './Icon'

export function PageHeader({ title, kicker, actions }: { title: string; kicker?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value.replace('_', ' ')}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Loading() {
  return (
    <div className="loading" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="error-note">Something went wrong: {message}</div>
}

export function SessionRow({ s, project }: { s: Session; project?: Project }) {
  return (
    <li className="session-row">
      <span className="dot" style={{ background: project?.color ?? 'var(--muted)' }} />
      <div className="session-main">
        <p className="session-title">{s.title ?? 'Untitled session'}</p>
        <p className="session-meta">
          {project && (
            <Link to={`/projects/${project.slug}`} className="session-project">
              {project.name}
            </Link>
          )}
          {s.git_branch && s.git_branch !== 'HEAD' && (
            <span className="meta-item">
              <Icon name="branch" size={13} />
              {s.git_branch}
            </span>
          )}
          <span className="meta-item">{s.message_count} messages</span>
          {s.model && <span className="meta-item hide-sm">{shortModel(s.model)}</span>}
        </p>
      </div>
      <time className="session-time" dateTime={s.last_activity_at ?? undefined}>
        {timeAgo(s.last_activity_at)}
      </time>
    </li>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
