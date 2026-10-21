# Artache architecture

Artache is a web app (installable as a PWA on phone and desktop) that gathers a studio's
Claude Code projects and sessions from every computer, plus the platforms, articles and
works the studio produces. Everything runs on Netlify.

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| Web app | `src/` | React + Vite SPA, installable PWA, light and dark themes |
| API | `netlify/functions/api.mts`, served at `/api/*` | One Netlify Function: GitHub sign-in, CRUD, sync endpoint, token API (`/api/v1`) and MCP server (`/api/mcp`) |
| Database | Neon Postgres (your own Neon account) | Schema in `db/migrations/`, applied by `scripts/migrate.mjs` on every build |
| Sync CLI | `cli/artache-sync.mjs` (also served at `/artache-sync.mjs`) | Runs on each computer, reads `~/.claude/projects`, posts metadata; `post` sends an update |
| Source | GitHub | Netlify builds every push to `main`; PRs get deploy previews |

## Data model

- `users`: GitHub accounts that have signed in.
- `machines`: each computer that has synced (name, platform, last seen).
- `sync_tokens`: per-computer access tokens (shown as "Access tokens") for the CLI, scripts and Claude Code. Only a SHA-256 hash and a short hint are stored; the raw token is shown once.
- `projects`: a codebase or product. Created by hand or by sync. Synced folders merge by GitHub repo name (or folder name), so the same repo on two machines becomes one project with several `local_paths`.
- `sessions`: one Claude Code conversation (title, folder, branch, model, message count, first and last activity). Unique per `(owner, external_id)`, so re-syncing is idempotent.
- `works`: the studio's output, with `kind` = `platform` | `article` | `work`, a status pipeline (idea, drafting, in progress, review, published, archived), optional project link, URL, summary, Markdown body and tags. `external_key` lets Claude update the same work on later calls.
- `briefs`: work the studio hands to a project (title, Markdown body, priority, due date, status `open` → `accepted` → `in_progress` / `blocked` → `done` / `dropped`, result link).
- `replies`: the conversation on a brief or on a posted update, from the studio (`web`) or the project (`claude`, `cli`).
- `posts`: the Updates feed. Kind (`update`, `milestone`, `release`, `note`, `question`), title, Markdown body, link, project, and `source` (`claude`, `cli`, `web`).

Every row has an `owner`; the API adds `owner = <signed-in user>` to every query.

## Sign-in

GitHub OAuth handled by the API (`/api/auth/login` → GitHub → `/api/auth/callback`). On success the API sets an
HttpOnly cookie holding the user id and expiry, signed with HMAC-SHA256 (`SESSION_SECRET`), valid 30 days.
Only GitHub logins in `ALLOWED_GITHUB_LOGINS` can sign in; if that is empty, only the first account that ever signed in can.

## How Claude Code sync works

Claude Code stores each conversation as a JSONL transcript under
`~/.claude/projects/<encoded-folder>/<session-id>.jsonl`. The CLI:

1. Reads every transcript and keeps only metadata: session id, working folder, git branch, model, message count, first and last timestamps, and a title (the conversation summary, or the first prompt trimmed to 120 characters). Message contents never leave the computer.
2. Looks up each folder's GitHub `origin` to link sessions to repos.
3. Posts `{ machine, projects, sessions }` to `/api/sync` with `Authorization: Bearer art_...`.

The API hashes the token, finds its owner, upserts the machine, merges projects by slug and upserts sessions in batches of 200. Scheduling the CLI every 15 minutes (cron, launchd, Task Scheduler) keeps everything current.

Later options: a Claude Code `SessionEnd` hook that runs the CLI automatically, and importing claude.ai cloud sessions.

## How Claude Code and the studio talk

`/api/mcp` is a stateless MCP server (streamable HTTP, JSON responses) authenticated with an access token. Once added with
`claude mcp add --transport http --scope user artache https://<site>/api/mcp --header "Authorization: Bearer art_..."`,
every Claude Code session on that computer gets nine tools:

- Project to studio: `artache_post_update` (optionally linked to a brief), `artache_upsert_work`.
- Studio to project: `artache_inbox` returns the project's active briefs and the updates the studio replied to (the
  latest reply is from the studio); `artache_update_brief` changes a brief's status and can reply; `artache_reply` answers
  on a brief or update; `artache_create_brief` lets any Claude (for example the studio's) hand work to a project.
- Lookups: `artache_list_projects`, `artache_list_works`, `artache_recent_updates`.

A CLAUDE.md snippet (shown in Settings) tells Claude to check the inbox when a session starts and when to post. Nothing
can wake an idle session, so briefs are picked up at the next session; `artache-sync.mjs inbox` as a `SessionStart` hook
puts waiting briefs straight into Claude's context. Projects are matched by slug, GitHub repo or name, and created on
first post (never by an inbox read).

The same operations are plain REST for scripts and CI: `POST /api/v1/posts`, `GET /api/v1/posts`, `POST /api/v1/works`
(upsert by `key`), `GET /api/v1/works`, `GET /api/v1/projects`, `GET /api/v1/inbox?project=`, `GET|POST /api/v1/briefs`
(`POST /api/v1/briefs/<id>` updates), `POST /api/v1/replies`, all with `Authorization: Bearer art_...`.

## Preview mode

When `/api/me` is missing or reports the site isn't configured, the app runs on built-in sample data, so it can be viewed and deployed before the database and sign-in exist.

## Why Neon directly

Netlify DB is a Neon database managed through Netlify: it must be claimed within 7 days, is tied to one site and
exposes few Neon features. A Neon account of your own keeps plain Postgres and adds: no expiry, several projects on the
free plan, database branches (for example one per deploy preview), point-in-time restore, and the freedom to move
hosting off Netlify without touching the data. The code only needs `DATABASE_URL`.

## Setup

1. Neon: create a free account at neon.tech, create a project named `artache`, and copy the pooled connection string.
2. Netlify: import the GitHub repo. Build settings come from `netlify.toml`.
3. GitHub OAuth app (github.com/settings/developers): homepage `https://<site>.netlify.app`, callback `https://<site>.netlify.app/api/auth/callback`.
4. Netlify environment variables (scoped to builds and functions): `DATABASE_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (long random string), `ALLOWED_GITHUB_LOGINS`.
5. Redeploy. The build applies migrations, and the app leaves preview mode.
