import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Site } from '../api/client'
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

  const updateMut = useMutation({
    mutationFn: (body: { name?: string; accent?: string; address?: string }) =>
      api.sites.update(site.slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      setEditing(false)
      toast('Locație actualizată')
    },
  })

  const save = () => {
    updateMut.mutate({ name, accent, address: address || undefined })
  }

  const cancel = () => {
    setName(site.name)
    setAccent(site.accent)
    setAddress(site.address ?? '')
    setEditing(false)
  }

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
        </div>
      )}

      {editing && (
        <div className="space-y-3 pl-6">
          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">Nume</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content"
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
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">Adresă</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="ex: Str. Exemplu nr. 1, Cluj-Napoca"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content"
            />
          </div>
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
