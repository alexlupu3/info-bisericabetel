import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SHORT_LINK_PREVIEW_MODES } from '@betel/shared'
import {
  api,
  type Language,
  type ShortLink,
  type ShortLinkPreviewMode,
  type ShortLinkPreviewReason,
} from '../../api/client'
import { useToast } from '../../context/ToastContext'

export const PREVIEW_MODE_LABELS: Record<ShortLinkPreviewMode, string> = {
  content: 'Conținutul (imagine și titlu)',
  destination: 'Pagina destinație',
}

const REASON_LABELS: Record<ShortLinkPreviewReason, string> = {
  'mode-destination': 'linkul este setat pe «Pagina destinație»',
  'no-title-no-image': 'conținutul nu are titlu și nici imagine',
  'item-missing': 'conținutul nu mai există',
}

const SHARING_DEBUGGER = 'https://developers.facebook.com/tools/debug/?q='

interface ModeRadiosProps {
  name: string
  value: ShortLinkPreviewMode
  onChange: (mode: ShortLinkPreviewMode) => void
  disabled?: boolean
  testId?: string
}

/** "Previzualizare la partajare" radio group, shared by the create form and the preview panel. */
export function PreviewModeRadios({ name, value, onChange, disabled, testId }: ModeRadiosProps) {
  return (
    <fieldset data-testid={testId} disabled={disabled} className="disabled:opacity-60">
      <legend className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
        Previzualizare la partajare
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {SHORT_LINK_PREVIEW_MODES.map(mode => (
          <label key={mode} className="inline-flex items-center gap-2 text-sm font-content cursor-pointer">
            <input
              type="radio"
              name={name}
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="accent-[var(--accent)]"
            />
            {PREVIEW_MODE_LABELS[mode]}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs font-content text-[var(--muted)]">
        Ce se afișează în WhatsApp, Messenger, Telegram etc. când linkul este trimis.
      </p>
    </fieldset>
  )
}

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return url }
}

interface Props {
  itemId: string
  link: ShortLink
  shortUrl: string
  /** Enabled languages; the selector only appears when there is more than one. */
  languages: Language[]
}

export default function ShortLinkPreviewPanel({ itemId, link, shortUrl, languages }: Props) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const defaultLocale = languages.find(l => l.isDefault)?.code ?? ''
  const [locale, setLocale] = useState('')
  const effectiveLocale = locale || defaultLocale

  const { data: preview, isLoading, isError } = useQuery({
    queryKey: ['short-link-preview', itemId, link.id, locale],
    queryFn: () => api.shortLinks.preview(itemId, link.id, locale || undefined),
  })

  const modeMut = useMutation({
    mutationFn: (previewMode: ShortLinkPreviewMode) =>
      api.shortLinks.update(itemId, link.id, { previewMode }),
    onSuccess: (_updated, previewMode) => {
      qc.setQueryData<{ shortLinks: ShortLink[] }>(['short-links', itemId], prev =>
        prev && { shortLinks: prev.shortLinks.map(l => (l.id === link.id ? { ...l, previewMode } : l)) })
      qc.invalidateQueries({ queryKey: ['short-links', itemId] })
      qc.invalidateQueries({ queryKey: ['short-link-preview', itemId, link.id] })
      toast('Previzualizare actualizată')
    },
    onError: (err: any) => {
      toast(err?.message ?? 'Eroare la actualizarea previzualizării', 'error')
      console.error(err)
    },
  })

  const mode = modeMut.isPending && modeMut.variables ? modeMut.variables : link.previewMode

  return (
    <div
      data-testid={`short-link-preview-${link.id}`}
      className="border-t border-[var(--border)] px-3 py-4 space-y-4 bg-[var(--surface)]"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr]">
        {/* Share card, styled like a chat link bubble */}
        <div>
          {isLoading && <p className="text-xs font-content text-[var(--muted)]">Se încarcă previzualizarea…</p>}
          {isError && <p className="text-xs font-content text-[var(--muted)]">Previzualizarea nu a putut fi încărcată.</p>}
          {preview && (preview.willPreview ? (
            <div
              data-testid="short-link-share-card"
              className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]"
            >
              <img
                src={preview.imageUrl}
                alt=""
                loading="lazy"
                className="block w-full aspect-[1.91/1] object-cover bg-[var(--border)]"
              />
              <div className="border-l-2 border-[var(--accent)] mx-2 my-2 pl-2 space-y-0.5">
                <p className="text-sm font-content font-bold leading-snug line-clamp-2">{preview.title}</p>
                {preview.description && (
                  <p className="text-xs font-content text-[var(--muted)] leading-snug line-clamp-2">
                    {preview.description}
                  </p>
                )}
                <p className="text-[10px] font-content uppercase tracking-widest text-[var(--muted)]">
                  {hostOf(preview.url)}
                </p>
              </div>
            </div>
          ) : (
            <div
              data-testid="short-link-preview-fallback"
              className="border border-dashed border-[var(--border)] px-3 py-3 text-xs font-content text-[var(--muted)]"
            >
              <p>Se va folosi previzualizarea paginii destinație</p>
              {preview.reason && <p className="mt-1 italic">— {REASON_LABELS[preview.reason]}</p>}
            </div>
          ))}
        </div>

        <div className="space-y-4 min-w-0">
          <PreviewModeRadios
            name={`preview-mode-${link.id}`}
            value={mode}
            onChange={m => { if (m !== link.previewMode) modeMut.mutate(m) }}
            disabled={modeMut.isPending}
            testId={`short-link-preview-mode-${link.id}`}
          />

          {languages.length > 1 && (
            <div>
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
                Limba previzualizării
              </label>
              <select
                value={effectiveLocale}
                onChange={e => setLocale(e.target.value)}
                data-testid="short-link-preview-locale"
                className="bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 text-sm font-content"
              >
                {languages.map(l => (
                  <option key={l.code} value={l.code}>{l.name} ({l.code.toUpperCase()})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5 text-xs font-content">
            <a
              href={`/s/${link.code}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`short-link-preview-page-${link.id}`}
              className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] hover:underline"
            >
              <ExternalLink size={12} /> Deschide pagina de previzualizare
            </a>
            <a
              href={`${SHARING_DEBUGGER}${encodeURIComponent(shortUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`short-link-sharing-debugger-${link.id}`}
              className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] hover:underline"
            >
              <ExternalLink size={12} /> Verifică în Meta Sharing Debugger
            </a>
          </div>
        </div>
      </div>

      <p className="text-xs font-content text-[var(--muted)] leading-relaxed">
        Aplicațiile păstrează previzualizările în cache. După ce schimbi imaginea sau titlul, folosește
        «Scrape Again» în Sharing Debugger sau trimite linkul cu <code>?lang=…</code> pentru a forța o nouă
        previzualizare.
      </p>
    </div>
  )
}
