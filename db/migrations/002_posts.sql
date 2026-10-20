-- Posts: updates that Claude (or you) publish into Artache, per project.
create table posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  kind text not null default 'update' check (kind in ('update', 'milestone', 'release', 'note', 'question')),
  title text not null,
  body text,
  url text,
  source text not null default 'claude' check (source in ('claude', 'cli', 'web')),
  author_label text,
  session_external_id text,
  created_at timestamptz not null default now()
);

create index posts_owner_created_idx on posts (owner, created_at desc);
create index posts_project_idx on posts (project_id, created_at desc);

-- Lets Claude update the same work again instead of creating duplicates.
alter table works add column external_key text;
create unique index works_owner_external_key_idx on works (owner, external_key) where external_key is not null;
