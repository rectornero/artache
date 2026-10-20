import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Feed, PostComposer } from '../components/Feed'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Loading, SessionRow, Status } from '../components/ui'
import { getProject, listPosts, listSessions, listWorks, saveProject } from '../lib/api'
import { timeAgo, useAsync } from '../lib/hooks'
import type { ProjectStatus } from '../lib/types'

const statuses: ProjectStatus[] = ['idea', 'active', 'paused', 'shipped', 'archived']

export function ProjectDetail() {
  const { slug = '' } = useParams()
  const [composing, setComposing] = useState(false)
  const { data, error, loading, reload } = useAsync(async () => {
    const project = await getProject(slug)
    if (!project) return null
    const [sessions, works, posts] = await Promise.all([
      listSessions({ projectId: project.id, limit: 200 }),
      listWorks(),
      listPosts({ projectId: project.id, limit: 20 }),
    ])
    return { project, sessions, posts, works: works.filter((w) => w.project_id === project.id) }
  }, [slug])

  if (error) return <ErrorNote message={error} />
  if (loading) return <Loading />
  if (!data) return <Empty>Project not found. <Link to="/projects">Back to projects</Link></Empty>
  const { project: p, sessions, works, posts } = data
  const messages = sessions.reduce((n, s) => n + s.message_count, 0)

  async function setStatus(status: ProjectStatus) {
    await saveProject({ ...p, status })
    reload()
  }

  return (
    <div className="page" style={{ ['--accent' as string]: p.color ?? 'var(--ink)' }}>
      <Link to="/projects" className="back">← Projects</Link>
      <header className="project-hero">
        <span className="project-mark">{p.name.slice(0, 1)}</span>
        <div>
          <h1>{p.name}</h1>
          {p.description && <p className="hero-sub">{p.description}</p>}
          <div className="project-links">
            {p.repo_full_name && (
              <a href={`https://github.com/${p.repo_full_name}`} target="_blank" rel="noreferrer" className="pill">
                <Icon name="github" size={14} /> {p.repo_full_name} <Icon name="external" size={12} />
              </a>
            )}
            {p.local_paths.map((path) => (
              <span key={path} className="pill mono">{path}</span>
            ))}
          </div>
        </div>
        <select className="status-select" value={p.status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} aria-label="Status">
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </header>

      <section className="stats">
        <div className="stat"><span className="stat-value">{sessions.length}</span><span className="stat-label">Sessions</span></div>
        <div className="stat"><span className="stat-value">{messages.toLocaleString()}</span><span className="stat-label">Messages</span></div>
        <div className="stat"><span className="stat-value">{works.length}</span><span className="stat-label">Works</span></div>
        <div className="stat"><span className="stat-value small">{timeAgo(p.last_activity_at)}</span><span className="stat-label">Last activity</span></div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Updates</h2>
          <button className="link link-btn" onClick={() => setComposing(true)}>New update</button>
        </header>
        {posts.length ? (
          <Feed posts={posts} showProject={false} onChange={reload} />
        ) : (
          <Empty>No updates yet. Claude Code posts here when it finishes meaningful work on this project.</Empty>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <header className="panel-head"><h2>Sessions</h2></header>
          {sessions.length ? (
            <ul className="session-list">
              {sessions.map((s) => <SessionRow key={s.id} s={s} />)}
            </ul>
          ) : (
            <Empty>No Claude Code sessions synced for this project yet.</Empty>
          )}
        </section>
        <section className="panel">
          <header className="panel-head">
            <h2>Works</h2>
            <Link to="/studio" className="link">Studio</Link>
          </header>
          {works.length ? (
            <ul className="mini-works">
              {works.map((w) => (
                <li key={w.id}>
                  <span className="mini-name">{w.title}</span>
                  <Status value={w.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Link platforms, articles and works to this project from the Studio.</Empty>
          )}
        </section>
      </div>
      {composing && (
        <PostComposer projects={[p]} projectId={p.id} onClose={() => setComposing(false)} onSaved={reload} />
      )}
    </div>
  )
}
