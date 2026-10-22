export type Me = { id: string; login: string; name: string | null; avatar_url: string | null }

// Preview mode runs on sample data whenever the API is missing or not yet
// configured (local `vite dev`, or a deploy before the database and GitHub
// sign-in are set up).
export let isDemo = true
export let me: Me | null = null

export async function detectMode() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' })
    if (!res.headers.get('content-type')?.includes('application/json')) return
    const body = (await res.json()) as { configured: boolean; user: Me | null }
    isDemo = !body.configured
    me = body.user
  } catch {
    isDemo = true
  }
}

// A tab opened while the site was unconfigured would otherwise stay in preview
// mode after setup, handing out tokens that never reach the server. Reload as
// soon as the site turns out to be live.
export async function reloadIfLive() {
  if (!isDemo) return false
  await detectMode()
  if (isDemo) return false
  window.location.reload()
  return true
}

export function watchMode() {
  const check = () => document.visibilityState === 'visible' && void reloadIfLive()
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', check)
}
