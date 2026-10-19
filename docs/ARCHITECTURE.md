# Artache architecture

Artache is a web app (installable as a PWA on phone and desktop) that gathers a studio's
Claude Code projects and sessions from every computer, plus the platforms, articles and
works the studio produces. Everything runs on Netlify.

## Pieces

| Piece | Where | Role |
| --- | --- | --- |
| Web app | `src/` | React + Vite SPA, installable PWA, light and dark themes |
| API | `netlify/functions/api.mts`, served at `/api/*` | One Netlify Function: GitHub sign-in, CRUD, sync endpoint |
| Database | Netlify DB (Neon Postgres) | Schema in `db/migrations/`, applied by `scripts/migrate.mjs` on every build |
| Sync CLI | `cli/artache-sync.mjs` (also served at `/artache-sync.mjs`) | Runs on each computer, reads `~/.claude/projects`, posts metadata |
| Source | GitHub | Netlify builds every push to `main`; PRs get deploy previews |

## Data model

- `users`: GitHub accounts that have signed in.
- `machines`: each computer that has synced (name, platform, last seen).
- `sync_tokens`: per-computer secrets for the CLI. Only a SHA-256 hash and a short hint are stored; the raw token is shown once.
- `projects`: a codebase or product. Created by hand or by sync. Synced folders merge by GitHub repo name (or folder name), so the same repo on two machines becomes one project with several `local_paths`.
- `sessions`: one Claude Code conversation (title, folder, branch, model, message count, first and last activity). Unique per `(owner, external_id)`, so re-syncing is idempotent.
- `works`: the studio's output, with `kind` = `platform` | `article` | `work`, a status pipeline (idea, drafting, in progress, review, published, archived), optional project link, URL, summary, Markdown body and tags.

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

## Preview mode

When `/api/me` is missing or reports the site isn't configured, the app runs on built-in sample data, so it can be viewed and deployed before the database and sign-in exist.

## Setup

1. Netlify: import the GitHub repo. Build settings come from `netlify.toml`.
2. Netlify DB: add it to the site (Extensions → Neon, or `npx netlify db init`). This sets `NETLIFY_DATABASE_URL`. Claim the database into a Neon account from the Netlify UI, otherwise Netlify deletes unclaimed databases after 7 days.
3. GitHub OAuth app (github.com/settings/developers): homepage `https://<site>.netlify.app`, callback `https://<site>.netlify.app/api/auth/callback`.
4. Netlify environment variables: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (long random string), `ALLOWED_GITHUB_LOGINS`.
5. Redeploy. The build applies migrations, and the app leaves preview mode.
