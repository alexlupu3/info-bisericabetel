import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Site } from '../../api/client'
import type { FormData } from './form-model'

// ── Site link overrides ────────────────────────────────────────────────────────

export default function SiteLinkOverrides({ form, set, availableSites }: {
  form: FormData
  set: (patch: Partial<FormData>) => void
  availableSites: Site[]
}) {
  if (!form.link) return null

  const relevantSites = form.sites.length > 0
    ? availableSites.filter(s => form.sites.includes(s.slug))
    : availableSites

  if (relevantSites.length === 0) return null

  const hasOverrides = relevantSites.some(s => form.siteLinks[s.slug])
  const [expanded, setExpanded] = useState(hasOverrides)

  const setSiteLink = (slug: string, url: string) =>
    set({ siteLinks: { ...form.siteLinks, [slug]: url } })

  return (
    <div>
      <button
        type="button"
        data-testid="site-link-overrides-toggle"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Link-uri per locație
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 pl-4 border-l-2 border-[var(--border)]">
          {relevantSites.map(s => (
            <div key={s.slug} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.accent }}
              />
              <label className="text-xs font-content text-[var(--muted)] w-20 flex-shrink-0">{s.name}</label>
              <input
                data-testid={`site-link-input-${s.slug}`}
                value={form.siteLinks[s.slug] ?? ''}
                onChange={e => setSiteLink(s.slug, e.target.value)}
                placeholder="Folosește link-ul implicit"
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 text-base font-content"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

