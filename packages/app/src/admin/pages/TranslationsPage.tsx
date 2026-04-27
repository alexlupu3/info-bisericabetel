import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Language, type TranslationKey } from '../api/client'
import { useToast } from '../context/ToastContext'

const KNOWN_KEYS: Record<string, string> = {
  'hero.subtitle': 'Ramâi la curent cu programul și activitățile bisericii Betel',
  'content.error': 'Nu s-a putut încărca conținutul. Încearcă din nou.',
  'content.empty.withSite': 'Nicio informație disponibilă pentru {siteName} în momentul acesta.',
  'content.empty.noSite': 'Nicio informație disponibilă în momentul acesta.',
  'content.empty.hint': 'Revino mai târziu sau selectează o altă locație.',
  'theme.light': 'Comută la modul luminos',
  'theme.dark': 'Comută la modul întunecat',
  'footer.copyright': 'Biserica Baptistă Betel · Cluj-Napoca',
  'sites.all': 'Toate locațiile',
  'sites.selectLabel': 'Selectare locație',
}

export default function TranslationsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  /* ---------- Language Management ---------- */
  const { data: langData, isLoading: langLoading } = useQuery({
    queryKey: ['admin-languages'],
    queryFn: api.languages.list,
  })
  const languages = langData?.languages ?? []
  const nonDefaultLanguages = languages.filter(l => !l.isDefault)

  const [addingLang, setAddingLang] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  const createLangMut = useMutation({
    mutationFn: () => api.languages.create(newCode.trim(), newName.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-languages'] })
      toast('Limbă adăugată')
      setNewCode(''); setNewName(''); setAddingLang(false)
    },
    onError: (err: any) => toast(err.message ?? 'Eroare'),
  })

  const toggleLangMut = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      api.languages.update(code, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-languages'] })
      toast('Limbă actualizată')
    },
    onError: (err: any) => toast(err.message ?? 'Eroare'),
  })

  const deleteLangMut = useMutation({
    mutationFn: (code: string) => api.languages.remove(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-languages'] })
      toast('Limbă ștearsă')
    },
    onError: (err: any) => toast(err.message ?? 'Eroare'),
  })

  /* ---------- UI Translations ---------- */
  const { data: trData, isLoading: trLoading } = useQuery({
    queryKey: ['admin-translations'],
    queryFn: api.translations.list,
  })
  const serverKeys = trData?.keys ?? []

  // Merge known keys with server data
  const allKeys = Object.keys(KNOWN_KEYS)
  serverKeys.forEach(sk => { if (!allKeys.includes(sk.key)) allKeys.push(sk.key) })

  const serverMap = new Map<string, Record<string, string>>()
  serverKeys.forEach(sk => serverMap.set(sk.key, sk.values))

  // Local edits: Record<`${key}::${locale}`, string>
  const [edits, setEdits] = useState<Record<string, string>>({})

  const getValue = (key: string, locale: string): string => {
    const editKey = `${key}::${locale}`
    if (editKey in edits) return edits[editKey]
    return serverMap.get(key)?.[locale] ?? ''
  }

  const setEdit = (key: string, locale: string, value: string) => {
    setEdits(prev => ({ ...prev, [`${key}::${locale}`]: value }))
  }

  const hasEdits = Object.keys(edits).length > 0

  const generateMut = useMutation({
    mutationFn: () => api.translations.generate(KNOWN_KEYS),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-translations'] })
      toast(data.generated > 0 ? `${data.generated} traduceri generate` : 'Nu lipsesc traduceri')
    },
    onError: (err: any) => toast(err.message ?? 'Eroare la generare'),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const translations = Object.entries(edits).map(([composite, value]) => {
        const [key, locale] = composite.split('::')
        return { key, locale, value }
      })
      return api.translations.bulkSave(translations)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-translations'] })
      setEdits({})
      toast('Traduceri salvate')
    },
    onError: (err: any) => toast(err.message ?? 'Eroare la salvare'),
  })

  return (
    <div className="p-6 space-y-10">
      {/* ===== LANGUAGE MANAGEMENT ===== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Limbi</h2>
          <button
            onClick={() => setAddingLang(true)}
            className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                       hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            + Adaugă limbă
          </button>
        </div>

        {addingLang && (
          <div className="border border-[var(--border)] p-4 mb-4 space-y-3">
            <div className="flex gap-3">
              <input
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                placeholder="Cod (ex: en)"
                maxLength={5}
                className="w-20 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content"
              />
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Denumire (ex: English)"
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => createLangMut.mutate()}
                disabled={!newCode.trim() || !newName.trim() || createLangMut.isPending}
                className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                           hover:border-[var(--accent)] transition-colors disabled:opacity-40"
              >
                {createLangMut.isPending ? 'Se adaugă...' : 'Adaugă'}
              </button>
              <button
                onClick={() => { setAddingLang(false); setNewCode(''); setNewName('') }}
                className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]"
              >
                Anulează
              </button>
            </div>
          </div>
        )}

        {langLoading && (
          <p className="text-[var(--muted)] font-content text-sm">Se încarcă...</p>
        )}

        <ul className="space-y-2">
          {languages.map(lang => (
            <li
              key={lang.code}
              className="flex items-center gap-4 border border-[var(--border)] px-4 py-3"
            >
              <span className="text-xs tracking-widest uppercase font-content text-[var(--muted)] w-10">
                {lang.code}
              </span>
              <span className="flex-1 text-sm font-content">
                {lang.name}
                {lang.isDefault && (
                  <span className="ml-2 text-xs text-[var(--accent)]">(implicit)</span>
                )}
              </span>
              {!lang.isDefault && (
                <>
                  <label className="flex items-center gap-2 text-xs font-content text-[var(--muted)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lang.enabled}
                      onChange={() => toggleLangMut.mutate({ code: lang.code, enabled: !lang.enabled })}
                      className="accent-[var(--accent)]"
                    />
                    Activă
                  </label>
                  <button
                    onClick={() => {
                      if (confirm(`Ștergi limba "${lang.name}"?`)) deleteLangMut.mutate(lang.code)
                    }}
                    className="text-xs font-content text-[var(--muted)] hover:text-red-400 transition-colors"
                  >
                    Șterge
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ===== UI TRANSLATIONS ===== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Traduceri interfață</h2>
          <div className="flex items-center gap-3">
            {nonDefaultLanguages.length > 0 && (
              <button
                onClick={() => generateMut.mutate()}
                disabled={generateMut.isPending}
                className="px-4 py-2 border border-[var(--border)] text-xs tracking-widest uppercase font-content
                           hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              >
                {generateMut.isPending ? 'Se generează...' : 'Generează lipsă'}
              </button>
            )}
            {hasEdits && (
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                           hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              >
                {saveMut.isPending ? 'Se salvează...' : 'Salvează'}
              </button>
            )}
          </div>
        </div>

        {trLoading && (
          <p className="text-[var(--muted)] font-content text-sm">Se încarcă...</p>
        )}

        {nonDefaultLanguages.length === 0 && !langLoading && (
          <p className="text-[var(--muted)] font-content text-sm">
            Adaugă o limbă suplimentară pentru a putea traduce interfața.
          </p>
        )}

        {nonDefaultLanguages.length > 0 && (
          <div className="space-y-4">
            {allKeys.map(key => (
              <div key={key} className="border border-[var(--border)] p-4 space-y-2">
                <p className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">
                  {key}
                </p>
                {KNOWN_KEYS[key] && (
                  <p className="text-sm font-content text-[var(--muted)] italic">
                    ro: {KNOWN_KEYS[key]}
                  </p>
                )}
                {nonDefaultLanguages.map(lang => (
                  <div key={lang.code} className="flex items-center gap-3">
                    <span className="text-xs tracking-widest uppercase font-content text-[var(--muted)] w-10">
                      {lang.code}
                    </span>
                    <input
                      value={getValue(key, lang.code)}
                      onChange={e => setEdit(key, lang.code, e.target.value)}
                      placeholder={`Traducere ${lang.name}`}
                      className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
