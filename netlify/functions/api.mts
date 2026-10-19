// Artache API: one Netlify Function serving every /api/* route.
// Data lives in Neon Postgres (DATABASE_URL); sign-in is GitHub OAuth with a
// signed session cookie. Every query is scoped to the signed-in owner.
import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const env = (k: string) => process.env[k] ?? ''
const configured = () => Boolean(env('DATABASE_URL') && env('GITHUB_CLIENT_ID') && env('GITHUB_CLIENT_SECRET') && env('SESSION_SECRET'))

let _sql: ReturnType<typeof neon<false, false>> | null = null
const db = () => (_sql ??= neon<false, false>(env('DATABASE_URL')))

// Responses ------------------------------------------------------------------

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// Session cookie ---------------------------------------------------------------

const COOKIE = 'artache_session'
const MAX_AGE = 60 * 60 * 24 * 30

function sign(value: string) {
  return createHmac('sha256', env('SESSION_SECRET')).update(value).digest('base64url')
}

function sessionCookie(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const value = `${userId}.${exp}`
  return `${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
}

function readCookie(req: Request, name: string) {
  const m = req.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

function sessionUserId(req: Request) {
  const raw = readCookie(req, COOKIE)
  if (!raw) return null
  const [id, exp, mac] = raw.split('.')
  if (!id || !exp || !mac) return null
  const expected = Buffer.from(sign(`${id}.${exp}`))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  if (Number(exp) < Date.now() / 1000) return null
  return id
}

async function requireUser(req: Request) {
  const id = sessionUserId(req)
  if (!id) throw new HttpError(401, 'not signed in')
  const [user] = await db()`select id, login, name, avatar_url from users where id = ${id}`
  if (!user) throw new HttpError(401, 'not signed in')
  return user as { id: string; login: string; name: string | null; avatar_url: string | null }
}

// GitHub OAuth -------------------------------------------------------------------

function login(req: Request) {
  const url = new URL(req.url)
  const state = randomBytes(16).toString('base64url')
  const auth = new URL('https://github.com/login/oauth/authorize')
  auth.searchParams.set('client_id', env('GITHUB_CLIENT_ID'))
  auth.searchParams.set('redirect_uri', `${url.origin}/api/auth/callback`)
  auth.searchParams.set('scope', 'read:user')
  auth.searchParams.set('state', state)
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `artache_oauth=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  })
}

async function callback(req: Request) {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  if (!state || state !== readCookie(req, 'artache_oauth')) throw new HttpError(400, 'invalid OAuth state')

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('GITHUB_CLIENT_ID'),
      client_secret: env('GITHUB_CLIENT_SECRET'),
      code: url.searchParams.get('code'),
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  })
  const { access_token } = (await tokenRes.json()) as { access_token?: string }
  if (!access_token) throw new HttpError(401, 'GitHub sign-in failed')

  const ghRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': 'artache' },
  })
  const gh = (await ghRes.json()) as { id: number; login: string; name: string | null; avatar_url: string }

  // Only listed GitHub accounts may sign in. With no list, only the first
  // account that ever signs in (the owner) is allowed.
  const allowed = env('ALLOWED_GITHUB_LOGINS').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (allowed.length) {
    if (!allowed.includes(gh.login.toLowerCase())) throw new HttpError(403, `${gh.login} is not allowed to use this Artache`)
  } else {
    const [{ count }] = await db()`select count(*)::int as count from users where github_id <> ${gh.id}`
    if (count > 0) throw new HttpError(403, `${gh.login} is not allowed to use this Artache`)
  }

  const [user] = await db()`
    insert into users (github_id, login, name, avatar_url, last_login_at)
    values (${gh.id}, ${gh.login}, ${gh.name}, ${gh.avatar_url}, now())
    on conflict (github_id) do update
      set login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url, last_login_at = now()
    returning id`

  const headers = new Headers({ Location: '/' })
  headers.append('Set-Cookie', sessionCookie(user.id))
  headers.append('Set-Cookie', 'artache_oauth=; Path=/api/auth; Max-Age=0')
  return new Response(null, { status: 302, headers })
}

// Helpers --------------------------------------------------------------------------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

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

const PROJECT_STATUSES = ['idea', 'active', 'paused', 'shipped', 'archived']
const WORK_KINDS = ['platform', 'article', 'work']
const WORK_STATUSES = ['idea', 'drafting', 'in_progress', 'review', 'published', 'archived']

function oneOf(value: unknown, allowed: string[], fallback: string) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Sync (called by the CLI with a bearer token) ------------------------------------------

type IncomingSession = {
  external_id: string
  cwd: string
  title?: string | null
  summary?: string | null
  git_branch?: string | null
  model?: string | null
  message_count: number
  started_at?: string | null
  last_activity_at?: string | null
}

type SyncPayload = {
  machine: { name: string; platform?: string }
  projects: { path: string; name: string; repo?: string | null }[]
  sessions: IncomingSession[]
}

