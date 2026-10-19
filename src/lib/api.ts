import { demoMachines, demoProjects, demoSessions, demoTokens, demoWorks } from './demo'
import { isDemo, supabase } from './supabase'
import type { Machine, Project, Session, SyncToken, Work, WorkKind } from './types'

// One data layer for both modes: Supabase when configured, in-memory sample
// data otherwise.
const mem = {
  projects: [...demoProjects],
  sessions: [...demoSessions],
  machines: [...demoMachines],
  works: [...demoWorks],
  tokens: [...demoTokens],
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const byActivity = <T extends { last_activity_at: string | null }>(a: T, b: T) =>
  (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '')

export async function listProjects(): Promise<Project[]> {
  if (isDemo) return [...mem.projects].sort(byActivity)
  return must(await supabase!.from('projects').select('*').order('last_activity_at', { ascending: false, nullsFirst: false }))
}

export async function getProject(slug: string): Promise<Project | null> {
  if (isDemo) return mem.projects.find((p) => p.slug === slug) ?? null
  return must(await supabase!.from('projects').select('*').eq('slug', slug).maybeSingle())
}

export async function saveProject(p: Partial<Project> & { name: string }): Promise<Project> {
  const slug = p.slug ?? slugify(p.name)
  if (isDemo) {
    const existing = mem.projects.find((x) => x.id === p.id)
    if (existing) return Object.assign(existing, p)
    const created: Project = {
      id: crypto.randomUUID(), description: null, repo_full_name: null, local_paths: [], status: 'active',
      color: null, pinned: false, last_activity_at: new Date().toISOString(), created_at: new Date().toISOString(),
      ...p, slug,
    }
    mem.projects.push(created)
    return created
  }
  const row = { ...p, slug }
  return must(await supabase!.from('projects').upsert(row).select().single())
}

export async function listSessions(opts: { projectId?: string; limit?: number } = {}): Promise<Session[]> {
  const limit = opts.limit ?? 50
  if (isDemo) {
    return mem.sessions.filter((s) => !opts.projectId || s.project_id === opts.projectId).sort(byActivity).slice(0, limit)
  }
  let q = supabase!.from('sessions').select('*').order('last_activity_at', { ascending: false, nullsFirst: false }).limit(limit)
  if (opts.projectId) q = q.eq('project_id', opts.projectId)
  return must(await q)
}

export async function listMachines(): Promise<Machine[]> {
  if (isDemo) return mem.machines
  return must(await supabase!.from('machines').select('*').order('last_seen_at', { ascending: false }))
}

export async function listWorks(kind?: WorkKind): Promise<Work[]> {
  if (isDemo) {
    return mem.works.filter((w) => !kind || w.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }
  let q = supabase!.from('works').select('*').order('updated_at', { ascending: false })
  if (kind) q = q.eq('kind', kind)
  return must(await q)
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
  return must(await supabase!.from('works').upsert(w).select().single())
}

export async function deleteWork(id: string): Promise<void> {
  if (isDemo) {
    mem.works = mem.works.filter((w) => w.id !== id)
    return
  }
  must(await supabase!.from('works').delete().eq('id', id))
}

export async function listTokens(): Promise<SyncToken[]> {
  if (isDemo) return mem.tokens
  return must(
    await supabase!.from('sync_tokens').select('id, label, token_hint, last_used_at, revoked_at, created_at').order('created_at', { ascending: false }),
  )
}

// The raw token is shown once; only its hash is stored.
export async function createToken(label: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const token = 'art_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const hint = `art_…${token.slice(-4)}`
  if (isDemo) {
    mem.tokens.unshift({ id: crypto.randomUUID(), label, token_hint: hint, last_used_at: null, revoked_at: null, created_at: new Date().toISOString() })
    return token
  }
  must(await supabase!.from('sync_tokens').insert({ label, token_hash: await sha256(token), token_hint: hint }))
  return token
}

export async function revokeToken(id: string): Promise<void> {
  if (isDemo) {
    const t = mem.tokens.find((x) => x.id === id)
    if (t) t.revoked_at = new Date().toISOString()
    return
  }
  must(await supabase!.from('sync_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id))
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
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
