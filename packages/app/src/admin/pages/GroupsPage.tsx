import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Group, type Site } from '../api/client'
import { useToast } from '../context/ToastContext'

export default function GroupsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin-groups'], queryFn: api.groups.list })
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: api.sites.list })
  const sites: Site[] = sitesData?.sites ?? []
  const [creating, setCreating] = useState(false)

  const deleteMut = useMutation({
    mutationFn: api.groups.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); toast('Grup șters') },
  })

  const groups = data?.groups ?? []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Grupuri</h1>
          <p className="text-xs font-content text-[var(--muted)] mt-1">
            Grupează mai multe elemente de conținut sub un titlu comun.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          data-testid="create-group-btn"
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
          + Adaugă
        </button>
      </div>

      {creating && (
        <CreateGroupForm
          availableSites={sites}
          onClose={() => setCreating(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); setCreating(false); toast('Grup creat') }}
        />
      )}

      {isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}

      {!isLoading && groups.length === 0 && (
        <p className="text-[var(--muted)] font-content text-sm" data-testid="groups-empty">
          Niciun grup creat încă.
        </p>
      )}

      <ul className="space-y-2" data-testid="groups-list">
        {groups.map(group => (
          <GroupRow
            key={group.id} group={group}
            onDelete={() => { if (confirm(`Ștergi grupul "${group.title}"?`)) deleteMut.mutate(group.id) }}
          />
        ))}
      </ul>

      {groups.length > 0 && (
        <p className="mt-6 text-xs font-content text-[var(--muted)]">
          Pentru a atribui un grup unui element de conținut, editează elementul și selectează grupul din câmpul „Grup".
        </p>
      )}
    </div>
  )
}

function GroupRow({ group, onDelete }: { group: Group; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-4 border border-[var(--border)] px-4 py-3"
        data-testid={`group-row-${group.id}`}>
      <span className="flex-1 text-sm font-content">{group.title}</span>
      {group.sites.length > 0 && (
        <span className="text-xs font-content text-[var(--muted)] flex-shrink-0">
          {group.sites.join(', ')}
        </span>
      )}
      <span className="text-xs font-content text-[var(--muted)] flex-shrink-0 font-mono">
        {group.id.slice(0, 8)}
      </span>
      <button onClick={onDelete}
        className="text-xs font-content text-[var(--muted)] hover:text-red-400 transition-colors flex-shrink-0">
        Șterge
      </button>
    </li>
  )
}

function CreateGroupForm({ availableSites, onClose, onCreated }: { availableSites: Site[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (slug: string) =>
    setSelectedSites(s => s.includes(slug) ? s.filter(x => x !== slug) : [...s, slug])

  const submit = async () => {
    setBusy(true); setError('')
    try {
      await api.groups.create(title, selectedSites)
      onCreated()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-[var(--border)] p-4 mb-6 space-y-3" data-testid="create-group-form">
      {error && <p className="text-red-400 text-sm font-content">{error}</p>}
      <div>
        <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Titlu *</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="ex. Anunțuri duminică"
          data-testid="create-group-title"
          className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
      </div>
      {availableSites.length > 0 && (
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
            Locații <span className="normal-case">(gol = toate)</span>
          </label>
          <div className="flex gap-4">
            {availableSites.map(s => (
              <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={selectedSites.includes(s.slug)}
                  onChange={() => toggle(s.slug)}
                  data-testid={`group-site-${s.slug}`}
                  className="accent-[var(--accent)]" />
                <span className="text-xs font-content">{s.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={submit} disabled={busy || !title}
          data-testid="create-group-submit"
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] transition-colors disabled:opacity-40">
          {busy ? 'Se creează…' : 'Creează'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]">
          Anulează
        </button>
      </div>
    </div>
  )
}
