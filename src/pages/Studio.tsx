import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Loading, Modal, PageHeader } from '../components/ui'
import { deleteWork, listProjects, listWorks, saveWork } from '../lib/api'
import { timeAgo, useAsync } from '../lib/hooks'
import type { Project, Work, WorkKind, WorkStatus } from '../lib/types'

const kinds: { kind: WorkKind; label: string; hint: string }[] = [
  { kind: 'platform', label: 'Platforms', hint: 'Products and sites the studio runs' },
  { kind: 'article', label: 'Articles', hint: 'Writing, from idea to published' },
  { kind: 'work', label: 'Works', hint: 'Everything else the studio makes' },
]

const columns: WorkStatus[] = ['idea', 'drafting', 'in_progress', 'review', 'published']

export function Studio() {
  const [kind, setKind] = useState<WorkKind>('platform')
  const [editing, setEditing] = useState<Partial<Work> | null>(null)
  const { data, error, loading, reload } = useAsync(() => Promise.all([listWorks(kind), listProjects()]), [kind])
  const current = kinds.find((k) => k.kind === kind)!

  return (
    <div className="page">
      <PageHeader
        kicker="Execution first"
        title="Studio"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ kind })}>
            <Icon name="plus" size={16} /> New {current.label.slice(0, -1).toLowerCase()}
          </button>
        }
      />
      <div className="segmented" role="tablist">
        {kinds.map((k) => (
          <button key={k.kind} role="tab" aria-selected={k.kind === kind} className={k.kind === kind ? 'on' : ''} onClick={() => setKind(k.kind)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="muted">{current.hint}</p>

      {error ? (
        <ErrorNote message={error} />
      ) : loading || !data ? (
        <Loading />
      ) : data[0].length === 0 ? (
        <Empty>Nothing here yet. Start with an idea.</Empty>
      ) : (
        <div className="board">
          {columns.map((col) => {
            const items = data[0].filter((w) => w.status === col)
            return (
              <section key={col} className={`column ${items.length ? "" : "is-empty"}`}>
                <h3 className="column-head">
                  {col.replace('_', ' ')} <span className="count">{items.length}</span>
                </h3>
                {items.map((w) => (
                  <WorkCard key={w.id} w={w} project={data[1].find((p) => p.id === w.project_id)} onOpen={() => setEditing(w)} />
                ))}
              </section>
            )
          })}
        </div>
      )}

      {editing && data && (
        <WorkEditor
          work={editing}
          projects={data[1]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function WorkCard({ w, project, onOpen }: { w: Work; project?: Project; onOpen: () => void }) {
  return (
    <button className="work-card" onClick={onOpen}>
      <span className="work-title">{w.title}</span>
      {w.summary && <span className="work-summary">{w.summary}</span>}
      <span className="work-meta">
        {project && (
          <span className="tag" style={{ ['--accent' as string]: project.color ?? 'var(--ink)' }}>
            {project.name}
          </span>
        )}
        {w.tags.map((t) => <span key={t} className="tag subtle">#{t}</span>)}
        <span className="push">{timeAgo(w.updated_at)}</span>
      </span>
    </button>
  )
}

function WorkEditor({ work, projects, onClose, onSaved }: { work: Partial<Work>; projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [w, setW] = useState<Partial<Work>>({ status: 'idea', tags: [], ...work })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Work>(k: K, v: Work[K]) => setW((x) => ({ ...x, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveWork({
        ...w,
        kind: w.kind!,
        title: w.title!,
        published_at: w.status === 'published' ? (w.published_at ?? new Date().toISOString()) : null,
      })
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  async function remove() {
    if (!w.id) return
    await deleteWork(w.id)
    onSaved()
  }

  return (
    <Modal title={w.id ? 'Edit' : 'New'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input required autoFocus value={w.title ?? ''} onChange={(e) => set('title', e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            Status
            <select value={w.status} onChange={(e) => set('status', e.target.value as WorkStatus)}>
              {[...columns, 'archived'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            Project
            <select value={w.project_id ?? ''} onChange={(e) => set('project_id', e.target.value || null)}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <label>
          Link
          <input type="url" placeholder="https://" value={w.url ?? ''} onChange={(e) => set('url', e.target.value || null)} />
        </label>
        <label>
          Summary
          <textarea rows={2} value={w.summary ?? ''} onChange={(e) => set('summary', e.target.value || null)} />
        </label>
        {w.kind === 'article' && (
          <label>
            Draft
            <textarea rows={8} className="mono" value={w.body ?? ''} onChange={(e) => set('body', e.target.value || null)} placeholder="Write in Markdown" />
          </label>
        )}
        <label>
          Tags
          <input
            placeholder="comma, separated"
            value={(w.tags ?? []).join(', ')}
            onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
          />
        </label>
        {err && <ErrorNote message={err} />}
        <div className="form-actions">
          {w.id && <button type="button" className="btn btn-danger" onClick={remove}>Delete</button>}
          <button type="button" className="btn push" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !w.title}>Save</button>
        </div>
      </form>
    </Modal>
  )
}
