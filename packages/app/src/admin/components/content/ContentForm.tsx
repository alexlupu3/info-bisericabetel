import { useState, useEffect } from 'react'
import { Link2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LOCATION_MAX_LENGTH, LOCATION_SOFT_LENGTH } from '@betel/shared'
import { api, type ContentItem, type Group, type Site } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import ShortLinksTab from './ShortLinksTab'
import ImagePicker from './ImagePicker'
import SiteLinkOverrides from './SiteLinkOverrides'
import { CONTENT_TYPES, formToPayload, itemToForm, isSameValue, type FormData } from './form-model'
import { DialogBody, DialogFooter } from '../ui/Dialog'

// ── Translatable fields per content type ──────────────────────────────────────

const TRANSLATABLE_FIELDS: Record<string, Array<{ key: string; label: string; multiline?: boolean; maxLength?: number }>> = {
  card: [
    { key: 'title', label: 'Titlu' },
    { key: 'description', label: 'Descriere', multiline: true },
    { key: 'cta', label: 'Text buton' },
    { key: 'location', label: 'Loc de desfășurare', maxLength: LOCATION_MAX_LENGTH },
  ],
  richtext: [
    { key: 'title', label: 'Titlu' },
    { key: 'body', label: 'Conținut', multiline: true },
  ],
  poster: [
    { key: 'name', label: 'Nume' },
  ],
  video: [
    { key: 'title', label: 'Titlu' },
  ],
}

// Live length counter for the location input (FR-091): UTF-16 code units, the same
// measure as maxLength and the API; the accent and hint only advise above the soft limit.
function LocationCounter({ value, testId }: { value: string; testId: string }) {
  const long = value.length > LOCATION_SOFT_LENGTH
  return (
    <p className="mt-1 text-xs font-content">
      <span data-testid={testId} className={long ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}>
        {value.length} / {LOCATION_MAX_LENGTH}
      </span>
      {long && (
        <span data-testid={testId.replace(/counter$/, 'soft-hint')} className="ml-2 text-[var(--muted)]">
          Peste {LOCATION_SOFT_LENGTH} de caractere, textul se întinde pe două rânduri pe telefon.
        </span>
      )}
    </p>
  )
}

// Translation values that count: empty inputs are not saved (and are not a change).
function nonEmpty(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v))
}

const LOCALE_IMAGE_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  card:   [{ key: 'thumbnail', label: 'Miniatură (per limbă)' }],
  poster: [{ key: 'imageUrl', label: 'Imagine (per limbă)' }],
}

// ── Content form ───────────────────────────────────────────────────────────────

/**
 * The content item form, hosted by `ContentDialog` (spec 09): it renders its scrolling
 * body and its footer actions into the dialog, and reports whether it has unsaved changes
 * (the Romanian form or a translation draft, compared with the values it opened with) and
 * whether a save is in flight.
 */
