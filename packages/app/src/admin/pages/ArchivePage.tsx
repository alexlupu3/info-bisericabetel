import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SquareAsterisk, AlignLeft, Video, Image } from 'lucide-react'
import { api, type ContentItem } from '../api/client'
import { useToast } from '../context/ToastContext'

function ContentTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'card':     return <SquareAsterisk size={16} />
    case 'richtext': return <AlignLeft size={16} />
    case 'video':    return <Video size={16} />
    case 'poster':   return <Image size={16} />
    default:         return <SquareAsterisk size={16} />
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ro-RO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ArchivePage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-content-deleted'],
    queryFn: api.content.listDeleted,
  })

  const restoreMut = useMutation({
    mutationFn: api.content.restore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-content-deleted'] })
      qc.invalidateQueries({ queryKey: ['admin-content'] })
      toast('Restaurat')
    },
  })

  const permanentDeleteMut = useMutation({
    mutationFn: api.content.removePermanent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-content-deleted'] })
      toast('Șters definitiv')
    },
  })

  const items: ContentItem[] = data?.items ?? []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Arhivă</h1>
          <p className="text-xs font-content text-[var(--muted)] mt-1">
            Elementele șterse pot fi restaurate sau eliminate definitiv.
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-[var(--muted)] font-content text-sm" data-testid="archive-empty">
          Niciun element în arhivă.
        </p>
      )}

      <ul className="space-y-2" data-testid="archive-list">
        {items.map(item => (
          <li
            key={item.id}
            data-testid={`archive-row-${item.id}`}
            className="flex items-center gap-4 border border-[var(--border)] px-4 py-3"
          >
            <span className="w-8 flex-shrink-0 flex items-center text-[var(--muted)]">
              <ContentTypeIcon type={item.type} />
            </span>
            <span className="flex-1 text-sm font-content truncate">
              {(item.data as any).title ?? (item.data as any).name ?? (item.data as any).url ?? item.id}
            </span>
            <span className="hidden sm:inline text-xs font-content text-[var(--muted)] flex-shrink-0">
              {formatDate(item.updatedAt)}
            </span>
            <button
              onClick={() => restoreMut.mutate(item.id)}
              disabled={restoreMut.isPending}
              data-testid={`restore-btn-${item.id}`}
              className="text-xs tracking-widest uppercase font-content text-green-400 hover:text-green-300 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              Restaurează
            </button>
            <button
              onClick={() => {
                if (confirm('Această acțiune este ireversibilă. Ștergi definitiv?'))
                  permanentDeleteMut.mutate(item.id)
              }}
              disabled={permanentDeleteMut.isPending}
              data-testid={`permanent-delete-btn-${item.id}`}
              className="text-xs tracking-widest uppercase font-content text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              Șterge definitiv
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
