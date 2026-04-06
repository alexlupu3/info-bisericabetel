import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type MediaItem } from '../api/client'
import { useToast } from '../context/ToastContext'

type Filter = 'all' | 'in-use' | 'unused'

export default function MediaPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: () => api.media.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.media.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] })
      toast('Imagine ștearsă')
    },
    onError: (e: any) => toast(e.message ?? 'Eroare la ștergere'),
  })

  const items = data?.media ?? []
  const filtered = items.filter(m => {
    if (filter === 'in-use')  return m.usedBy.length > 0
    if (filter === 'unused')  return m.usedBy.length === 0
    return true
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bibliotecă media</h1>
        <span className="text-xs tracking-widest uppercase font-content text-[var(--muted)]">
          {items.length} imagine{items.length !== 1 ? 'i' : ''}
        </span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {([
          ['all',     'Toate'],
          ['in-use',  'Utilizate'],
          ['unused',  'Neutilizate'],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 text-xs tracking-widest uppercase font-content transition-colors border-b-2 -mb-px ${
              filter === key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-sm font-content text-[var(--muted)]">Se încarcă…</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm font-content text-[var(--muted)]">
          {filter === 'unused' ? 'Nu există imagini neutilizate.' : 'Nu există imagini.'}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map(m => (
          <MediaCard
            key={m.id}
            item={m}
            onDelete={() => deleteMutation.mutate(m.id)}
            deleting={deleteMutation.isPending && deleteMutation.variables === m.id}
          />
        ))}
      </div>
    </div>
  )
}

function MediaCard({ item, onDelete, deleting }: {
  item: MediaItem
  onDelete: () => void
  deleting: boolean
}) {
  const inUse = item.usedBy.length > 0

  return (
    <div className="border border-[var(--border)] flex flex-col" data-testid="media-card">
      <div className="aspect-square overflow-hidden bg-[var(--surface)]">
        <img
          src={item.url}
          alt={item.originalName}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="p-2 flex flex-col gap-1 flex-1">
        <p className="text-xs font-content truncate text-[var(--muted)]" title={item.originalName}>
          {item.originalName || item.filename}
        </p>

        {inUse ? (
          <div className="mt-auto space-y-1">
            <span className="inline-block text-xs tracking-widest uppercase font-content text-[var(--accent)]">
              Utilizat
            </span>
            {item.usedBy.map(u => (
              <p key={u.id} className="text-xs font-content text-[var(--muted)] truncate" title={u.name}>
                {u.name}
              </p>
            ))}
          </div>
        ) : (
          <button
            onClick={onDelete}
            disabled={deleting}
            data-testid="delete-media-btn"
            className="mt-auto text-xs tracking-widest uppercase font-content text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 text-left"
          >
            {deleting ? '…' : 'Șterge'}
          </button>
        )}
      </div>
    </div>
  )
}