async function sync(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token?.startsWith('art_')) throw new HttpError(401, 'missing sync token')
  const sql = db()

  const [tok] = await sql`select id, owner, revoked_at from sync_tokens where token_hash = ${sha256(token)}`
  if (!tok || tok.revoked_at) throw new HttpError(401, 'invalid sync token')
  const owner = tok.owner as string

  const payload = (await req.json().catch(() => null)) as SyncPayload | null
  if (!payload?.machine?.name || !Array.isArray(payload.sessions)) throw new HttpError(400, 'machine and sessions are required')

  await sql`update sync_tokens set last_used_at = now() where id = ${tok.id}`
  const [machine] = await sql`
    insert into machines (owner, name, platform, last_seen_at)
    values (${owner}, ${payload.machine.name}, ${payload.machine.platform ?? null}, now())
    on conflict (owner, name) do update set platform = excluded.platform, last_seen_at = now()
    returning id`

  const lastByPath = new Map<string, string>()
  for (const s of payload.sessions) {
    const t = s.last_activity_at ?? ''
    if (t > (lastByPath.get(s.cwd) ?? '')) lastByPath.set(s.cwd, t)
  }

  // Projects merge by slug, so the same repo on two machines becomes one project.
  const projectIdByPath = new Map<string, string>()
  for (const p of payload.projects ?? []) {
    const slug = slugify(p.repo?.split('/').pop() ?? p.name)
    const last = lastByPath.get(p.path) || null
    const [row] = await sql`
      insert into projects (owner, name, slug, repo_full_name, local_paths, last_activity_at)
      values (${owner}, ${p.name}, ${slug}, ${p.repo ?? null}, ${[p.path]}, ${last})
      on conflict (owner, slug) do update set
        local_paths = (select array_agg(distinct x) from unnest(projects.local_paths || excluded.local_paths) x),
        repo_full_name = coalesce(projects.repo_full_name, excluded.repo_full_name),
        last_activity_at = greatest(projects.last_activity_at, excluded.last_activity_at),
        updated_at = now()
      returning id`
    projectIdByPath.set(p.path, row.id)
  }

  const rows = payload.sessions.map((s) => ({
    external_id: String(s.external_id),
    project_id: projectIdByPath.get(s.cwd) ?? null,
    title: s.title?.slice(0, 300) ?? null,
    summary: s.summary?.slice(0, 2000) ?? null,
    cwd: s.cwd ?? null,
    git_branch: s.git_branch ?? null,
    model: s.model ?? null,
    message_count: Number(s.message_count) || 0,
    started_at: s.started_at ?? null,
    last_activity_at: s.last_activity_at ?? null,
  }))

  for (let i = 0; i < rows.length; i += 200) {
    await sql`
      insert into sessions (owner, machine_id, project_id, external_id, title, summary, cwd, git_branch, model, message_count, started_at, last_activity_at)
      select ${owner}, ${machine.id}, r.project_id, r.external_id, r.title, r.summary, r.cwd, r.git_branch, r.model, r.message_count, r.started_at, r.last_activity_at
      from json_to_recordset(${JSON.stringify(rows.slice(i, i + 200))}::json) as r(
        external_id text, project_id uuid, title text, summary text, cwd text, git_branch text, model text,
        message_count int, started_at timestamptz, last_activity_at timestamptz)
      on conflict (owner, external_id) do update set
        machine_id = excluded.machine_id, project_id = excluded.project_id, title = excluded.title,
        summary = excluded.summary, cwd = excluded.cwd, git_branch = excluded.git_branch, model = excluded.model,
        message_count = excluded.message_count, started_at = excluded.started_at, last_activity_at = excluded.last_activity_at`
  }

  return json({ ok: true, machine: payload.machine.name, projects: projectIdByPath.size, sessions: rows.length })
}

