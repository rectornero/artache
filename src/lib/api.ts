import { demoBriefs, demoMachines, demoPosts, demoProjects, demoSessions, demoTokens, demoWorks } from './demo'
import { isDemo } from './mode'
import type { Brief, BriefPriority, BriefStatus, Machine, Post, PostKind, Project, Reply, Session, SyncToken, Work, WorkKind } from './types'

// One data layer for both modes: the Artache API (Netlify Functions + Neon)
// when configured, in-memory sample data otherwise.
const mem = {
  projects: [...demoProjects],
  sessions: [...demoSessions],
  machines: [...demoMachines],
  works: [...demoWorks],
  tokens: [...demoTokens],
  posts: [...demoPosts],
  briefs: [...demoBriefs],
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  const body = await res.json().catch(() => null)
  if (res.status === 401) {
    window.location.href = '/'
  }
  if (!res.ok && res.status !== 404) throw new Error(body?.error ?? res.statusText)
  return body as T
}

const post = <T>(path: string, data: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(data) })

const byActivity = <T extends { last_activity_at: string | null }>(a: T, b: T) =>
  (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '')

export async function listProjects(): Promise<Project[]> {
  if (isDemo) return [...mem.projects].sort(byActivity)
  return call('/projects')
}

export async function getProject(slug: string): Promise<Project | null> {
  if (isDemo) return mem.projects.find((p) => p.slug === slug) ?? null
  return call(`/projects/${encodeURIComponent(slug)}`)
}

export async function saveProject(p: Partial<Project> & { name: string }): Promise<Project> {
  if (isDemo) {
    const existing = mem.projects.find((x) => x.id === p.id)
    if (existing) return Object.assign(existing, p)
    const now = new Date().toISOString()
    const created: Project = {
      id: crypto.randomUUID(), description: null, repo_full_name: null, local_paths: [], status: 'active',
      color: null, pinned: false, last_activity_at: now, created_at: now, ...p, slug: slugify(p.name),
    }
    mem.projects.push(created)
    return created
  }
  return post('/projects', p)
}

export async function listSessions(opts: { projectId?: string; limit?: number } = {}): Promise<Session[]> {
  const limit = opts.limit ?? 50
  if (isDemo) {
    return mem.sessions.filter((s) => !opts.projectId || s.project_id === opts.projectId).sort(byActivity).slice(0, limit)
  }
  const q = new URLSearchParams({ limit: String(limit) })
  if (opts.projectId) q.set('project', opts.projectId)
  return call(`/sessions?${q}`)
}

export async function listMachines(): Promise<Machine[]> {
  if (isDemo) return mem.machines
  return call('/machines')
}

