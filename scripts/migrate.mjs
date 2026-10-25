// Applies db/migrations/*.sql in order, once each. Runs during the Netlify build.
// Only production builds touch the database: Deploy Previews and branch deploys
// share it, and waking it for them costs credits (and could migrate it early).
import { neon } from '@neondatabase/serverless'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

if (!process.env.DATABASE_URL) {
  console.log('migrate: DATABASE_URL not set, skipping')
  process.exit(0)
}

if (process.env.CONTEXT && process.env.CONTEXT !== 'production') {
  console.log(`migrate: ${process.env.CONTEXT} build, skipping (production builds only)`)
  process.exit(0)
}

const sql = neon(process.env.DATABASE_URL)
const dir = join(import.meta.dirname, '..', 'db', 'migrations')

await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`
const done = new Set((await sql`select name from _migrations`).map((r) => r.name))

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue
  const statements = readFileSync(join(dir, file), 'utf8')
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)
  await sql.transaction([
    ...statements.map((s) => sql.query(s)),
    sql.query('insert into _migrations (name) values ($1)', [file]),
  ])
  console.log(`migrate: applied ${file}`)
}
console.log('migrate: up to date')
