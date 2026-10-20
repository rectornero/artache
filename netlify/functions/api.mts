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

// Access tokens (`art_...`) let the sync CLI, scripts and Claude Code act for
// their owner without a browser session.
async function tokenOwner(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token?.startsWith('art_')) throw new HttpError(401, 'missing access token')
  const sql = db()
  const [tok] = await sql`select id, owner, revoked_at from sync_tokens where token_hash = ${sha256(token)}`
  if (!tok || tok.revoked_at) throw new HttpError(401, 'invalid access token')
  await sql`update sync_tokens set last_used_at = now() where id = ${tok.id}`
  return tok.owner as string
}

async function sync(req: Request) {
  const owner = await tokenOwner(req)
  const sql = db()

  const payload = (await req.json().catch(() => null)) as SyncPayload | null
  if (!payload?.machine?.name || !Array.isArray(payload.sessions)) throw new HttpError(400, 'machine and sessions are required')

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

// Posting: updates and works published by Claude Code, scripts or the web app -----

const POST_KINDS = ['update', 'milestone', 'release', 'note', 'question']
type Source = 'claude' | 'cli' | 'web'

// Finds a project by slug, GitHub repo ("owner/name") or name, creating it when
// it doesn't exist yet so a brand-new Claude project can post straight away.
async function resolveProject(owner: string, ref: unknown) {
  const text = str(ref)
  if (!text) return null
  const sql = db()
  const slug = slugify(text.split('/').pop()!)
  const [found] = await sql`
    select id, slug from projects
    where owner = ${owner} and (slug = ${slug} or lower(repo_full_name) = lower(${text}) or lower(name) = lower(${text}))
    order by (slug = ${slug}) desc limit 1`
  if (found) return found as { id: string; slug: string }
  const repo = /^[\w.-]+\/[\w.-]+$/.test(text) ? text : null
  const [row] = await sql`
    insert into projects (owner, name, slug, repo_full_name, last_activity_at)
    values (${owner}, ${text.split('/').pop()}, ${slug}, ${repo}, now())
    on conflict (owner, slug) do update set updated_at = now()
    returning id, slug`
  return row as { id: string; slug: string }
}

async function createPost(owner: string, b: Record<string, unknown>, source: Source) {
  const title = str(b.title)
  if (!title) throw new HttpError(400, 'title is required')
  const sql = db()
  const project = b.project_id
    ? ((await sql`select id, slug from projects where id = ${String(b.project_id)} and owner = ${owner}`)[0] as { id: string; slug: string } | undefined) ?? null
    : await resolveProject(owner, b.project)
  if (b.project_id && !project) throw new HttpError(400, 'unknown project')
  const [row] = await sql`
    insert into posts (owner, project_id, kind, title, body, url, source, author_label, session_external_id)
    values (${owner}, ${project?.id ?? null}, ${oneOf(b.kind, POST_KINDS, 'update')}, ${title.slice(0, 300)},
      ${str(b.body)?.slice(0, 20000) ?? null}, ${str(b.url)}, ${source}, ${str(b.author)?.slice(0, 100) ?? null},
      ${str(b.session_id)})
    returning *`
  if (project) await sql`update projects set last_activity_at = greatest(last_activity_at, now()) where id = ${project.id}`
  return Object.assign(row as Record<string, any>, { project_slug: project?.slug ?? null })
}

// With `key`, the same work is updated on every call instead of duplicated.
// Fields left out keep their current value.
async function upsertWork(owner: string, b: Record<string, unknown>) {
  const sql = db()
  const key = str(b.key)?.slice(0, 200) ?? null
  const [current] = key ? await sql`select * from works where owner = ${owner} and external_key = ${key}` : []
  const title = str(b.title) ?? current?.title
  if (!title) throw new HttpError(400, 'title is required')
  const project = b.project !== undefined ? await resolveProject(owner, b.project) : null
  const pick = (k: string) => (b[k] !== undefined ? str(b[k]) : (current?.[k] ?? null))
  const kind = oneOf(b.kind, WORK_KINDS, current?.kind ?? 'work')
  const status = oneOf(b.status, WORK_STATUSES, current?.status ?? 'idea')
  const tags = Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === 'string').slice(0, 20) : (current?.tags ?? [])
  const projectId = project?.id ?? current?.project_id ?? null
  const publishedAt = status === 'published' ? (current?.published_at ?? new Date().toISOString()) : null
  if (current) {
    const [row] = await sql`
      update works set kind = ${kind}, title = ${title}, status = ${status}, project_id = ${projectId}, url = ${pick('url')},
        summary = ${pick('summary')}, body = ${pick('body')}, tags = ${tags}, published_at = ${publishedAt}, updated_at = now()
      where id = ${current.id} returning *`
    return { work: row, created: false }
  }
  const [row] = await sql`
    insert into works (owner, kind, title, status, project_id, url, summary, body, tags, published_at, external_key)
    values (${owner}, ${kind}, ${title}, ${status}, ${projectId}, ${pick('url')}, ${pick('summary')}, ${pick('body')}, ${tags}, ${publishedAt}, ${key})
    returning *`
  return { work: row, created: true }
}

