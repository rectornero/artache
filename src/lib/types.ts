export type ProjectStatus = 'idea' | 'active' | 'paused' | 'shipped' | 'archived'
export type WorkKind = 'platform' | 'article' | 'work'
export type WorkStatus = 'idea' | 'drafting' | 'in_progress' | 'review' | 'published' | 'archived'

export type Project = {
  id: string
  name: string
  slug: string
  description: string | null
  repo_full_name: string | null
  local_paths: string[]
  status: ProjectStatus
  color: string | null
  pinned: boolean
  last_activity_at: string | null
  created_at: string
}

export type Session = {
  id: string
  project_id: string | null
  machine_id: string | null
  external_id: string
  source: 'cli' | 'web' | 'desktop' | 'manual'
  title: string | null
  summary: string | null
  cwd: string | null
  git_branch: string | null
  model: string | null
  message_count: number
  started_at: string | null
  last_activity_at: string | null
}

export type Machine = {
  id: string
  name: string
  platform: string | null
  last_seen_at: string | null
}

export type Work = {
  id: string
  project_id: string | null
  kind: WorkKind
  title: string
  status: WorkStatus
  url: string | null
  summary: string | null
  body: string | null
  tags: string[]
  published_at: string | null
  updated_at: string
}

export type SyncToken = {
  id: string
  label: string
  token_hint: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export type PostKind = 'update' | 'milestone' | 'release' | 'note' | 'question'

export type Post = {
  id: string
  project_id: string | null
  project_slug: string | null
  project_name: string | null
  kind: PostKind
  title: string
  body: string | null
  url: string | null
  source: 'claude' | 'cli' | 'web'
  author_label: string | null
  brief_id: string | null
  brief_title: string | null
  replies: Reply[]
  created_at: string
}

export type Reply = {
  id: string
  source: 'claude' | 'cli' | 'web'
  author: string | null
  body: string
  created_at: string
}

export type BriefStatus = 'open' | 'accepted' | 'in_progress' | 'blocked' | 'done' | 'dropped'
export type BriefPriority = 'low' | 'normal' | 'high' | 'urgent'

export type Brief = {
  id: string
  project_id: string
  project_slug: string
  project_name: string
  project_color: string | null
  title: string
  body: string | null
  priority: BriefPriority
  status: BriefStatus
  due_on: string | null
  source: 'claude' | 'cli' | 'web'
  result_url: string | null
  replies: Reply[]
  updates: { id: string; title: string; url: string | null; kind: PostKind; created_at: string }[]
  created_at: string
  updated_at: string
  closed_at: string | null
}
