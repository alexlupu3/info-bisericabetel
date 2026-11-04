import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

// ── Media library modal ─────────────────────────────────────────────────────────

export default function MediaLibraryModal({ onSelect, onClose }: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn:  () => api.media.list(),
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-[var(--bg)] border border-[var(--border)] p-4 w-full max-w-2xl max-h-[80vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <span className="text-sm font-bold uppercase tracking-widest">Alege din bibliotecă</span>
          <button onClick={onClose}
            className="text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Închide
          </button>
        </div>
        {isLoading && <p className="text-sm font-content text-[var(--muted)]">Se încarcă…</p>}
        {!isLoading && (data?.media.length ?? 0) === 0 && (
          <p className="text-sm font-content text-[var(--muted)]">Nu există imagini în bibliotecă.</p>
        )}
        <div className="overflow-auto grid grid-cols-3 sm:grid-cols-4 gap-3">
          {data?.media.map(m => (
            <button key={m.id} onClick={() => onSelect(m.url)}
              className="border border-[var(--border)] hover:border-[var(--accent)] transition-colors group flex flex-col text-left">
              <div className="aspect-square overflow-hidden bg-[var(--surface)]">
                <img src={m.url} alt={m.originalName} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" loading="lazy" />
              </div>
              <p className="p-1.5 text-xs font-content text-[var(--muted)] truncate">{m.originalName || m.filename}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

