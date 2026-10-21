import type { Brief, Machine, Post, Project, Session, SyncToken, Work } from './types'

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

export const demoMachines: Machine[] = [
  { id: 'm1', name: 'studio-mac', platform: 'darwin', last_seen_at: ago(0.3) },
  { id: 'm2', name: 'travel-laptop', platform: 'win32', last_seen_at: ago(30) },
]

export const demoProjects: Project[] = [
  { id: 'p1', name: 'Artache', slug: 'artache', description: 'The studio hub: projects, sessions and works in one place.', repo_full_name: 'rectornero/artache', local_paths: ['~/code/artache'], status: 'active', color: '#d7182a', pinned: true, last_activity_at: ago(0.3), created_at: ago(2) },
  { id: 'p2', name: 'Overgame', slug: 'overgame', description: 'Game platform.', repo_full_name: 'rectornero/overgame', local_paths: ['~/code/overgame'], status: 'active', color: '#13224b', pinned: true, last_activity_at: ago(1), created_at: ago(160) },
  { id: 'p3', name: 'Novaula', slug: 'novaula', description: 'Learning platform.', repo_full_name: 'rectornero/novaula', local_paths: ['~/code/novaula'], status: 'active', color: '#3b5bdb', pinned: false, last_activity_at: ago(5), created_at: ago(200) },
  { id: 'p4', name: 'Deadend', slug: 'deadend', description: null, repo_full_name: 'rectornero/deadend', local_paths: ['~/code/deadend'], status: 'active', color: '#e8590c', pinned: false, last_activity_at: ago(4), created_at: ago(90) },
  { id: 'p5', name: 'Scuola', slug: 'scuola', description: 'School management experiment.', repo_full_name: null, local_paths: ['~/code/scuola'], status: 'paused', color: '#2b8a3e', pinned: false, last_activity_at: ago(170), created_at: ago(170) },
]

const titles: [string, string, number, string][] = [
  ['p1', 'Scaffold Artache app on Netlify', 0.3, 'main'],
  ['p2', 'Fix leaderboard RLS policy', 1, 'fix/leaderboard-rls'],
  ['p4', 'Add level editor autosave', 4, 'feat/autosave'],
  ['p3', 'Course page redesign', 5, 'design/course-page'],
  ['p2', 'Matchmaking edge function', 22, 'feat/matchmaking'],
  ['p3', 'Migrate auth to GitHub provider', 26, 'main'],
  ['p4', 'Investigate flaky physics test', 49, 'main'],
  ['p5', 'Initial schema for classes and grades', 170, 'main'],
]

export const demoSessions: Session[] = titles.map(([project_id, title, h, branch], i) => ({
  id: `s${i}`,
  project_id,
  machine_id: i % 3 === 2 ? 'm2' : 'm1',
  external_id: `demo-${i}`,
  source: 'cli',
  title,
  summary: null,
  cwd: demoProjects.find((p) => p.id === project_id)!.local_paths[0],
  git_branch: branch,
  model: 'claude-opus-5-5',
  message_count: 12 + ((i * 37) % 140),
  started_at: ago(h + 1.5),
  last_activity_at: ago(h),
}))

export const demoWorks: Work[] = [
  { id: 'w1', project_id: 'p2', kind: 'platform', title: 'Overgame', status: 'published', url: 'https://overgame.example', summary: 'Live game platform.', body: null, tags: ['games'], published_at: ago(100), updated_at: ago(3) },
  { id: 'w2', project_id: 'p3', kind: 'platform', title: 'Novaula', status: 'in_progress', url: null, summary: 'Learning platform, beta soon.', body: null, tags: ['education'], published_at: null, updated_at: ago(8) },
  { id: 'w3', project_id: null, kind: 'article', title: 'Execution first: building a studio with AI', status: 'drafting', url: null, summary: 'Manifesto for the Artache way of working.', body: null, tags: ['manifesto'], published_at: null, updated_at: ago(2) },
  { id: 'w4', project_id: null, kind: 'article', title: 'With AI. By People.', status: 'idea', url: null, summary: 'Why the human stays the author.', body: null, tags: [], published_at: null, updated_at: ago(20) },
  { id: 'w5', project_id: 'p4', kind: 'work', title: 'Deadend trailer', status: 'review', url: null, summary: null, body: null, tags: ['video'], published_at: null, updated_at: ago(12) },
  { id: 'w6', project_id: null, kind: 'work', title: 'Artache brand kit', status: 'in_progress', url: null, summary: 'Logo, palette and type.', body: null, tags: ['brand'], published_at: null, updated_at: ago(1) },
]

