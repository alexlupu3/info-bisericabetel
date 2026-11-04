import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pin } from 'lucide-react'
import { SECTION_PREVIEW_SIZE } from '@betel/shared'
import { api, type ContentItem } from '../../api/client'
import { useToast } from '../../context/ToastContext'

const QUERY_KEY = ['admin-content']

/**
 * Pin toggle on a group item row of the Content page (spec 08, FR-104): pinned items lead
 * the group's collapsed "hand" on phones (FR-097). Self-contained on purpose (PATCH +
 * optimistic cache update), so the Content page only renders it on group rows.
 */
export default function GroupPinToggle({ item, groupItems }: {
  item: ContentItem
  /** The group's items in group order (for the "first 3 pinned" hint). */
  groupItems: ContentItem[]
}) {
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

  // Rank among the group's pinned items, in group order: only the first 3 lead the hand.
  const rank = pinned ? groupItems.filter(i => i.pinnedInGroup === true).findIndex(i => i.id === item.id) : -1
  const beyondHand = rank >= SECTION_PREVIEW_SIZE

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {beyondHand && (
        <span data-testid={`pin-hint-${item.id}`} className="hidden md:inline text-[11px] font-content text-[var(--muted)]">
          Doar primele 3 elemente fixate apar în față
        </span>
      )}
      <button
        type="button"
        aria-pressed={pinned}
        data-testid={`pin-toggle-${item.id}`}
        onClick={() => mutation.mutate(!pinned)}
        title={beyondHand ? 'Doar primele 3 elemente fixate apar în față' : 'Apare primul în previzualizarea grupului pe telefon'}
        className={`inline-flex items-center gap-1 px-2 py-1 border text-[11px] font-content uppercase tracking-widest transition-colors
          ${pinned
            ? 'border-[var(--accent)] text-[var(--accent)]'
            : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}
      >
        <Pin size={13} aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} />
        <span className="hidden sm:inline">{pinned ? 'Fixat' : 'Fixează pe mobil'}</span>
        <span className="sr-only sm:hidden">{pinned ? 'Fixat' : 'Fixează pe mobil'}</span>
      </button>
    </div>
  )
}
