import { useState } from 'react'
import { Icon } from '../components/Icon'
import { ErrorNote, Loading, PageHeader } from '../components/ui'
import { createToken, listMachines, listTokens, revokeToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo, useAsync } from '../lib/hooks'
import { isDemo, supabaseUrl } from '../lib/supabase'

export function Settings() {
  const { name, session, signOut } = useAuth()
  const { data, error, loading, reload } = useAsync(() => Promise.all([listTokens(), listMachines()]))
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setFresh(await createToken(label || 'my computer'))
    setLabel('')
    reload()
  }

  const url = supabaseUrl || 'https://<project>.supabase.co'
  const command = `ARTACHE_URL=${url} ARTACHE_TOKEN=${fresh ?? 'art_…'} node artache-sync.mjs`

  return (
    <div className="page narrow">
      <PageHeader kicker="Your studio" title="Settings" />

      <section className="panel">
        <header className="panel-head"><h2>Account</h2></header>
        <div className="row-between">
          <div>
            <p className="strong">{name}</p>
            <p className="muted">{isDemo ? 'Preview mode' : session?.user.email}</p>
          </div>
          {!isDemo && <button className="btn" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Sync Claude Code</h2></header>
        <p className="muted">
          Each computer keeps its Claude Code history locally. The sync command reads it and sends only titles, folders,
          branches and timestamps here. Your conversations stay on your machine.
        </p>
        <ol className="steps">
          <li>Create a token for the computer below.</li>
          <li>
            Download <a href="/artache-sync.mjs" download className="link">artache-sync.mjs</a> (needs Node 18 or newer).
          </li>
          <li>
            Run it from a terminal:
            <pre className="code">
              <code>{command}</code>
              <button
                className="icon-btn copy"
                onClick={() => {
                  navigator.clipboard.writeText(command)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
                aria-label="Copy command"
              >
                <Icon name="copy" size={15} />
              </button>
            </pre>
            {copied && <span className="muted">Copied.</span>}
          </li>
          <li>To keep it fresh, schedule it (cron, launchd or Task Scheduler) every 15 minutes.</li>
        </ol>

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
