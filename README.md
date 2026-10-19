# Artache

*With AI. By People.*

Artache is the studio's home base: every Claude Code project and session from every computer,
and the platforms, articles and works the studio makes, in one web app you can install on any device.

## Run it

```bash
npm install
npm run dev          # preview mode with sample data
npx netlify dev      # with the API and Netlify DB (needs a linked Netlify site)
```

Real data needs Netlify DB and a GitHub OAuth app; see the setup steps in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#setup).

## Sync Claude Code from a computer

1. In Artache, open **Settings** and create a token for the computer.
2. Download `artache-sync.mjs` from the same page (or use `cli/artache-sync.mjs`).
3. Run:

```bash
ARTACHE_URL=https://<your-site>.netlify.app ARTACHE_TOKEN=art_... node artache-sync.mjs
node artache-sync.mjs --dry-run    # see what would be sent
```

Only metadata (titles, folders, branches, timestamps) is sent. Conversations stay on the computer.

## Stack

React + Vite + TypeScript (PWA), Netlify Functions for the API, Netlify DB (Neon Postgres) for data,
GitHub for source and sign-in. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