const listProjectsBrief = (owner: string) => db()`
  select slug, name, repo_full_name, status, description, last_activity_at
  from projects where owner = ${owner} order by last_activity_at desc nulls last`

const listWorksBrief = (owner: string, kind: string | null) => db()`
  select w.id, w.external_key as key, w.kind, w.title, w.status, w.url, w.summary, w.tags, p.slug as project, w.updated_at
  from works w left join projects p on p.id = w.project_id
  where w.owner = ${owner} and (${kind}::text is null or w.kind = ${kind})
  order by w.updated_at desc limit 200`

const listPosts = (owner: string, projectId: string | null, limit: number) => db()`
  select po.*, p.slug as project_slug, p.name as project_name
  from posts po left join projects p on p.id = po.project_id
  where po.owner = ${owner} and (${projectId}::uuid is null or po.project_id = ${projectId})
  order by po.created_at desc limit ${limit}`

// Public v1 API for tokens: /api/v1/projects, /api/v1/posts, /api/v1/works
async function v1(req: Request, seg: string[]) {
  const owner = await tokenOwner(req)
  const url = new URL(req.url)
  const body = async () => ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const source: Source = req.headers.get('x-artache-source') === 'cli' ? 'cli' : 'claude'
  const [resource] = seg

  if (resource === 'projects' && req.method === 'GET') return json(await listProjectsBrief(owner))
  if (resource === 'posts' && req.method === 'POST') return json(await createPost(owner, await body(), source), 201)
  if (resource === 'posts' && req.method === 'GET') {
    const project = url.searchParams.get('project')
    const p = project ? await resolveProject(owner, project) : null
    return json(await listPosts(owner, p?.id ?? null, Math.min(Number(url.searchParams.get('limit')) || 20, 100)))
  }
  if (resource === 'works' && req.method === 'POST') {
    const { work, created } = await upsertWork(owner, await body())
    return json(work, created ? 201 : 200)
  }
  if (resource === 'works' && req.method === 'GET') return json(await listWorksBrief(owner, url.searchParams.get('kind')))
  throw new HttpError(404, 'not found')
}

// MCP server ----------------------------------------------------------------------------
// Streamable HTTP, stateless, JSON responses. Add it to Claude Code with:
//   claude mcp add --transport http artache https://<site>/api/mcp --header "Authorization: Bearer art_..."

