import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Loading, PageHeader, SessionRow } from '../components/ui'
import { listMachines, listProjects, listSessions } from '../lib/api'
import { useAsync } from '../lib/hooks'

export function Sessions() {
  const { data, error, loading } = useAsync(() => Promise.all([listSessions({ limit: 500 }), listProjects(), listMachines()]))
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const [machine, setMachine] = useState('')

  if (error) return <ErrorNote message={error} />
  if (loading || !data) return <Loading />
  const [sessions, projects, machines] = data
  const byId = new Map(projects.map((p) => [p.id, p]))
  const shown = sessions.filter(
    (s) =>
      (!project || s.project_id === project) &&
      (!machine || s.machine_id === machine) &&
      `${s.title ?? ''} ${s.summary ?? ''} ${s.git_branch ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  )

  // Group by day for a calmer timeline.
  const groups = new Map<string, typeof shown>()
  for (const s of shown) {
    const day = s.last_activity_at
      ? new Date(s.last_activity_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
      : 'Undated'
    groups.set(day, [...(groups.get(day) ?? []), s])
  }

  return (
    <div className="page">
      <PageHeader kicker="Claude Code, everywhere" title="Sessions" />
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and branches" />
        </label>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={machine} onChange={(e) => setMachine(e.target.value)} aria-label="Machine">
          <option value="">All machines</option>
          {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {shown.length === 0 ? (
        <Empty>No sessions yet. Run the sync command from Settings on any computer with Claude Code.</Empty>
      ) : (
        [...groups].map(([day, list]) => (
          <section key={day} className="day-group">
            <h2 className="day-label">{day}</h2>
            <ul className="session-list panel">
              {list.map((s) => <SessionRow key={s.id} s={s} project={byId.get(s.project_id ?? '')} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
