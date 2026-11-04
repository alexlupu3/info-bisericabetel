import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import Dialog, { DialogBody } from '../ui/Dialog'

/**
 * Media library picker. Opened from the image picker inside the content dialog, so it is
 * a dialog stacked on a dialog: `Esc` and the backdrop close only this one (FR-110).
 */
export default function MediaLibraryModal({ onSelect, onClose }: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn:  () => api.media.list(),
  })

  return (
    <Dialog
      testId="media-library-dialog"
      closeTestId="media-library-close"
      title="Alege din bibliotecă"
      layout="wide"
      kind="picker"
      onRequestClose={onClose}
    >
      <DialogBody>
        {isLoading && <p className="text-sm font-content text-[var(--muted)]">Se încarcă…</p>}
        {!isLoading && (data?.media.length ?? 0) === 0 && (
          <p className="text-sm font-content text-[var(--muted)]">Nu există imagini în bibliotecă.</p>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {data?.media.map(m => (
            <button key={m.id} type="button" onClick={() => onSelect(m.url)}
              data-testid={`media-library-item-${m.id}`}
              className="border border-[var(--border)] hover:border-[var(--accent)] transition-colors group flex flex-col text-left">
              <div className="aspect-square overflow-hidden bg-[var(--surface)]">
                <img src={m.url} alt={m.originalName} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" loading="lazy" />
              </div>
              <p className="p-1.5 text-xs font-content text-[var(--muted)] truncate">{m.originalName || m.filename}</p>
            </button>
          ))}
        </div>
      </DialogBody>
    </Dialog>
  )
}
