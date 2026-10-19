# Artache

*With AI. By People.*

Artache is the studio's home base: every Claude Code project and session from every computer,
and the platforms, articles and works the studio makes, in one web app you can install on any device.

## Run it

```bash
npm install
npm run dev          # preview mode with sample data
```

To use real data, copy `.env.example` to `.env` and fill in the Supabase URL and publishable key.

## Sync Claude Code from a computer

1. In Artache, open **Settings** and create a token for the computer.
2. Download `artache-sync.mjs` from the same page (or use `cli/artache-sync.mjs`).
3. Run:

```bash
ARTACHE_URL=https://<ref>.supabase.co ARTACHE_TOKEN=art_... node artache-sync.mjs
node artache-sync.mjs --dry-run    # see what would be sent
```

Only metadata (titles, folders, branches, timestamps) is sent. Conversations stay on the computer.

## Stack

React + Vite + TypeScript (PWA) on Netlify, Supabase for Postgres, auth and the sync edge function,
GitHub for source and sign-in. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
