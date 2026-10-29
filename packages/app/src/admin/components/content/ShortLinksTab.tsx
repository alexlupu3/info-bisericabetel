import { useState } from 'react'
import { Copy, Trash2, Link, ChevronDown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ShortLink, type ShortLinkPreviewMode } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import type { Site } from '../../api/client'
import ShortLinkPreviewPanel, { PreviewModeRadios } from './ShortLinkPreviewPanel'

interface Props {
  itemId: string
  itemData: Record<string, unknown>
  availableSites: Site[]
}

/** Absolute short URL: the API's `url` (PUBLIC_BASE_URL) when present, else this origin. */
function shortUrlOf(link: ShortLink): string {
  return link.url ?? `${window.location.origin}/s/${link.code}`
}

export default function ShortLinksTab({ itemId, itemData, availableSites }: Props) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['short-links', itemId],
    queryFn: () => api.shortLinks.list(itemId),
  })

  const createMut = useMutation({
    mutationFn: ({ label, siteSlug, previewMode }: {
      label: string; siteSlug: string | null; previewMode: ShortLinkPreviewMode
    }) => api.shortLinks.create(itemId, label, siteSlug, previewMode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['short-links', itemId] })
      toast('Link scurt creat')
      setLabel('')
      setSiteSlug(null)
      setPreviewMode('content')
      setCreating(false)
    },
    onError: (err: any) => {
      toast(err?.message ?? 'Eroare la crearea linkului')
      console.error(err)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (shortLinkId: string) => api.shortLinks.remove(itemId, shortLinkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['short-links', itemId] })
      toast('Link șters')
    },
    onError: (err: any) => {
      toast(err?.message ?? 'Eroare la ștergerea linkului')
      console.error(err)
    },
  })

  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [siteSlug, setSiteSlug] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<ShortLinkPreviewMode>('content')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: langData } = useQuery({
    queryKey: ['admin-languages'],
    queryFn: () => api.languages.list(),
    staleTime: 60_000,
  })
  const enabledLanguages = (langData?.languages ?? []).filter(l => l.enabled)
  // "Copiază link (XX)" variants: only when more than one language is enabled.
  const variantLanguages = enabledLanguages.length > 1 ? enabledLanguages.filter(l => !l.isDefault) : []

  const submitCreate = () => createMut.mutate({ label: label.trim(), siteSlug, previewMode })

  // Only offer site override if the item has siteLinks defined
  const siteLinks = (itemData.siteLinks ?? {}) as Record<string, string>
  const sitesWithOverrides = availableSites.filter(s => siteLinks[s.slug])

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast('Link copiat')).catch(err => { toast('Eroare la copierea linkului'); console.error(err) })
  }

  const links: ShortLink[] = data?.shortLinks ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-content text-[var(--muted)] uppercase tracking-widest">
          {links.length === 0 ? 'Niciun link scurt' : `${links.length} link${links.length !== 1 ? '-uri scurte' : ' scurt'}`}
        </p>
        <button
          onClick={() => setCreating(v => !v)}
          className="px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          + Link nou
        </button>
      </div>

      {creating && (
        <div className="border border-[var(--border)] p-3 space-y-3 bg-[var(--surface)]">
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
              Etichetă *
            </label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="ex: WhatsApp Manastur, QR cod intrare"
              autoFocus
              data-testid="short-link-label-input"
              onKeyDown={e => { if (e.key === 'Enter' && label.trim()) submitCreate() }}
              className="w-full bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-base font-content"
            />
          </div>

          {sitesWithOverrides.length > 0 && (
            <div>
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
                Link destinație (opțional)
              </label>
              <select
                value={siteSlug ?? ''}
                onChange={e => setSiteSlug(e.target.value || null)}
                data-testid="short-link-site-select"
                className="w-full bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-base font-content"
              >
                <option value="">Link implicit</option>
                {sitesWithOverrides.map(s => (
                  <option key={s.slug} value={s.slug}>
                    {s.name} — {siteLinks[s.slug]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <PreviewModeRadios
            name="new-short-link-preview-mode"
            value={previewMode}
            onChange={setPreviewMode}
            testId="short-link-preview-mode"
          />

          <div className="flex gap-2">
            <button
              onClick={submitCreate}
              disabled={!label.trim() || createMut.isPending}
              data-testid="short-link-create-btn"
              className="px-3 py-1.5 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] transition-colors disabled:opacity-40"
            >
              {createMut.isPending ? 'Se creează…' : 'Creează'}
            </button>
            <button
              onClick={() => { setCreating(false); setLabel(''); setSiteSlug(null); setPreviewMode('content') }}
              className="px-3 py-1.5 text-xs tracking-widest uppercase font-content text-[var(--muted)]"
            >
              Anulează
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-xs font-content text-[var(--muted)]">Se încarcă…</p>}

      {links.length > 0 && (
        <div className="space-y-2">
          {links.map(link => {
            const url = shortUrlOf(link)
            const siteName = link.siteSlug
              ? availableSites.find(s => s.slug === link.siteSlug)?.name ?? link.siteSlug
              : null
            const expanded = expandedId === link.id
            return (
              <div
                key={link.id}
                className="border border-[var(--border)] text-sm font-content"
                data-testid={`short-link-row-${link.id}`}
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <Link size={13} className="flex-shrink-0 text-[var(--muted)]" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{link.label}</p>
                    <p className="text-xs text-[var(--muted)] truncate">
                      {url}{siteName ? ` · ${siteName}` : ''}{link.previewMode === 'destination' ? ' · destinație' : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-[var(--muted)] tabular-nums">
                    {link.clickCount.toLocaleString('ro-RO')} click{link.clickCount !== 1 ? '-uri' : ''}
                  </span>
                  <button
                    onClick={() => setExpandedId(expanded ? null : link.id)}
                    aria-expanded={expanded}
                    data-testid={`short-link-preview-toggle-${link.id}`}
                    className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 border text-[10px] tracking-widest uppercase
                                transition-colors ${expanded
                                  ? 'border-[var(--accent)] text-[var(--accent)]'
                                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                  >
                    Previzualizare
                    <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    onClick={() => copyLink(url)}
                    title="Copiază link"
                    aria-label="Copiază link"
                    className="flex-shrink-0 text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
                  >
                    <Copy size={13} />
                  </button>
                  {variantLanguages.map(l => {
                    const name = `Copiază link (${l.code.toUpperCase()})`
                    return (
                      <button
                        key={l.code}
                        onClick={() => copyLink(`${url}?lang=${encodeURIComponent(l.code)}`)}
                        title={name}
                        aria-label={name}
                        data-testid={`short-link-copy-${l.code}-${link.id}`}
                        className="flex-shrink-0 text-[10px] tracking-widest uppercase text-[var(--muted)]
                                   hover:text-[var(--text)] transition-colors p-1"
                      >
                        {l.code}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => {
                      if (confirm(`Ștergi link-ul "${link.label}"?`)) deleteMut.mutate(link.id)
                    }}
                    title="Șterge link"
                    aria-label="Șterge link"
                    data-testid={`short-link-delete-${link.id}`}
                    className="flex-shrink-0 text-[var(--muted)] hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {expanded && (
                  <ShortLinkPreviewPanel
                    itemId={itemId}
                    link={link}
                    shortUrl={url}
                    languages={enabledLanguages}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
