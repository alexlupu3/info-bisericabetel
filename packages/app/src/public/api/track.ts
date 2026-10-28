import { BOT_USER_AGENT_PATTERN } from '@betel/shared'

const SESSION_MS = 30 * 60 * 1000

/**
 * Crawlers and automated browsers are not visitors (FR-074): Googlebot runs JavaScript,
 * so without this check every crawl would count as a `site_visit`.
 */
export function isAutomatedVisitor(nav: Pick<Navigator, 'userAgent' | 'webdriver'> = navigator): boolean {
  return nav.webdriver === true || BOT_USER_AGENT_PATTERN.test(nav.userAgent ?? '')
}

export function track(
  type: 'site_visit' | 'link_click',
  site: string | null,
  itemId?: string,
  url?: string,
) {
  if (type === 'site_visit') {
    if (isAutomatedVisitor()) return
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
