import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Loading, Modal, PageHeader, Status } from '../components/ui'
import { listProjects, listSessions, saveProject } from '../lib/api'
import { timeAgo, useAsync } from '../lib/hooks'
import type { ProjectStatus } from '../lib/types'

const filters: (ProjectStatus | 'all')[] = ['all', 'active', 'idea', 'paused', 'shipped', 'archived']

export function Projects() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([listProjects(), listSessions({ limit: 1000 })]))
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')
  const [creating, setCreating] = useState(false)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of data?.[1] ?? []) m.set(s.project_id ?? '', (m.get(s.project_id ?? '') ?? 0) + 1)
    return m
  }, [data])

  if (error) return <ErrorNote message={error} />
  if (loading || !data) return <Loading />
  const shown = data[0].filter(
    (p) => (filter === 'all' || p.status === filter) && `${p.name} ${p.repo_full_name ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div className="page">
      <PageHeader
        kicker="Everything you build"
        title="Projects"
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New project
          </button>
        }
      />
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" />
        </label>
        <div className="chips">
          {filters.map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty>No projects match. Run the sync command on a computer, or create one by hand.</Empty>
      ) : (
        <ul className="project-grid">
          {shown.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.slug}`} className="project-card" style={{ ['--accent' as string]: p.color ?? 'var(--ink)' }}>
                <div className="project-card-top">
                  <h3>{p.name}</h3>
                  <Status value={p.status} />
                </div>
                <p className="project-desc">{p.description ?? p.local_paths[0] ?? 'No description yet'}</p>
                <footer className="project-foot">
                  {p.repo_full_name && (
                    <span className="meta-item">
                      <Icon name="github" size={13} /> {p.repo_full_name}
                    </span>
                  )}
                  <span className="meta-item">{counts.get(p.id) ?? 0} sessions</span>
                  <span className="meta-item push">{timeAgo(p.last_activity_at)}</span>
                </footer>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewProject onClose={() => setCreating(false)} onSaved={reload} />}
    </div>
  )
}

const palette = ['#13224b', '#d7182a', '#3b5bdb', '#e8590c', '#2b8a3e', '#862e9c', '#0b7285']

function NewProject({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repo, setRepo] = useState('')
  const [color, setColor] = useState(palette[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const p = await saveProject({ name, description: description || null, repo_full_name: repo || null, color })
      onSaved()
      nav(`/projects/${p.slug}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Description
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          GitHub repository
          <input placeholder="owner/repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </label>
        <fieldset className="swatches">
          <legend>Color</legend>
          {palette.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch-btn ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </fieldset>
        {err && <ErrorNote message={err} />}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name}>Create</button>
        </div>
      </form>
    </Modal>
  )
}
