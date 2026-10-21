import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteBrief, saveBrief } from '../lib/api'
import { timeAgo } from '../lib/hooks'
import type { Brief, BriefPriority, BriefStatus, Project } from '../lib/types'
import { Icon } from './Icon'
import { Thread } from './Thread'
import { Modal, Status } from './ui'

const statuses: BriefStatus[] = ['open', 'accepted', 'in_progress', 'blocked', 'done', 'dropped']
const priorities: BriefPriority[] = ['urgent', 'high', 'normal', 'low']

function due(day: string | null) {
  if (!day) return null
  const days = Math.round((new Date(`${day}T23:59:59`).getTime() - Date.now()) / 86_400_000)
  const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return { label: days < 0 ? `overdue, ${label}` : days === 0 ? 'due today' : `due ${label}`, late: days < 0 }
}

export function BriefList({ briefs, showProject = true, onChange }: { briefs: Brief[]; showProject?: boolean; onChange: () => void }) {
  return (
    <ul className="briefs">
      {briefs.map((b) => <BriefCard key={b.id} b={b} showProject={showProject} onChange={onChange} />)}
    </ul>
  )
}

function BriefCard({ b, showProject, onChange }: { b: Brief; showProject: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const d = due(b.due_on)
  const closed = b.status === 'done' || b.status === 'dropped'
  const lastFromProject = [...b.replies].reverse().find((r) => r.source !== 'web')

  async function setStatus(status: BriefStatus) {
    await saveBrief({ id: b.id, status })
    onChange()
  }

  return (
    <li className={`brief ${closed ? 'is-closed' : ''}`} style={{ ['--accent' as string]: b.project_color ?? 'var(--ink)' }}>
      <div className="brief-top">
        {(b.priority === 'urgent' || b.priority === 'high') && <span className={`prio prio-${b.priority}`}>{b.priority}</span>}
        {showProject && (
          <Link to={`/projects/${b.project_slug}`} className="session-project brief-project">
            <span className="swatch-dot" /> {b.project_name}
          </Link>
        )}
        {d && !closed && <span className={`brief-due ${d.late ? 'late' : ''}`}>{d.label}</span>}
        <span className="push" />
        <Status value={b.status} />
      </div>
      <button className="brief-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        {b.title}
      </button>
      {b.body && <p className={`brief-body ${open ? 'is-open' : ''}`}>{b.body}</p>}
      {!open && lastFromProject && (
        <p className="brief-last">
          <Icon name="star" size={10} /> {lastFromProject.body}
        </p>
      )}
      {(b.updates.length > 0 || b.result_url) && (
        <ul className="brief-updates">
          {b.result_url && (
            <li>
              <a href={b.result_url} target="_blank" rel="noreferrer" className="link">Result <Icon name="external" size={11} /></a>
            </li>
          )}
          {b.updates.map((u) => (
            <li key={u.id}>
              <span className={`kind kind-${u.kind}`}>{u.kind}</span>
              {u.url ? <a href={u.url} target="_blank" rel="noreferrer">{u.title}</a> : <span>{u.title}</span>}
              <span className="muted">{timeAgo(u.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <>
          <Thread replies={b.replies} target={{ brief_id: b.id }} onChange={onChange} />
          <div className="brief-controls">
            <label>
              Status
              <select value={b.status} onChange={(e) => setStatus(e.target.value as BriefStatus)}>
                {statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </label>
            <button
              className="feed-delete brief-delete"
              onClick={() => window.confirm(`Delete "${b.title}"?`) && deleteBrief(b.id).then(onChange)}
            >
              Delete
            </button>
          </div>
        </>
      )}
      <button className="brief-more" onClick={() => setOpen(!open)}>
        {open ? 'Less' : b.replies.length ? `Conversation (${b.replies.length})` : 'Details'}
      </button>
    </li>
  )
}

export function BriefComposer({ projects, projectId, onClose, onSaved }: {
  projects: Project[]
  projectId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    project_id: projectId ?? projects[0]?.id ?? '', title: '', body: '', priority: 'normal' as BriefPriority, due_on: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await saveBrief({ ...form, due_on: form.due_on || null }).finally(() => setSaving(false))
    onSaved()
    onClose()
  }

  return (
    <Modal title="New brief" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!projectId && (
          <label>
            Project
            <select required value={form.project_id} onChange={set('project_id')}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label>
          Brief
          <input required autoFocus value={form.title} onChange={set('title')} placeholder="What should the project do?" />
        </label>
        <label>
          Details
          <textarea rows={5} value={form.body} onChange={set('body')} placeholder="Context, what done looks like, constraints." />
        </label>
        <div className="form-row">
          <label>
            Priority
            <select value={form.priority} onChange={set('priority')}>
              {priorities.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Due
            <input type="date" value={form.due_on} onChange={set('due_on')} />
          </label>
        </div>
        <p className="muted small">The project's Claude picks this up from its inbox at the start of its next session.</p>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || !form.project_id}>Send brief</button>
        </div>
      </form>
    </Modal>
  )
}
