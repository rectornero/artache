-- Artache initial schema.
-- Everything is owned by one auth user and protected by row-level security.

create extension if not exists pgcrypto;

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  github_login text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, github_login)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'user_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Machines: each computer that runs the sync command ------------------------
create table public.machines (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  platform text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, name)
);

-- Sync tokens: long-lived secrets for the CLI (only the hash is stored) ------
create table public.sync_tokens (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  token_hint text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Projects: a Claude Code working directory, a repo, or a studio product ----
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
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

-- Sessions: one Claude Code conversation -------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  machine_id uuid references public.machines (id) on delete set null,
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

create index sessions_project_idx on public.sessions (project_id, last_activity_at desc);
create index sessions_owner_activity_idx on public.sessions (owner, last_activity_at desc);

-- Works: platforms, articles and works the studio manages --------------------
create table public.works (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
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

create index works_owner_kind_idx on public.works (owner, kind, updated_at desc);

-- updated_at maintenance -------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger works_touch before update on public.works
  for each row execute function public.touch_updated_at();

-- Row-level security ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.sync_tokens enable row level security;
alter table public.projects enable row level security;
alter table public.sessions enable row level security;
alter table public.works enable row level security;

create policy "own profile" on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own machines" on public.machines
  for all using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

create policy "own sync tokens" on public.sync_tokens
  for all using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

create policy "own projects" on public.projects
  for all using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

create policy "own sessions" on public.sessions
  for all using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

create policy "own works" on public.works
  for all using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

create index machines_owner_idx on public.machines (owner);
create index sync_tokens_owner_idx on public.sync_tokens (owner);
create index sessions_machine_idx on public.sessions (machine_id);
create index works_project_idx on public.works (project_id);
