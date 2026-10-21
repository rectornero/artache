import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefComposer, BriefList } from '../components/Briefs'
import { Feed, PostComposer } from '../components/Feed'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Loading, SessionRow, Status } from '../components/ui'
import { listBriefs, listMachines, listPosts, listProjects, listSessions, listWorks } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo, useAsync } from '../lib/hooks'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Overview() {
  const { name } = useAuth()
  const [composing, setComposing] = useState(false)
  const [briefing, setBriefing] = useState(false)
  const { data, error, loading, reload } = useAsync(() =>
    Promise.all([listProjects(), listSessions({ limit: 8 }), listMachines(), listWorks(), listPosts({ limit: 6 }), listBriefs({ active: true })]),
  )
  if (error) return <ErrorNote message={error} />
  if (loading || !data) return <Loading />
  const [projects, sessions, machines, works, posts, briefs] = data

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const recentSessions = sessions.filter((s) => (s.last_activity_at ?? '') > weekAgo).length
  const active = projects.filter((p) => p.status === 'active')
  const inFlight = works.filter((w) => !['published', 'archived'].includes(w.status))
  const pinned = projects.filter((p) => p.pinned).concat(projects.filter((p) => !p.pinned)).slice(0, 4)
  const byId = new Map(projects.map((p) => [p.id, p]))
  const lastSync = machines.map((m) => m.last_seen_at ?? '').sort().pop() ?? null

  return (
    <div className="page">
      <section className="hero">
        <p className="kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>
          {greeting()}, <em>{name}</em>.
        </h1>
        <p className="hero-sub">
          {active.length} active projects, {inFlight.length} works in motion. Last sync {timeAgo(lastSync)}.
        </p>
      </section>

      <section className="stats">
        <Stat label="Active projects" value={active.length} to="/projects" />
        <Stat label="Sessions this week" value={recentSessions} to="/sessions" />
        <Stat label="Works in progress" value={inFlight.length} to="/studio" />
        <Stat label="Synced machines" value={machines.length} to="/settings" />
      </section>

      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <header className="panel-head">
              <h2>Updates</h2>
              <button className="link link-btn" onClick={() => setComposing(true)}>New update</button>
            </header>
            {posts.length ? (
              <Feed posts={posts} onChange={reload} />
            ) : (
              <Empty>
                Nothing posted yet. Connect Claude Code in <Link to="/settings" className="link">Settings</Link> and
                your projects will post their progress here.
              </Empty>
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Recent sessions</h2>
              <Link to="/sessions" className="link">See all</Link>
            </header>
            <ul className="session-list">
              {sessions.slice(0, 6).map((s) => (
                <SessionRow key={s.id} s={s} project={byId.get(s.project_id ?? '')} />
              ))}
            </ul>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <header className="panel-head">
              <h2>Briefs</h2>
              <button className="link link-btn" onClick={() => setBriefing(true)}>New brief</button>
            </header>
            {briefs.length ? (
              <>
                <BriefList briefs={briefs.slice(0, 4)} onChange={reload} />
                {briefs.length > 4 && <Link to="/briefs" className="link">All {briefs.length} active briefs</Link>}
              </>
            ) : (
              <Empty>No open briefs. Hand a project some work and its Claude picks it up next session.</Empty>
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Projects</h2>
              <Link to="/projects" className="link">All projects</Link>
            </header>
            <ul className="mini-projects">
              {pinned.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.slug}`}>
                    <span className="swatch" style={{ background: p.color ?? 'var(--ink)' }} />
                    <span className="mini-name">{p.name}</span>
                    <span className="mini-time">{timeAgo(p.last_activity_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Studio</h2>
              <Link to="/studio" className="link">Open studio</Link>
            </header>
            <ul className="mini-works">
              {inFlight.slice(0, 4).map((w) => (
                <li key={w.id}>
                  <Icon name={w.kind === 'article' ? 'chat' : w.kind === 'platform' ? 'laptop' : 'star'} size={15} />
                  <span className="mini-name">{w.title}</span>
                  <Status value={w.status} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {briefing && <BriefComposer projects={projects} onClose={() => setBriefing(false)} onSaved={reload} />}
      {composing && <PostComposer projects={projects} onClose={() => setComposing(false)} onSaved={reload} />}
    </div>
  )
}

function Stat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </Link>
  )
}
