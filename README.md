# Artache

*With AI. By People.*

Live at **https://artache.netlify.app**.

Artache is the studio's home base: every Claude Code project and session from every computer,
and the platforms, articles and works the studio makes, in one web app you can install on any device.

## Run it

```bash
npm install
npm run dev          # preview mode with sample data
npx netlify dev      # with the API (needs DATABASE_URL and the GitHub OAuth variables)
```

Real data needs a Neon database and a GitHub OAuth app; see the setup steps in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#setup).

## Sync Claude Code from a computer

1. In Artache, open **Settings** and create a token for the computer.
2. Download `artache-sync.mjs` from the same page (or use `cli/artache-sync.mjs`).
3. Run:

```bash
ARTACHE_URL=https://<your-site>.netlify.app ARTACHE_TOKEN=art_... node artache-sync.mjs
node artache-sync.mjs --dry-run    # see what would be sent
```

Only metadata (titles, folders, branches, timestamps) is sent. Conversations stay on the computer.

## Let Claude Code post updates

Settings has a "Let Claude post here" section: one `claude mcp add` command per computer, a permission line and a
CLAUDE.md snippet. After that, every project built with Claude Code posts its progress to the Updates feed on its own.
Scripts can post too: `node artache-sync.mjs post "Shipped it" --kind release`.

## Stack

React + Vite + TypeScript (PWA), Netlify Functions for the API, Neon Postgres for data,
GitHub for source and sign-in. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
