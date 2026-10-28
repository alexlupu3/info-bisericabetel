import { useEffect } from 'react'
import { canonicalUrl } from '../initial-data'

/**
 * Keeps `document.title` and `<link rel="canonical">` in sync with the page (spec 03
 * §6.3 step 6). The server renders the same values for the first load; titles come
 * from `pageTitle()` in @betel/shared, so both sides agree.
 */
export function usePageMeta(title: string | null, path: string) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  useEffect(() => {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = canonicalUrl(path)
  }, [path])
}
