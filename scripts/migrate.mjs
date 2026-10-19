// Applies db/migrations/*.sql in order, once each. Runs during the Netlify build.
import { neon } from '@netlify/neon'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

if (!process.env.NETLIFY_DATABASE_URL) {
  console.log('migrate: NETLIFY_DATABASE_URL not set, skipping')
  process.exit(0)
}

const sql = neon()
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
