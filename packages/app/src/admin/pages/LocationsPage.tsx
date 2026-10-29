import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Site, type SiteUpdate } from '../api/client'
import { useToast } from '../context/ToastContext'

export default function LocationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['sites'], queryFn: api.sites.list })
  const sites = data?.sites ?? []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Locații</h1>
      </div>

      {isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}

      <div className="space-y-4">
        {sites.map(site => (
          <SiteCard key={site.slug} site={site} />
        ))}
      </div>
    </div>
  )
}

function SiteCard({ site }: { site: Site }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(site.name)
  const [accent, setAccent] = useState(site.accent)
  const [address, setAddress] = useState(site.address ?? '')
  const [structured, setStructured] = useState<StructuredAddress>(() => structuredOf(site))

  const updateMut = useMutation({
    mutationFn: (body: SiteUpdate) =>
      api.sites.update(site.slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      setEditing(false)
      toast('Locație actualizată')
    },
  })

  const save = () => {
    // Empty optional fields are sent as null so they can be cleared.
    updateMut.mutate({
      name,
      accent,
      address: address.trim() || null,
      ...Object.fromEntries(STRUCTURED_FIELDS.map(f => [f.key, structured[f.key].trim() || null])),
    })
  }

  const cancel = () => {
    setName(site.name)
    setAccent(site.accent)
    setAddress(site.address ?? '')
    setStructured(structuredOf(site))
    setEditing(false)
  }

  const filledStructured = STRUCTURED_FIELDS.filter(f => site[f.key] !== null && site[f.key] !== undefined && site[f.key] !== '')

  return (
    <div className="border border-[var(--border)] p-4" data-testid={`site-card-${site.slug}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: site.accent }}
          />
          <span className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">
            {site.slug}
          </span>
          <span className="text-sm font-content font-medium">{site.name}</span>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Editează
          </button>
        )}
      </div>

      {!editing && (
        <div className="space-y-1 pl-6">
          <div className="flex gap-2 text-sm font-content">
            <span className="text-[var(--muted)] text-xs tracking-widest uppercase w-20 flex-shrink-0">Accent</span>
            <span className="font-mono text-xs">{site.accent}</span>
          </div>
          <div className="flex gap-2 text-sm font-content">
            <span className="text-[var(--muted)] text-xs tracking-widest uppercase w-20 flex-shrink-0">Adresă</span>
            <span className="text-sm">{site.address || <span className="text-[var(--muted)] italic">necompletată</span>}</span>
          </div>
          {filledStructured.map(f => (
            <div key={f.key} className="flex gap-2 text-sm font-content" data-testid={`site-${site.slug}-${f.key}`}>
              <span className="text-[var(--muted)] text-xs tracking-widest uppercase w-20 flex-shrink-0">{f.short}</span>
              <span className="text-sm">{String(site[f.key])}</span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-3 pl-6">
          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">Nume</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-content"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">Culoare accent</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accent}
                onChange={e => setAccent(e.target.value)}
                className="w-10 h-10 border border-[var(--border)] bg-[var(--surface)] cursor-pointer p-1"
              />
              <input
                value={accent}
                onChange={e => setAccent(e.target.value)}
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">Adresă</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="ex: Str. Exemplu nr. 1, Cluj-Napoca"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-content"
            />
          </div>
          <fieldset className="space-y-3 border-t border-[var(--border)] pt-3">
            <legend className="text-xs tracking-widest uppercase font-content text-[var(--muted)] pr-2">
              Adresă structurată (opțional)
            </legend>
            <p className="text-xs font-content text-[var(--muted)]">
              Folosită pentru rezultatele Google (evenimente și locația bisericii). Câmpurile goale sunt ignorate.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STRUCTURED_FIELDS.map(f => (
                <div key={f.key} className={`space-y-1${f.wide ? ' sm:col-span-2' : ''}`}>
                  <label htmlFor={`site-${site.slug}-${f.key}-input`} className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">
                    {f.label}
                  </label>
                  <input
                    id={`site-${site.slug}-${f.key}-input`}
                    data-testid={`site-${f.key}-input`}
                    value={structured[f.key]}
                    onChange={e => setStructured(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    inputMode={f.numeric ? 'decimal' : undefined}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-content"
                  />
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-3 pt-1">
            <button
              onClick={save}
              disabled={updateMut.isPending || !name}
              className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40">
              {updateMut.isPending ? 'Se salvează…' : 'Salvează'}
            </button>
            <button
              onClick={cancel}
              className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]">
              Anulează
            </button>
          </div>
          {updateMut.isError && (
            <p className="text-red-400 text-sm font-content">
              {(updateMut.error as any)?.message ?? 'Eroare la salvare'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

type StructuredKey =
  | 'streetAddress' | 'postalCode' | 'addressLocality' | 'addressRegion' | 'addressCountry'
  | 'latitude' | 'longitude' | 'telephone' | 'email'

type StructuredAddress = Record<StructuredKey, string>

const STRUCTURED_FIELDS: Array<{
  key: StructuredKey; label: string; short: string; placeholder: string; wide?: boolean; numeric?: boolean
}> = [
  { key: 'streetAddress',   label: 'Stradă și număr', short: 'Stradă',   placeholder: 'Str. Exemplu nr. 1', wide: true },
  { key: 'postalCode',      label: 'Cod poștal',      short: 'Cod',      placeholder: '400000' },
  { key: 'addressLocality', label: 'Localitate',      short: 'Oraș',     placeholder: 'Cluj-Napoca' },
  { key: 'addressRegion',   label: 'Județ',           short: 'Județ',    placeholder: 'Cluj' },
  { key: 'addressCountry',  label: 'Țară (cod ISO)',  short: 'Țară',     placeholder: 'RO' },
  { key: 'latitude',        label: 'Latitudine',      short: 'Lat.',     placeholder: '46.7712', numeric: true },
  { key: 'longitude',       label: 'Longitudine',     short: 'Long.',    placeholder: '23.6236', numeric: true },
  { key: 'telephone',       label: 'Telefon',         short: 'Telefon',  placeholder: '+40 7xx xxx xxx' },
  { key: 'email',           label: 'Email',           short: 'Email',    placeholder: 'contact@exemplu.ro' },
]

function structuredOf(site: Site): StructuredAddress {
  return Object.fromEntries(
    STRUCTURED_FIELDS.map(f => [f.key, site[f.key] === null || site[f.key] === undefined ? '' : String(site[f.key])]),
  ) as StructuredAddress
}
