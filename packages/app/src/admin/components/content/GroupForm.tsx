import { useEffect, useState } from 'react'
import type { Site } from '../../api/client'
import { DialogBody, DialogFooter } from '../ui/Dialog'
import { isSameValue } from './form-model'

/**
 * Group title, site scope (empty = all sites) and the phone card-deck switch, shared by
 * "Grup nou" and "Editează grupul" (FR-114). Test ids are those of the former inline forms.
 */
export default function GroupForm({ groupId, initialTitle = '', initialSites = [], initialSectionPreview = true, availableSites, busy, error, onSubmit, onCancel, onDirtyChange }: {
  /** Present when editing. */
  groupId?: string
  initialTitle?: string
  initialSites?: string[]
  /** Phone section preview (card deck) for this group, on by default. */
  initialSectionPreview?: boolean
  availableSites: Site[]
  busy: boolean
  error: string
  onSubmit: (title: string, sites: string[], sectionPreview: boolean) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const isEdit = !!groupId
  const [title, setTitle] = useState(initialTitle)
  const [sites, setSites] = useState<string[]>(initialSites)
  const [sectionPreview, setSectionPreview] = useState(initialSectionPreview)
  const dirty = title !== initialTitle || !isSameValue(sites, initialSites) || sectionPreview !== initialSectionPreview
  useEffect(() => { onDirtyChange(dirty) }, [dirty])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSite = (slug: string) =>
    setSites(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])
  const canSubmit = !busy && title.trim() !== ''
  const submit = () => { if (canSubmit) onSubmit(title, sites, sectionPreview) }

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      data-testid={isEdit ? `edit-group-panel-${groupId}` : 'create-group-form'}
    >
      <DialogBody className="space-y-4">
        <div>
          <label htmlFor="group-form-title" className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
            Titlu grup *
          </label>
          <input
            id="group-form-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={isEdit ? undefined : 'ex. Anunțuri duminică'}
            data-testid={isEdit ? `edit-group-title-${groupId}` : 'create-group-title'}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            className="w-full bg-[var(--field)] px-3 py-2 text-base font-content"
          />
        </div>
        {availableSites.length > 0 && (
          <fieldset>
            <legend className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
              Locații <span className="normal-case text-[var(--muted)]">(gol = toate)</span>
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {availableSites.map(s => (
                <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sites.includes(s.slug)}
                    onChange={() => toggleSite(s.slug)}
                    data-testid={isEdit ? `edit-group-site-${s.slug}` : `create-group-site-${s.slug}`}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-xs font-content">{s.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sectionPreview}
            onChange={e => setSectionPreview(e.target.checked)}
            data-testid={isEdit ? 'edit-group-section-preview' : 'create-group-section-preview'}
            aria-describedby="group-form-section-preview-hint"
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span className="font-content">
            <span className="block text-sm">Pachet de carduri pe telefon</span>
            <span id="group-form-section-preview-hint" className="block text-xs text-[var(--muted)]">
              Pe telefon, un grup cu mai mult de 3 elemente apare ca un pachet prin care se glisează. Debifat, grupul se afișează mereu ca listă.
            </span>
          </span>
        </label>
        {error && <p role="alert" className="text-[var(--danger)] text-sm font-content">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={onCancel} disabled={busy} data-testid="group-dialog-cancel"
            className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40">
            Anulează
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit}
            data-testid={isEdit ? `edit-group-save-${groupId}` : 'create-group-submit'}
            className="px-5 py-2 bg-[var(--text)] text-[var(--bg)] text-xs tracking-widest uppercase font-content
                        hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors disabled:opacity-40 disabled:pointer-events-none">
            {busy ? 'Se salvează…' : isEdit ? 'Salvează' : 'Creează'}
          </button>
        </div>
      </DialogFooter>
    </div>
  )
}
