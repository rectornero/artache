# Artache: notes for Claude sessions

## Netlify credits (read before adding schedules, polling or deploys)

Every Netlify site Nero runs (artache, laventina, novaula, ai-ice, tzero) shares one
credit balance in the team "overgame-director" (Personal plan, 1,000 credits a month
plus bought packs). When it reaches zero, every site is paused. On 2026-10-25 one
every-minute job in Laventina that woke its database used almost a whole month.

Prices: production deploy 15 credits; compute (functions and database) 10 credits per
GB-hour; bandwidth 20 credits per GB; web requests 2 credits per 10,000; AI Gateway
180 credits per USD. Deploy Previews and branch deploys are free.

Rules:

- No scheduled job or polling loop touches the database on every run. Gate it on a
  cheap check first (for example a Blobs note saying when there is next work), or use
  delayed or event-driven scheduling instead of polling.
- Client polling is never faster than 60 seconds. Prefer refetching on focus or on a
  user action.
- No Netlify AI Gateway unless Nero approves it.
- Test on branches and Deploy Previews (free). Batch changes into as few production
  deploys (pushes or merges to `main`) as possible, and ask Nero before deploying while
  credits are low.
- Before adding any schedule, polling loop or production deploy, estimate its monthly
  credits and say the number.

Where Artache stands (2026-10-25): no scheduled or background functions, no client
polling, no AI Gateway. The one function `api` (1024 MB) runs only when someone calls
it. The database is Neon on Nero's own account, so its compute is billed by Neon, not
Netlify, but every call still wakes it from sleep. Production deploys are the main
Netlify cost here. `netlify.toml` has an `ignore` rule, so a push that only changes
Markdown, `docs/` or `cli/` skips the build and costs nothing. History sync runs from a
Claude Code `SessionEnd` hook, never on a timer.
