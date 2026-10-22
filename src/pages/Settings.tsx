import { useState } from 'react'
import { Icon } from '../components/Icon'
import { ErrorNote, Loading, PageHeader } from '../components/ui'
import { createToken, listMachines, listTokens, revokeToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo, useAsync } from '../lib/hooks'
import { isDemo, reloadIfLive } from '../lib/mode'

export function Settings() {
  const { name, login, signOut } = useAuth()
  const { data, error, loading, reload } = useAsync(() => Promise.all([listTokens(), listMachines()]))
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (await reloadIfLive()) return
    setFresh(await createToken(label || 'my computer'))
    setLabel('')
    reload()
  }

  const url = window.location.origin
  const token = fresh ?? 'art_…'
  const syncCommand = `ARTACHE_URL=${url} ARTACHE_TOKEN=${token} node artache-sync.mjs`
  const mcpCommand = `claude mcp add --transport http --scope user artache ${url}/api/mcp --header "Authorization: Bearer ${token}"`
  const allowJson = `{ "permissions": { "allow": ["mcp__artache"] } }`
  const hookJson = `{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command", "command": "node ~/artache-sync.mjs inbox" }] }] } }`
  const postCommand = `node artache-sync.mjs post "Shipped the new editor" --kind release --url https://…`

  return (
    <div className="page narrow">
      <PageHeader kicker="Your studio" title="Settings" />

      <section className="panel">
        <header className="panel-head"><h2>Account</h2></header>
        <div className="row-between">
          <div>
            <p className="strong">{name}</p>
            <p className="muted">{isDemo ? 'Preview mode' : `@${login}`}</p>
          </div>
          {!isDemo && <button className="btn" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Access tokens</h2></header>
        <p className="muted">
          One token per computer. Claude Code uses it to post updates here, and the sync command uses it to send your
          session history. The commands below fill in a new token as soon as you create one.
        </p>
        <form className="inline-form" onSubmit={create}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Computer name, e.g. studio-mac" />
          <button className="btn btn-primary">Create token</button>
        </form>
        {fresh && (
          <div className="token-reveal">
            <p className="strong">Copy this token now. It won't be shown again.</p>
            <code className="mono">{fresh}</code>
          </div>
        )}
        {error ? <ErrorNote message={error} /> : loading || !data ? <Loading /> : (
          <>
            <h3 className="subhead">Tokens</h3>
            <ul className="plain-list">
              {data[0].map((t) => (
                <li key={t.id} className={t.revoked_at ? 'revoked' : ''}>
                  <span className="strong">{t.label}</span>
                  <span className="mono muted">{t.token_hint}</span>
                  <span className="muted push">{t.revoked_at ? 'revoked' : `used ${timeAgo(t.last_used_at)}`}</span>
                  {!t.revoked_at && (
                    <button className="btn btn-small" onClick={() => revokeToken(t.id).then(reload)}>Revoke</button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Connect Claude Code</h2></header>
        <p className="muted">
          Connect Claude Code once per computer and every project you build with it picks up your briefs, posts progress
          to your Updates feed and adds platforms, articles and works to the Studio, without you copying anything over.
        </p>
        <ol className="steps">
          <li>
            Add Artache to Claude Code (needs a token from above):
            <CopyBlock text={mcpCommand} />
          </li>
          <li>
            Let Claude use it without asking each time, by adding this to <code className="mono">~/.claude/settings.json</code>:
            <CopyBlock text={allowJson} />
          </li>
          <li>
            Optional: show waiting briefs automatically when a session starts, by adding this hook to
            <code className="mono">~/.claude/settings.json</code> (needs the sync tool saved as <code className="mono">~/artache-sync.mjs</code> and <code className="mono">~/.artache.json</code>):
            <CopyBlock text={hookJson} />
          </li>
          <li>
            Tell Claude when to post, by adding this to <code className="mono">~/.claude/CLAUDE.md</code> (all projects)
            or a project's own <code className="mono">CLAUDE.md</code>:
            <CopyBlock text={CLAUDE_MD} />
          </li>
        </ol>
        <p className="muted">
          Scripts and CI jobs can post too, with the sync tool below: <code className="mono">{postCommand}</code>
        </p>
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Sync Claude Code history</h2></header>
        <p className="muted">
          Each computer keeps its Claude Code history locally. The sync command reads it and sends only titles, folders,
          branches and timestamps here. Your conversations stay on your machine.
        </p>
        <ol className="steps">
          <li>
            Download <a href="/artache-sync.mjs" download className="link">artache-sync.mjs</a> (needs Node 18 or newer).
          </li>
          <li>
            Run it from a terminal with the computer's token:
            <CopyBlock text={syncCommand} />
          </li>
          <li>To keep it fresh, schedule it (cron, launchd or Task Scheduler) every 15 minutes.</li>
        </ol>
        {data && (
          <>
            <h3 className="subhead">Machines</h3>
            <ul className="plain-list">
              {data[1].map((m) => (
                <li key={m.id}>
                  <Icon name="laptop" size={16} />
                  <span className="strong">{m.name}</span>
                  <span className="muted">{m.platform}</span>
                  <span className="muted push">seen {timeAgo(m.last_seen_at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

// Kept in step with the "Posting updates to Artache" guide.
const CLAUDE_MD = `## Artache
This studio tracks its work in Artache. The \`artache\` MCP tools talk to it.
- At the start of a session, call \`artache_inbox\` with this repo's GitHub name to see briefs and studio replies for this project. Briefs come first: accept one with \`artache_update_brief\` before starting, say what blocks you in a reply, and mark it done with a \`result_url\` when finished. Answer studio replies with \`artache_reply\`.
- After meaningful progress (a feature or fix merged, a release or deploy, a milestone, a decision, or a question the team must answer), post one update with \`artache_post_update\` (with \`brief_id\` when it delivers a brief). Use this repo's GitHub name ("owner/repo") as \`project\`, or the folder name if there is no repo.
- Write the title for someone who didn't see the session (under 100 characters). In the body: what changed, why it matters, what's next. Add a \`url\` to the PR, deploy or doc when there is one.
- Use kind \`release\` for something shipped, \`milestone\` for a big step, \`question\` when you need a human decision, \`note\` for context, \`update\` otherwise.
- Don't post for trivial edits, failed attempts or work in progress with nothing to show. One update per meaningful result; check \`artache_recent_updates\` if unsure whether it was already posted.
- When you create or publish a platform, article or other work, record it with \`artache_upsert_work\` and a stable \`key\` like "owner/repo:article-slug", so later changes update the same item.`

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <pre className="code">
      <code>{text}</code>
      <button
        className="icon-btn copy"
        onClick={() => {
          navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        aria-label={copied ? 'Copied' : 'Copy'}
        title={copied ? 'Copied' : 'Copy'}
      >
        <Icon name={copied ? 'check' : 'copy'} size={15} />
      </button>
    </pre>
  )
}