export const demoTokens: SyncToken[] = [
  { id: 't1', label: 'studio-mac', token_hint: 'art_…9f2c', last_used_at: ago(0.3), revoked_at: null, created_at: ago(48) },
]

export const demoPosts: Post[] = [
  { id: 'u1', project_id: 'p2', project_slug: 'overgame', project_name: 'Overgame', kind: 'release', title: 'Matchmaking is live', body: 'Players are now paired by skill rating within 10 seconds. The queue falls back to wider ranges after 30 seconds so nobody waits forever.', url: 'https://github.com/rectornero/overgame/pull/42', source: 'claude', author_label: 'Claude on studio-mac', brief_id: 'b2', brief_title: 'Ship matchmaking', replies: [{ id: 'r3', source: 'web', author: null, body: 'Great. Can we open it to the beta group tomorrow?', created_at: ago(0.5) }], created_at: ago(0.8) },
  { id: 'u2', project_id: 'p1', project_slug: 'artache', project_name: 'Artache', kind: 'milestone', title: 'Claude projects can now post here', body: 'Any Claude Code session with the Artache connector can publish updates and catalogue works on its own.', url: null, source: 'claude', author_label: 'Claude', brief_id: null, brief_title: null, replies: [], created_at: ago(2) },
  { id: 'u3', project_id: 'p4', project_slug: 'deadend', project_name: 'Deadend', kind: 'question', title: 'Autosave every 30s or on every edit?', body: 'Every edit is safer but writes ~40 times a minute while dragging. Leaning to debounced 2s.', url: null, source: 'claude', author_label: 'Claude on travel-laptop', brief_id: null, brief_title: null, replies: [{ id: 'r4', source: 'web', author: null, body: 'Debounced 2s is fine.', created_at: ago(4) }, { id: 'r5', source: 'claude', author: 'Claude on travel-laptop', body: 'Done, autosave now waits 2s after the last edit.', created_at: ago(3.5) }], created_at: ago(5) },
  { id: 'u4', project_id: 'p3', project_slug: 'novaula', project_name: 'Novaula', kind: 'update', title: 'Course page redesign merged', body: null, url: null, source: 'cli', author_label: 'studio-mac', brief_id: null, brief_title: null, replies: [], created_at: ago(26) },
]

const brief = (b: Partial<Brief> & Pick<Brief, 'id' | 'project_id' | 'title'>): Brief => {
  const p = demoProjects.find((x) => x.id === b.project_id)!
  return {
    project_slug: p.slug, project_name: p.name, project_color: p.color, body: null, priority: 'normal', status: 'open',
    due_on: null, source: 'web', result_url: null, replies: [], updates: [], created_at: ago(30), updated_at: ago(3),
    closed_at: null, ...b,
  }
}

export const demoBriefs: Brief[] = [
  brief({ id: 'b1', project_id: 'p3', title: 'Add a free first lesson to every course', body: 'Visitors should be able to try one lesson without an account. Done when the course page shows a "Try it free" button that opens lesson 1.', priority: 'high', due_on: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) }),
  brief({ id: 'b2', project_id: 'p2', title: 'Ship matchmaking', priority: 'urgent', status: 'done', result_url: 'https://github.com/rectornero/overgame/pull/42', closed_at: ago(0.8), replies: [{ id: 'r1', source: 'claude', author: 'Claude on studio-mac', body: 'Accepted. Starting with skill-rating buckets.', created_at: ago(20) }], updates: [{ id: 'u1', title: 'Matchmaking is live', url: 'https://github.com/rectornero/overgame/pull/42', kind: 'release', created_at: ago(0.8) }] }),
  brief({ id: 'b3', project_id: 'p4', title: 'Trailer cut for the launch page', status: 'in_progress', replies: [{ id: 'r2', source: 'claude', author: 'Claude on travel-laptop', body: 'Working on it. Blocked on the final music track: which one should I use?', created_at: ago(6) }] }),
]