export async function listWorks(kind?: WorkKind): Promise<Work[]> {
  if (isDemo) {
    return mem.works.filter((w) => !kind || w.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }
  return call(kind ? `/works?kind=${kind}` : '/works')
}

export async function saveWork(w: Partial<Work> & { kind: WorkKind; title: string }): Promise<Work> {
  if (isDemo) {
    const existing = mem.works.find((x) => x.id === w.id)
    const now = new Date().toISOString()
    if (existing) return Object.assign(existing, w, { updated_at: now })
    const created: Work = {
      id: crypto.randomUUID(), project_id: null, status: 'idea', url: null, summary: null, body: null,
      tags: [], published_at: null, updated_at: now, ...w,
    }
    mem.works.push(created)
    return created
  }
  return post('/works', w)
}

export async function deleteWork(id: string): Promise<void> {
  if (isDemo) {
    mem.works = mem.works.filter((w) => w.id !== id)
    return
  }
  await call(`/works/${id}`, { method: 'DELETE' })
}

export async function listPosts(opts: { projectId?: string; limit?: number } = {}): Promise<Post[]> {
  const limit = opts.limit ?? 30
  if (isDemo) {
    return mem.posts.filter((p) => !opts.projectId || p.project_id === opts.projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
  }
  const q = new URLSearchParams({ limit: String(limit) })
  if (opts.projectId) q.set('project', opts.projectId)
  return call(`/posts?${q}`)
}

export async function createPost(p: { project_id: string | null; kind: PostKind; title: string; body?: string; url?: string }): Promise<Post> {
  if (isDemo) {
    const project = mem.projects.find((x) => x.id === p.project_id)
    const created: Post = {
      id: crypto.randomUUID(), body: null, url: null, ...p, project_slug: project?.slug ?? null,
      project_name: project?.name ?? null, source: 'web', author_label: null, brief_id: null, brief_title: null,
      replies: [], created_at: new Date().toISOString(),
    }
    mem.posts.unshift(created)
    return created
  }
  return post('/posts', p)
}

export async function deletePost(id: string): Promise<void> {
  if (isDemo) {
    mem.posts = mem.posts.filter((p) => p.id !== id)
    return
  }
  await call(`/posts/${id}`, { method: 'DELETE' })
}

const ACTIVE: BriefStatus[] = ['open', 'accepted', 'in_progress', 'blocked']
const PRIORITY_ORDER: BriefPriority[] = ['urgent', 'high', 'normal', 'low']

export async function listBriefs(opts: { projectId?: string; active?: boolean } = {}): Promise<Brief[]> {
  if (isDemo) {
    return mem.briefs
      .filter((b) => (!opts.projectId || b.project_id === opts.projectId) && (!opts.active || ACTIVE.includes(b.status)))
      .sort((a, b) => Number(!ACTIVE.includes(a.status)) - Number(!ACTIVE.includes(b.status)) ||
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
  }
  const q = new URLSearchParams()
  if (opts.projectId) q.set('project', opts.projectId)
  if (opts.active) q.set('status', 'active')
  return call(`/briefs?${q}`)
}

export async function saveBrief(b: Partial<Pick<Brief, 'id' | 'project_id' | 'title' | 'body' | 'priority' | 'status' | 'due_on'>>): Promise<Brief> {
  if (isDemo) {
    const now = new Date().toISOString()
    const existing = mem.briefs.find((x) => x.id === b.id)
    if (existing) {
      const closed = b.status === 'done' || b.status === 'dropped'
      return Object.assign(existing, b, { updated_at: now, closed_at: closed ? (existing.closed_at ?? now) : null })
    }
    const p = mem.projects.find((x) => x.id === b.project_id)!
    const created: Brief = {
      id: crypto.randomUUID(), project_id: p.id, project_slug: p.slug, project_name: p.name, project_color: p.color,
      title: b.title ?? '', body: b.body ?? null, priority: b.priority ?? 'normal', status: 'open', due_on: b.due_on ?? null,
      source: 'web', result_url: null, replies: [], updates: [], created_at: now, updated_at: now, closed_at: null,
    }
    mem.briefs.unshift(created)
    return created
  }
  return post('/briefs', b)
}

export async function deleteBrief(id: string): Promise<void> {
  if (isDemo) {
    mem.briefs = mem.briefs.filter((b) => b.id !== id)
    return
  }
  await call(`/briefs/${id}`, { method: 'DELETE' })
}

// A reply from the studio on a brief or on an update a project posted.
export async function sendReply(target: { brief_id?: string; post_id?: string }, body: string): Promise<Reply> {
  if (isDemo) {
    const reply: Reply = { id: crypto.randomUUID(), source: 'web', author: null, body, created_at: new Date().toISOString() }
    const holder = target.brief_id ? mem.briefs.find((b) => b.id === target.brief_id) : mem.posts.find((p) => p.id === target.post_id)
    holder?.replies.push(reply)
    return reply
  }
  return post('/replies', { ...target, body })
}

export async function listTokens(): Promise<SyncToken[]> {
  if (isDemo) return mem.tokens
  return call('/tokens')
}

// The raw token is shown once; only its hash is stored.
export async function createToken(label: string): Promise<string> {
  if (isDemo) {
    const token = 'art_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
    mem.tokens.unshift({
      id: crypto.randomUUID(), label, token_hint: `art_…${token.slice(-4)}`, last_used_at: null, revoked_at: null,
      created_at: new Date().toISOString(),
    })
    return token
  }
  const { token } = await post<{ token: string }>('/tokens', { label })
  return token
}

export async function revokeToken(id: string): Promise<void> {
  if (isDemo) {
    const t = mem.tokens.find((x) => x.id === id)
    if (t) t.revoked_at = new Date().toISOString()
    return
  }
  await post(`/tokens/${id}/revoke`, {})
}

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-') || 'project'
  )
}
