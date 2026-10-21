-- Briefs: work the studio hands to a project. The project's Claude picks them
-- up from its inbox, reports status and replies.
create table briefs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  body text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'accepted', 'in_progress', 'blocked', 'done', 'dropped')),
  due_on date,
  source text not null default 'web' check (source in ('claude', 'cli', 'web')),
  result_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index briefs_project_status_idx on briefs (project_id, status);
create index briefs_owner_updated_idx on briefs (owner, updated_at desc);

-- Replies on a brief or on a posted update, from the studio or the project.
create table replies (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references users (id) on delete cascade,
  brief_id uuid references briefs (id) on delete cascade,
  post_id uuid references posts (id) on delete cascade,
  body text not null,
  source text not null default 'web' check (source in ('claude', 'cli', 'web')),
  author_label text,
  created_at timestamptz not null default now(),
  check ((brief_id is null) <> (post_id is null))
);

create index replies_brief_idx on replies (brief_id, created_at);
create index replies_post_idx on replies (post_id, created_at);

-- An update can report on the brief it delivers.
alter table posts add column brief_id uuid references briefs (id) on delete set null;
