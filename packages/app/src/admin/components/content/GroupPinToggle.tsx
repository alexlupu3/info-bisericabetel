import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pin } from 'lucide-react'
import { api, type ContentItem } from '../../api/client'
import { useToast } from '../../context/ToastContext'

const QUERY_KEY = ['admin-content']

/**
 * Pin toggle on a group item row of the Content page (spec 08, FR-104): pinned items, all of
 * them in group order, lead the group's card deck on phones (FR-097). Self-contained on purpose (PATCH +
 * optimistic cache update), so the Content page only renders it on group rows.
 */
export default function GroupPinToggle({ item }: { item: ContentItem }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const pinned = item.pinnedInGroup === true

  const mutation = useMutation({
    mutationFn: (next: boolean) => api.content.update(item.id, { pinnedInGroup: next }),
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previous = qc.getQueryData<{ items: ContentItem[] }>(QUERY_KEY)
      if (previous) {
        qc.setQueryData(QUERY_KEY, {
          ...previous,
          items: previous.items.map(i => i.id === item.id ? { ...i, pinnedInGroup: next } : i),
        })
      }
      return { previous }
    },
    onError: (_err, _next, context) => {
      if (context?.previous) qc.setQueryData(QUERY_KEY, context.previous)
      toast('Nu s-a putut salva fixarea', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* Icon only: an outline pin, filled once pinned. The name stays constant for screen
          readers; aria-pressed says whether it is on. */}
      <button
        type="button"
        aria-pressed={pinned}
        aria-label="Fixează pe mobil"
        data-testid={`pin-toggle-${item.id}`}
        onClick={() => mutation.mutate(!pinned)}
        title="Apare primul în previzualizarea grupului pe telefon"
        className={`inline-flex items-center justify-center w-7 h-7 transition-colors
          ${pinned ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
      >
        <Pin size={15} aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
