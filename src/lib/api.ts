import { demoMachines, demoProjects, demoSessions, demoTokens, demoWorks } from './demo'
import { isDemo } from './mode'
import type { Machine, Project, Session, SyncToken, Work, WorkKind } from './types'

// One data layer for both modes: the Artache API (Netlify Functions + Netlify
// DB) when configured, in-memory sample data otherwise.
const mem = {
  projects: [...demoProjects],
  sessions: [...demoSessions],
  machines: [...demoMachines],
  works: [...demoWorks],
  tokens: [...demoTokens],
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
