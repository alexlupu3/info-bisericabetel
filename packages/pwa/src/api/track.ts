const SESSION_MS = 30 * 60 * 1000

export function track(
  type: 'site_visit' | 'link_click',
  site: string | null,
  itemId?: string,
  url?: string,
) {
  if (type === 'site_visit') {
    const key = `betel-track-visit-${site ?? 'all'}`
    const last = Number(localStorage.getItem(key) ?? 0)
    if (Date.now() - last < SESSION_MS) return
    localStorage.setItem(key, String(Date.now()))
  }

  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, site, itemId, url }),
  }).catch(() => {})
}