export default function ContentForm({ item, groups, availableSites, defaultGroupId, onCancel, onSaved, onDirtyChange, onBusyChange }: {
  item?: ContentItem | null
  groups: Group[]
  availableSites: Site[]
  defaultGroupId?: string
  /** "Anulează" / "Închide": the dialog decides whether to ask first. */
  onCancel: () => void
  /** A Romanian create or edit was saved; `saved` is the API's item. */
  onSaved: (saved: ContentItem | null) => void
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'edit' | 'short-links'>('edit')
  const [initialForm] = useState<FormData>(() => {
    const base = itemToForm(item)
    if (!item && defaultGroupId) return { ...base, groupId: defaultGroupId }
    return base
  })
  const [form, setForm] = useState<FormData>(initialForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Translation mode state
  const [transLocale, setTransLocale] = useState('')  // '' = editing original
  const [transForm, setTransForm] = useState<Record<string, string>>({})
  // The translation values as loaded (or last saved): a draft differs from them.
  const [transBaseline, setTransBaseline] = useState<Record<string, string>>({})

  // Fetch available languages (non-default, enabled)
  const { data: langData } = useQuery({
    queryKey: ['admin-languages'],
    queryFn: () => api.languages.list(),
    staleTime: 60_000,
  })

  // Fetch existing translations for this item
  const qc = useQueryClient()
  const { data: existingTranslations } = useQuery({
    queryKey: ['content-translations', item?.id],
    queryFn: () => api.content.listTranslations(item!.id),
    enabled: !!item,
  })

  const nonDefaultLanguages = (langData?.languages ?? []).filter(l => !l.isDefault && l.enabled)
  const isEdit = !!item
  const isTranslating = isEdit && transLocale !== ''

  // Populate transForm when locale changes
  useEffect(() => {
    if (!transLocale || !existingTranslations) {
      setTransForm({})
      setTransBaseline({})
      return
    }
    const allFields = [
      ...(TRANSLATABLE_FIELDS[form.type] ?? []),
      ...(LOCALE_IMAGE_FIELDS[form.type] ?? []),
    ]
    const existing = existingTranslations.translations.find(t => t.locale === transLocale)
    const sourceData = (existing?.data ?? {}) as Record<string, string>
    const populated: Record<string, string> = {}
    for (const f of allFields) {
      populated[f.key] = sourceData[f.key] ?? ''
    }
    setTransForm(populated)
    setTransBaseline(populated)
  }, [transLocale, existingTranslations, form.type])

  // Dirty = differs from the opening values (typing and reverting is not a change; BR-060).
  const formDirty = !isSameValue(formToPayload(form), formToPayload(initialForm))
  const transDirty = isTranslating && !isSameValue(nonEmpty(transForm), nonEmpty(transBaseline))
  const dirty = formDirty || transDirty
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onBusyChange?.(busy) }, [busy])     // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<FormData>) => setForm(f => ({ ...f, ...patch }))
  const toggleSite = (slug: string) =>
    set({ sites: form.sites.includes(slug) ? form.sites.filter(s => s !== slug) : [...form.sites, slug] })

  const setTrans = (key: string, value: string) =>
    setTransForm(prev => ({ ...prev, [key]: value }))

  const submit = async () => {
    setBusy(true); setError('')
    try {
      if (isTranslating) {
        // Filter out empty values
        const data = nonEmpty(transForm)
        await api.content.upsertTranslation(item!.id, transLocale, data)
        // The dialog stays open so more locales can be filled in (D-5); the saved values
        // become the new baseline, so the form is clean again.
        setTransBaseline(transForm)
        qc.invalidateQueries({ queryKey: ['content-translations', item!.id] })
        toast('Traducere salvată')
      } else {
        const payload = formToPayload(form)
        let saved: ContentItem | null
        if (item) { saved = await api.content.update(item.id, payload); toast('Salvat') }
        else       { saved = await api.content.create(payload); toast('Element creat') }
        setBusy(false)
        onSaved(saved ?? null)
        return
      }
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  // Get the original Romanian value for a field (used as placeholder in translation mode)
  const getOriginalValue = (key: string): string => {
    const d = (item?.data ?? {}) as Record<string, string>
    return d[key] ?? ''
  }

  return (
    <div className="flex flex-col flex-1 min-h-0"
         data-testid={isEdit ? 'edit-form' : 'create-form'}>
      {/* Tab bar — only shown when editing an existing item */}
      {isEdit && (
        <div className="flex theme-divider px-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('edit')}
            data-testid="tab-edit"
            className={`px-4 py-2.5 text-xs tracking-widest uppercase font-content transition-colors
              ${activeTab === 'edit'
                ? 'theme-selected text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
          >
            Editează
          </button>
          <button
            onClick={() => setActiveTab('short-links')}
            data-testid="tab-short-links"
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs tracking-widest uppercase font-content transition-colors
              ${activeTab === 'short-links'
                ? 'theme-selected text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
          >
            <Link2 size={12} />
            Link-uri scurte
          </button>
        </div>
      )}

      {/* Short links tab */}
      {isEdit && activeTab === 'short-links' && (
        <>
          <DialogBody>
            <ShortLinksTab
              itemId={item!.id}
              itemData={item!.data}
              availableSites={availableSites}
            />
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onCancel} data-testid="content-dialog-cancel"
              className="ml-auto px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Închide
            </button>
          </DialogFooter>
        </>
      )}

      {/* Edit tab (or create form) */}
      {(!isEdit || activeTab === 'edit') && (<>
      <DialogBody className="space-y-4">

      {/* Language selector — only in edit mode and when non-default languages exist */}
      {isEdit && nonDefaultLanguages.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Limbă</label>
            <select
              value={transLocale}
              onChange={e => setTransLocale(e.target.value)}
              data-testid="translation-locale-select"
              className="bg-[var(--field)] px-3 py-2 text-base font-content">
              <option value="">Română (original)</option>
              {nonDefaultLanguages.map(l => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>
          {/* Translation status badges */}
          {existingTranslations && existingTranslations.translations.length > 0 && (
            <div className="flex items-center gap-1.5 pt-4">
              <span className="text-xs text-[var(--muted)] font-content">Traduceri:</span>
              {existingTranslations.translations.map(t => (
                <span
                  key={t.locale}
                  className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-content ${
                    t.locale === transLocale
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'bg-[var(--surface)] theme-card text-[var(--muted)]'
                  }`}>
                  {t.locale.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[var(--danger)] text-sm font-content">{error}</p>}

      {/* Translation mode — show translatable text fields and optional locale-specific images */}
      {isTranslating ? (
        <div className="space-y-4">
          {(TRANSLATABLE_FIELDS[form.type] ?? []).map(field => (
            <div key={field.key}>
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
                {field.label}
              </label>
              {field.multiline ? (
                <textarea
                  value={transForm[field.key] ?? ''}
                  onChange={e => setTrans(field.key, e.target.value)}
                  placeholder={getOriginalValue(field.key)}
                  rows={field.key === 'body' ? 5 : 3}
                  data-testid={`trans-${field.key}-input`}
                  className="w-full bg-[var(--field)] px-3 py-2 text-base font-content placeholder:text-[var(--muted)]/40" />
              ) : (
                <input
                  value={transForm[field.key] ?? ''}
                  onChange={e => setTrans(field.key, e.target.value)}
                  placeholder={getOriginalValue(field.key)}
                  maxLength={field.maxLength}
                  data-testid={`trans-${field.key}-input`}
                  className="w-full bg-[var(--field)] px-3 py-2 text-base font-content placeholder:text-[var(--muted)]/40" />
              )}
              {field.maxLength && <LocationCounter value={transForm[field.key] ?? ''} testId={`trans-${field.key}-counter`} />}
            </div>
          ))}
          {(LOCALE_IMAGE_FIELDS[form.type] ?? []).map(field => (
            <ImagePicker
              key={field.key}
              label={field.label}
              value={transForm[field.key] ?? ''}
              onChange={url => setTrans(field.key, url)}
              testId={`trans-${field.key}-input`}
            />
          ))}
        </div>
      ) : (<>
        {/* Original form — unchanged */}
        {!isEdit && (
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Tip</label>
            <select value={form.type} onChange={e => set({ type: e.target.value })}
              data-testid="create-type-select"
              className="bg-[var(--field)] px-3 py-2 text-base font-content">
              {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {(form.type === 'richtext' || form.type === 'card') && (
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
              Titlu{form.type === 'card' ? ' *' : ' (opțional)'}
            </label>
            <input value={form.title} onChange={e => set({ title: e.target.value })}
              data-testid="create-title-input"
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
        )}

        {form.type === 'richtext' && (
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Conținut Markdown *</label>
            <textarea value={form.body} onChange={e => set({ body: e.target.value })}
              data-testid="create-body-input" rows={5}
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
        )}

        {form.type === 'card' && (<>
          <ImagePicker
            label="Miniatură (opțional)"
            value={form.thumbnail}
            onChange={url => set({ thumbnail: url })}
            testId="create-thumbnail-input"
          />
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Descriere</label>
            <textarea value={form.description} onChange={e => set({ description: e.target.value })}
              data-testid="create-description-input" rows={3}
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Link CTA</label>
              <input value={form.link} onChange={e => set({ link: e.target.value })} placeholder="https://..."
                data-testid="create-link-input"
                className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
            </div>
            <div className="flex-1">
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Text buton (opțional)</label>
              <input value={form.cta} onChange={e => set({ cta: e.target.value })} placeholder="ex: Înregistrează-te"
                data-testid="create-cta-input"
                className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
            </div>
          </div>
          <SiteLinkOverrides form={form} set={set} availableSites={availableSites} />
        </>)}

        {form.type === 'poster' && (<>
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Nume (admin)</label>
            <input value={form.name} onChange={e => set({ name: e.target.value })}
              placeholder="ex: Poster Paște 2025"
              data-testid="create-poster-name-input"
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
          <ImagePicker
            label="Imagine *"
            value={form.imageUrl}
            onChange={url => set({ imageUrl: url })}
            testId="create-image-url-input"
          />
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Link (opțional)</label>
            <input value={form.link} onChange={e => set({ link: e.target.value })} placeholder="https://..."
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
          <SiteLinkOverrides form={form} set={set} availableSites={availableSites} />
        </>)}

        {form.type === 'video' && (<>
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">URL YouTube *</label>
            <input value={form.url} onChange={e => set({ url: e.target.value })}
              placeholder="https://youtu.be/... sau ID"
              data-testid="create-url-input"
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Titlu (opțional)</label>
            <input value={form.title} onChange={e => set({ title: e.target.value })}
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
        </>)}

        {/* Shared date fields — available for all content types */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Dată (opțional)</label>
            <input type="date" value={form.date}
              onChange={e => {
                const v = e.target.value
                // An end date the new start date would pass is dropped, never kept as a
                // reversed range (the API rejects endDate < startDate).
                const endDate = v && form.endDate && form.endDate >= v ? form.endDate : ''
                set({
                  date: v,
                  endDate,
                  startTime: v && (!endDate || endDate === v) ? form.startTime : '',
                })
              }}
              data-testid="create-date-input"
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
          </div>
          {form.date && (
            <div className="flex-1 min-w-[10rem]">
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Până la (opțional)</label>
              <input type="date" value={form.endDate} min={form.date}
                onChange={e => {
                  const v = e.target.value
                  set({ endDate: v, startTime: !v || v === form.date ? form.startTime : '' })
                }}
                data-testid="create-end-date-input"
                className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
              {form.endDate && form.endDate !== form.date && (
                <p data-testid="start-time-multiday-hint" className="mt-1 text-xs text-[var(--muted)] font-content">
                  Ora de început se poate seta doar pentru evenimente de o singură zi.
                </p>
              )}
            </div>
          )}
          {form.date && (!form.endDate || form.endDate === form.date) && (
            <div className="flex-1 min-w-[10rem]">
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Ora de început (opțional)</label>
              <input type="time" step="60" value={form.startTime} onChange={e => set({ startTime: e.target.value })}
                data-testid="create-start-time-input"
                className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
              <p className="mt-1 text-xs text-[var(--muted)] font-content">Ora României, doar pentru evenimente de o singură zi.</p>
            </div>
          )}
        </div>

        {/* Event location (spec 07): cards only, directly below the dates row */}
        {form.type === 'card' && (
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Loc de desfășurare (opțional)</label>
            <input value={form.location} onChange={e => set({ location: e.target.value })}
              maxLength={LOCATION_MAX_LENGTH} placeholder="ex: Sala mare, etaj 1"
              data-testid="create-location-input"
              className="w-full bg-[var(--field)] px-3 py-2 text-base font-content" />
            <LocationCounter value={form.location} testId="create-location-counter" />
          </div>
        )}

        <div className="space-y-3">
          <label className="flex items-center gap-1.5 cursor-pointer" title="Ascunde din vizualizarea tuturor locațiilor">
            <input type="checkbox" checked={form.exclusiveSite !== null}
              onChange={e => set(e.target.checked
                ? { exclusiveSite: availableSites[0]?.slug ?? null }
                : { exclusiveSite: null })}
              data-testid="exclusive-toggle"
              className="accent-[var(--accent)]" />
            <span className="text-xs tracking-widest uppercase text-[var(--muted)] font-content">
              Exclusiv unei locații <span className="normal-case text-[var(--muted)]">(ascunde din vizualizarea tuturor locațiilor)</span>
            </span>
          </label>

          {form.exclusiveSite === null ? (
            <div>
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
                Locații <span className="normal-case text-[var(--muted)]">(gol = toate)</span>
              </label>
              <div className="flex gap-4">
                {availableSites.map(s => (
                  <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.sites.includes(s.slug)}
                      onChange={() => toggleSite(s.slug)}
                      data-testid={`site-check-${s.slug}`}
                      className="accent-[var(--accent)]" />
                    <span className="text-xs font-content">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
                Locație <span className="normal-case text-[var(--muted)]">(obligatoriu)</span>
              </label>
              <div className="flex gap-4">
                {availableSites.map(s => (
                  <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="exclusive-site"
                      checked={form.exclusiveSite === s.slug}
                      onChange={() => set({ exclusiveSite: s.slug })}
                      data-testid={`exclusive-site-radio-${s.slug}`}
                      className="accent-[var(--accent)]" />
                    <span className="text-xs font-content">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </>)}

      </DialogBody>
      <DialogFooter>
        {isTranslating && existingTranslations?.translations.some(t => t.locale === transLocale) && (
          <button type="button" onClick={async () => {
            if (!confirm('Sigur vrei să ștergi această traducere?')) return
            setBusy(true)
            try {
              await api.content.removeTranslation(item!.id, transLocale)
              qc.invalidateQueries({ queryKey: ['content-translations', item!.id] })
              toast('Traducere ștearsă')
            } catch (e: any) { setError(e.message) } finally { setBusy(false) }
          }}
          disabled={busy}
          className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--danger)] hover:opacity-80 transition-colors disabled:opacity-40">
            Șterge traducerea
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={onCancel} disabled={busy} data-testid="content-dialog-cancel"
            className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40">
            Anulează
          </button>
          <button type="button" onClick={submit}
            disabled={busy || (form.exclusiveSite !== null && !availableSites.find(s => s.slug === form.exclusiveSite))}
            data-testid="create-submit-btn"
            className="px-5 py-2 bg-[var(--text)] text-[var(--bg)] text-xs tracking-widest uppercase font-content
                        hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors disabled:opacity-40 disabled:pointer-events-none">
            {busy ? 'Se salvează…' : isTranslating ? 'Salvează traducerea' : isEdit ? 'Salvează' : 'Creează'}
          </button>
        </div>
      </DialogFooter>
      </>)}
    </div>
  )
}
