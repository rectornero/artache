export type Me = { id: string; login: string; name: string | null; avatar_url: string | null }

// Preview mode runs on sample data whenever the API is missing or not yet
// configured (local `vite dev`, or a deploy before Netlify DB and GitHub
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
