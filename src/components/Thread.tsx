import { useState } from 'react'
import { sendReply } from '../lib/api'
import { timeAgo } from '../lib/hooks'
import type { Reply } from '../lib/types'
import { Icon } from './Icon'

// The conversation under a brief or an update: the project's Claude on one
// side, the studio (you) on the other.
export function Thread({ replies, target, onChange, startOpen = false }: {
  replies: Reply[]
  target: { brief_id?: string; post_id?: string }
  onChange: () => void
  startOpen?: boolean
}) {
  const [writing, setWriting] = useState(startOpen)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    await sendReply(target, text.trim()).finally(() => setSending(false))
    setText('')
    setWriting(false)
    onChange()
  }

  return (
    <div className="thread">
      {replies.length > 0 && (
        <ul className="thread-list">
          {replies.map((r) => (
            <li key={r.id} className={`thread-item from-${r.source === 'web' ? 'studio' : 'project'}`}>
              <p className="thread-who">
                {r.source !== 'web' && <Icon name="star" size={10} />}
                {r.source === 'web' ? 'Studio' : (r.author ?? 'Claude')}
                <span className="muted">{timeAgo(r.created_at)}</span>
              </p>
              <p className="thread-body">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {writing ? (
        <form className="thread-form" onSubmit={send}>
          <textarea
            rows={2}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply to the project. Its Claude reads this in its next session."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e)
            }}
          />
          <div className="thread-actions">
            <button type="button" className="btn btn-small" onClick={() => setWriting(false)}>Cancel</button>
            <button className="btn btn-small btn-primary" disabled={sending || !text.trim()}>Send</button>
          </div>
        </form>
      ) : (
        <button className="link link-btn thread-open" onClick={() => setWriting(true)}>Reply</button>
      )}
    </div>
  )
}
