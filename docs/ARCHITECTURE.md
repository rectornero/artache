# Artache architecture

Artache is a web app (installable as a PWA on phone and desktop) that gathers a studio's
Claude Code projects and sessions from every computer, plus the platforms, articles and
works the studio produces.

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| Web app | `src/`, hosted on Netlify | React + Vite SPA, installable PWA, light and dark themes |
| Database and auth | Supabase (`supabase/migrations`) | Postgres with row-level security; GitHub OAuth and email magic links |
| Sync endpoint | Supabase Edge Function `sync` | Receives session metadata from the CLI, authenticated by a sync token |
| Sync CLI | `cli/artache-sync.mjs` (also served at `/artache-sync.mjs`) | Runs on each computer, reads `~/.claude/projects`, posts metadata |
| Source | GitHub | Netlify builds every push to `main`; PRs get deploy previews |

## Data model

- `profiles`: one per auth user, filled by a trigger on sign-up (name, avatar, GitHub login).
- `machines`: each computer that has synced (name, platform, last seen).
- `sync_tokens`: per-computer secrets for the CLI. Only a SHA-256 hash and a short hint are stored; the raw token is shown once.
- `projects`: a codebase or product. Created by hand or by sync. Synced folders are matched by GitHub repo name (or folder name), so the same repo on two machines becomes one project with several `local_paths`.
- `sessions`: one Claude Code conversation (title, folder, branch, model, message count, start and last activity). Unique per `(owner, external_id)`, so re-syncing is idempotent.
- `works`: the studio's output, with `kind` = `platform` | `article` | `work`, a status pipeline (idea, drafting, in progress, review, published, archived), optional project link, URL, summary, Markdown body and tags.

Every table has an `owner` column defaulting to `auth.uid()` and an RLS policy restricting all access to the owner.

## How Claude Code sync works

Claude Code stores each conversation as a JSONL transcript under
`~/.claude/projects/<encoded-folder>/<session-id>.jsonl`. The CLI:

1. Reads every transcript and keeps only metadata: session id, working folder, git branch, model, message count, first and last timestamps, and a title (the conversation summary, or the first user prompt trimmed to 120 characters). Message contents never leave the computer.
2. Looks up each folder's GitHub `origin` to link sessions to repos.
3. Posts `{ machine, projects, sessions }` to `/functions/v1/sync` with `Authorization: Bearer art_...`.

The edge function hashes the token, finds its owner, upserts the machine, merges projects by slug and upserts sessions in batches of 500. Scheduling the CLI every 15 minutes (cron, launchd, Task Scheduler) keeps everything current.

Later options: a Claude Code `SessionEnd` hook that runs the CLI automatically, and importing claude.ai cloud sessions.

## Auth

Supabase Auth with two providers: GitHub OAuth (primary, scope `read:user repo` so the app can later show repo activity) and email magic links (works with zero setup). The web app uses the publishable key only; the service role key lives solely in the edge function's environment.

## Preview mode

With no `VITE_SUPABASE_*` variables the app runs on built-in sample data, so the UI can be viewed and deployed before the backend exists.

## Deploy

1. Apply `supabase/migrations/*.sql` and deploy `supabase/functions/sync` (with JWT verification off, since it uses its own tokens).
2. In Supabase Auth, set the Site URL to the Netlify URL, add it to redirect URLs, and enable the GitHub provider.
3. In Netlify, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` and deploy from `main`.
