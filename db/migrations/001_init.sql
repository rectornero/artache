-- Artache initial schema (Netlify DB / Postgres).
-- Every row belongs to a user; the API filters by owner on every query.

create table users (
  id uuid primary key default gen_random_uuid(),
  github_id bigint not null unique,
  login text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Machines: each computer that runs the sync command
create table machines (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  name text not null,
  platform text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, name)
);

-- Sync tokens: long-lived secrets for the CLI (only the hash is stored)
create table sync_tokens (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  token_hint text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Projects: a Claude Code working directory, a repo, or a studio product
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  repo_full_name text,
  local_paths text[] not null default '{}',
  status text not null default 'active' check (status in ('idea', 'active', 'paused', 'shipped', 'archived')),
  color text,
  pinned boolean not null default false,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, slug)
);

-- Sessions: one Claude Code conversation
create table sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  machine_id uuid references machines (id) on delete set null,
  external_id text not null,
  source text not null default 'cli' check (source in ('cli', 'web', 'desktop', 'manual')),
  title text,
  summary text,
  cwd text,
  git_branch text,
  model text,
  message_count integer not null default 0,
  started_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, external_id)
);

create index sessions_project_idx on sessions (project_id, last_activity_at desc);
create index sessions_owner_activity_idx on sessions (owner, last_activity_at desc);

-- Works: platforms, articles and works the studio manages
create table works (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  kind text not null check (kind in ('platform', 'article', 'work')),
  title text not null,
  status text not null default 'idea' check (status in ('idea', 'drafting', 'in_progress', 'review', 'published', 'archived')),
  url text,
  summary text,
  body text,
  tags text[] not null default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index works_owner_kind_idx on works (owner, kind, updated_at desc);
