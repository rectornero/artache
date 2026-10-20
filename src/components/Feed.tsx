import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createPost, deletePost } from '../lib/api'
import { timeAgo } from '../lib/hooks'
import type { Post, PostKind, Project } from '../lib/types'
import { Icon } from './Icon'
import { Modal } from './ui'

const sourceLabel = { claude: 'Claude', cli: 'Script', web: 'You' } as const

export function Feed({ posts, showProject = true, onChange }: { posts: Post[]; showProject?: boolean; onChange: () => void }) {
  return (
    <ul className="feed">
      {posts.map((p) => (
        <li key={p.id} className={`feed-item kind-${p.kind}`}>
          <div className="feed-top">
            <span className={`kind kind-${p.kind}`}>{p.kind}</span>
            {showProject && p.project_slug && (
              <Link to={`/projects/${p.project_slug}`} className="session-project">{p.project_name ?? p.project_slug}</Link>
            )}
            <time className="session-time push" dateTime={p.created_at}>{timeAgo(p.created_at)}</time>
          </div>
          <p className="feed-title">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.title} <Icon name="external" size={12} />
              </a>
            ) : (
              p.title
            )}
          </p>
          {p.body && <p className="feed-body">{p.body}</p>}
          <p className="feed-meta">
            {p.source === 'claude' && <Icon name="star" size={11} />}
            <span>{p.author_label ?? sourceLabel[p.source]}</span>
            <button
              className="feed-delete"
              onClick={() => confirmDelete(p) && deletePost(p.id).then(onChange)}
              aria-label="Delete update"
            >
              Delete
            </button>
          </p>
        </li>
      ))}
    </ul>
  )
}

const confirmDelete = (p: Post) => window.confirm(`Delete "${p.title}"?`)

const kinds: PostKind[] = ['update', 'milestone', 'release', 'note', 'question']

export function PostComposer({ projects, projectId, onClose, onSaved }: {
  projects: Project[]
  projectId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ project_id: projectId ?? '', kind: 'update' as PostKind, title: '', body: '', url: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await createPost({ ...form, project_id: form.project_id || null }).finally(() => setSaving(false))
    onSaved()
    onClose()
  }

  return (
    <Modal title="New update" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input required autoFocus value={form.title} onChange={set('title')} placeholder="What happened?" />
        </label>
        <div className="form-row">
          <label>
            Kind
            <select value={form.kind} onChange={set('kind')}>
              {kinds.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          {!projectId && (
            <label>
              Project
              <select value={form.project_id} onChange={set('project_id')}>
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <label>
          Details
          <textarea rows={4} value={form.body} onChange={set('body')} />
        </label>
        <label>
          Link
          <input type="url" value={form.url} onChange={set('url')} placeholder="https://" />
        </label>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>Post</button>
        </div>
      </form>
    </Modal>
  )
}