// Router ----------------------------------------------------------------------------------

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/'
  const method = req.method
  const seg = path.split('/').filter(Boolean)

  if (path === '/me') {
    if (!configured()) return json({ configured: false, user: null })
    const id = sessionUserId(req)
    const [user] = id ? await db()`select id, login, name, avatar_url from users where id = ${id}` : []
    return json({ configured: true, user: user ?? null })
  }
  if (!configured()) throw new HttpError(503, 'Artache is not configured yet')

  if (path === '/auth/login') return login(req)
  if (path === '/auth/callback') return callback(req)
  if (path === '/auth/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0` })
  }
  if (path === '/sync' && method === 'POST') return sync(req)

  const user = await requireUser(req)
  const sql = db()
  const owner = user.id

  // Projects
  if (path === '/projects' && method === 'GET') {
    return json(await sql`select * from projects where owner = ${owner} order by last_activity_at desc nulls last`)
  }
  if (path === '/projects' && method === 'POST') {
    const b = await req.json()
    const name = str(b.name)
    if (!name) throw new HttpError(400, 'name is required')
    const status = oneOf(b.status, PROJECT_STATUSES, 'active')
    if (b.id) {
      const [row] = await sql`
        update projects set name = ${name}, description = ${str(b.description)}, repo_full_name = ${str(b.repo_full_name)},
          status = ${status}, color = ${str(b.color)}, pinned = ${Boolean(b.pinned)}, updated_at = now()
        where id = ${b.id} and owner = ${owner} returning *`
      if (!row) throw new HttpError(404, 'project not found')
      return json(row)
    }
    let slug = slugify(str(b.slug) ?? name)
    const [taken] = await sql`select 1 from projects where owner = ${owner} and slug = ${slug}`
    if (taken) slug = `${slug}-${randomBytes(2).toString('hex')}`
    const [row] = await sql`
      insert into projects (owner, name, slug, description, repo_full_name, status, color, pinned, last_activity_at)
      values (${owner}, ${name}, ${slug}, ${str(b.description)}, ${str(b.repo_full_name)}, ${status}, ${str(b.color)}, ${Boolean(b.pinned)}, now())
      returning *`
    return json(row, 201)
  }
  if (seg[0] === 'projects' && seg[1] && method === 'GET') {
    const [row] = await sql`select * from projects where owner = ${owner} and slug = ${seg[1]}`
    return row ? json(row) : json(null, 404)
  }

  // Sessions
  if (path === '/sessions' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 1000)
    const project = url.searchParams.get('project')
    return json(
      project
        ? await sql`select * from sessions where owner = ${owner} and project_id = ${project} order by last_activity_at desc nulls last limit ${limit}`
        : await sql`select * from sessions where owner = ${owner} order by last_activity_at desc nulls last limit ${limit}`,
    )
  }

  // Machines
  if (path === '/machines' && method === 'GET') {
    return json(await sql`select * from machines where owner = ${owner} order by last_seen_at desc nulls last`)
  }

  // Works
  if (path === '/works' && method === 'GET') {
    const kind = url.searchParams.get('kind')
    return json(
      kind
        ? await sql`select * from works where owner = ${owner} and kind = ${kind} order by updated_at desc`
        : await sql`select * from works where owner = ${owner} order by updated_at desc`,
    )
  }
  if (path === '/works' && method === 'POST') {
    const b = await req.json()
    const title = str(b.title)
    if (!title) throw new HttpError(400, 'title is required')
    const kind = oneOf(b.kind, WORK_KINDS, 'work')
    const status = oneOf(b.status, WORK_STATUSES, 'idea')
    const tags = Array.isArray(b.tags) ? b.tags.filter((t: unknown) => typeof t === 'string').slice(0, 20) : []
    const projectId = str(b.project_id)
    if (projectId) {
      const [own] = await sql`select 1 from projects where id = ${projectId} and owner = ${owner}`
      if (!own) throw new HttpError(400, 'unknown project')
    }
    const publishedAt = status === 'published' ? (str(b.published_at) ?? new Date().toISOString()) : null
    if (b.id) {
      const [row] = await sql`
        update works set kind = ${kind}, title = ${title}, status = ${status}, project_id = ${projectId}, url = ${str(b.url)},
          summary = ${str(b.summary)}, body = ${str(b.body)}, tags = ${tags}, published_at = ${publishedAt}, updated_at = now()
        where id = ${b.id} and owner = ${owner} returning *`
      if (!row) throw new HttpError(404, 'work not found')
      return json(row)
    }
    const [row] = await sql`
      insert into works (owner, kind, title, status, project_id, url, summary, body, tags, published_at)
      values (${owner}, ${kind}, ${title}, ${status}, ${projectId}, ${str(b.url)}, ${str(b.summary)}, ${str(b.body)}, ${tags}, ${publishedAt})
      returning *`
    return json(row, 201)
  }
  if (seg[0] === 'works' && seg[1] && method === 'DELETE') {
    await sql`delete from works where id = ${seg[1]} and owner = ${owner}`
    return json({ ok: true })
  }

  // Sync tokens: the raw token is returned once; only its hash is stored.
  if (path === '/tokens' && method === 'GET') {
    return json(await sql`
      select id, label, token_hint, last_used_at, revoked_at, created_at
      from sync_tokens where owner = ${owner} order by created_at desc`)
  }
  if (path === '/tokens' && method === 'POST') {
    const b = await req.json().catch(() => ({}))
    const token = `art_${randomBytes(24).toString('hex')}`
    await sql`
      insert into sync_tokens (owner, label, token_hash, token_hint)
      values (${owner}, ${str(b.label) ?? 'my computer'}, ${sha256(token)}, ${`art_…${token.slice(-4)}`})`
    return json({ token }, 201)
  }
  if (seg[0] === 'tokens' && seg[1] && seg[2] === 'revoke' && method === 'POST') {
    await sql`update sync_tokens set revoked_at = now() where id = ${seg[1]} and owner = ${owner}`
    return json({ ok: true })
  }

  throw new HttpError(404, 'not found')
}

export default async (req: Request) => {
  try {
    return await route(req)
  } catch (err) {
    if (err instanceof HttpError) {
      // OAuth errors land on a page the person is looking at, so send them home with a message.
      if (new URL(req.url).pathname.startsWith('/api/auth/callback')) {
        return new Response(null, { status: 302, headers: { Location: `/?error=${encodeURIComponent(err.message)}` } })
      }
      return json({ error: err.message }, err.status)
    }
    console.error(err)
    return json({ error: 'server error' }, 500)
  }
}

export const config: Config = { path: '/api/*' }