const MCP_TOOLS = [
  {
    name: 'artache_post_update',
    description:
      'Publish an update to the Artache studio feed. Use it after meaningful progress on a project: a feature shipped, a milestone reached, a release, a decision, or a question for the team. Write for people who did not watch the session: a short title, then what changed and why it matters.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug, GitHub repo ("owner/name") or folder name. Created if new.' },
        title: { type: 'string', description: 'One line, under 100 characters.' },
        body: { type: 'string', description: 'Markdown details: what changed, why, what is next.' },
        kind: { type: 'string', enum: POST_KINDS, description: 'Default "update".' },
        url: { type: 'string', description: 'Link to a PR, deploy, doc or release.' },
        session_id: { type: 'string', description: 'Claude Code session id, if known.' },
        author: { type: 'string', description: 'Who is posting, e.g. "Claude on studio-mac".' },
      },
      required: ['project', 'title'],
    },
  },
  {
    name: 'artache_upsert_work',
    description:
      'Create or update an item in the Artache studio catalogue: a platform (a live product), an article, or another work (video, design, release). Pass a stable `key` (e.g. "overgame/launch-trailer") to update the same item later instead of creating duplicates. Fields left out keep their current value.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Stable id you choose, so later calls update this item.' },
        kind: { type: 'string', enum: WORK_KINDS },
        title: { type: 'string' },
        status: { type: 'string', enum: WORK_STATUSES },
        project: { type: 'string', description: 'Project slug, repo or name.' },
        url: { type: 'string' },
        summary: { type: 'string', description: 'One or two sentences.' },
        body: { type: 'string', description: 'Markdown body, e.g. the article draft.' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
  },
  {
    name: 'artache_list_projects',
    description: 'List the studio projects in Artache (slug, name, repo, status), most recently active first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'artache_list_works',
    description: 'List works in the Artache catalogue with their keys and statuses.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: WORK_KINDS } } },
  },
  {
    name: 'artache_recent_updates',
    description: 'Read the latest updates posted to Artache, optionally for one project, to avoid repeating news.',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string' }, limit: { type: 'number', description: 'Default 10, max 50.' } },
    },
  },
]

async function mcpTool(owner: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'artache_post_update': {
      const post = await createPost(owner, args, 'claude')
      return `Posted "${post.title}"${post.project_slug ? ` to ${post.project_slug}` : ''}.`
    }
    case 'artache_upsert_work': {
      const { work, created } = await upsertWork(owner, args)
      return `${created ? 'Created' : 'Updated'} ${work.kind} "${work.title}" (${work.status})${work.external_key ? `, key ${work.external_key}` : ''}.`
    }
    case 'artache_list_projects':
      return JSON.stringify(await listProjectsBrief(owner), null, 1)
    case 'artache_list_works':
      return JSON.stringify(await listWorksBrief(owner, str(args.kind)), null, 1)
    case 'artache_recent_updates': {
      const p = args.project ? await resolveProject(owner, args.project) : null
      const rows = await listPosts(owner, p?.id ?? null, Math.min(Number(args.limit) || 10, 50))
      return JSON.stringify(rows.map((r) => ({ project: r.project_slug, kind: r.kind, title: r.title, url: r.url, created_at: r.created_at })), null, 1)
    }
    default:
      throw new HttpError(404, `unknown tool ${name}`)
  }
}

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, any> }

async function mcpHandle(owner: string, msg: RpcRequest) {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg.id === undefined) return null // notifications need no answer
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'artache', title: 'Artache', version: '1.0.0' },
        instructions:
          'Artache is the studio hub. After meaningful work, post a short update with artache_post_update; record platforms, articles and other works with artache_upsert_work.',
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: MCP_TOOLS })
    case 'tools/call': {
      try {
        const text = await mcpTool(owner, String(msg.params?.name), msg.params?.arguments ?? {})
        return reply({ content: [{ type: 'text', text }] })
      } catch (err) {
        if (err instanceof HttpError) return reply({ content: [{ type: 'text', text: err.message }], isError: true })
        throw err
      }
    }
    default:
      return fail(-32601, `method not found: ${msg.method}`)
  }
}

async function mcp(req: Request) {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const owner = await tokenOwner(req)
  const body = await req.json().catch(() => null)
  if (!body) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400)
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => mcpHandle(owner, m)))).filter(Boolean)
    return out.length ? json(out) : new Response(null, { status: 202 })
  }
  const out = await mcpHandle(owner, body)
  return out ? json(out) : new Response(null, { status: 202 })
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
  if (path === '/mcp') return mcp(req)
  if (seg[0] === 'v1') return v1(req, seg.slice(1))

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

  // Updates feed
  if (path === '/posts' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 200)
    return json(await listPosts(owner, url.searchParams.get('project'), limit))
  }
  if (path === '/posts' && method === 'POST') return json(await createPost(owner, await req.json(), 'web'), 201)
  if (seg[0] === 'posts' && seg[1] && method === 'DELETE') {
    await sql`delete from posts where id = ${seg[1]} and owner = ${owner}`
    return json({ ok: true })
  }

  // Access tokens: the raw token is returned once; only its hash is stored.
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
