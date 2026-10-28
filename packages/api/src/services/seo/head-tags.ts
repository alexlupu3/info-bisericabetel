// Extension hook for the server-rendered <head> (spec 03 §7 "Provides"): other
// specs contribute tags per page without touching the renderer — e.g. spec 02's
// per-site `<link rel="alternate" type="application/rss+xml">`.
//
// A contributor returns complete, already-escaped HTML tags for the page; they are
// inserted before `</head>` after this spec's own tags. Use escapeHtml() from
// ./escape.ts for any value that comes from data.

import type { PageModel } from './page-model.js'

export type HeadTagContributor = (page: PageModel) => string[]

const contributors: HeadTagContributor[] = []

/** Registers a contributor of extra <head> tags; returns a function that unregisters it. */
export function registerHeadTags(fn: HeadTagContributor): () => void {
  contributors.push(fn)
  return () => {
    const i = contributors.indexOf(fn)
    if (i >= 0) contributors.splice(i, 1)
  }
}

/** Tags from every registered contributor, in registration order. A failing contributor is skipped. */
export function collectHeadTags(page: PageModel): string[] {
  const tags: string[] = []
  for (const fn of contributors) {
    try {
      tags.push(...fn(page))
    } catch (err) {
      console.error('registerHeadTags contributor failed:', err)
    }
  }
  return tags
}
