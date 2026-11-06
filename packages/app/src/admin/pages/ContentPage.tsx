import { useState, useEffect, useRef, Fragment } from 'react'
import { GripVertical, ChevronRight, ChevronDown, ChevronUp, Settings, SquareAsterisk, AlignLeft, Video, Image, Plus, Lock, ArrowUpDown } from 'lucide-react'
import ContentDialog from '../components/content/ContentDialog'
import GroupDialog from '../components/content/GroupDialog'
import { useDialogSearchParam, dialogKey } from '../hooks/useDialogSearchParam'
import GroupPinToggle from '../components/content/GroupPinToggle'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier,
  type Over,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { isItemPast } from '../../content-expiry'
import { compareEventSchedules, type EventSchedule } from '@betel/shared'
import { api, type ContentItem, type Group, type Site } from '../api/client'
import { useToast } from '../context/ToastContext'

// ── Site circles ───────────────────────────────────────────────────────────────

function SiteCircles({ sites, exclusiveSite, availableSites }: { sites: string[]; exclusiveSite: string | null; availableSites: Site[] }) {
  if (exclusiveSite !== null) {
    const site = availableSites.find(s => s.slug === exclusiveSite)
    return (
      <div
        data-testid={`exclusive-badge-${exclusiveSite}`}
        title={`Exclusiv ${site?.name ?? exclusiveSite}`}
        className="flex gap-1 flex-shrink-0 items-center hidden sm:flex"
      >
        <Lock className="w-3 h-3" style={{ color: 'var(--muted)' }} />
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-default"
          style={{ backgroundColor: site?.accent ?? '#888' }}
        />
      </div>
    )
  }
  if (sites.length === 0) return null
  return (
    <div className="flex gap-1 flex-shrink-0 items-center hidden sm:flex">
      {sites.map(slug => {
        const site = availableSites.find(s => s.slug === slug)
        return (
          <span
            key={slug}
            title={site?.name ?? slug}
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-default"
            style={{ backgroundColor: site?.accent ?? '#888' }}
          />
        )
      })}
    </div>
  )
}

// ── Root list model ────────────────────────────────────────────────────────────

type ItemEntry  = { kind: 'item';  item: ContentItem }
type GroupEntry = { kind: 'group'; id: string; title: string; sites: string[]; items: ContentItem[] }
type RootEntry  = ItemEntry | GroupEntry

function entryId(e: RootEntry): string {
  return e.kind === 'item' ? e.item.id : e.id
}

/**
 * Returns '__root__' if id is a standalone item or a group block itself,
 * or the groupId if id is an item inside a group.
 */
function findContainerOf(entries: RootEntry[], id: string): string | null {
  for (const e of entries) {
    if (e.kind === 'item'  && e.item.id === id) return '__root__'
    if (e.kind === 'group') {
      if (e.id === id)                    return '__root__'
      if (e.items.some(i => i.id === id)) return e.id
    }
  }
  return null
}

/**
 * Returns 'before' if the mid-Y of the active draggable is in the upper half
 * of the over element's bounding rect, meaning the item should be inserted
 * before the over element. Returns 'after' otherwise.
 */
function getInsertPosition(over: Over, activeMidY: number): 'before' | 'after' {
  const rect = over.rect
  const midY = rect.top + rect.height / 2
  return activeMidY < midY ? 'before' : 'after'
}

// Client-side preview of the server's chronological sort (BR-013): same shared comparator.
function sortByStartDate(items: ContentItem[]): ContentItem[] {
  return [...items].sort((a, b) =>
    compareEventSchedules(a.data as EventSchedule, b.data as EventSchedule))
}

/**
 * Reorders within a container. When insertBefore is true, the active item is
 * placed before the over item; otherwise it is placed after (default arrayMove
 * behaviour when dragging downward).
 */
function reorderInContainer(
  entries: RootEntry[],
  container: string,
  activeId: string,
  overId: string,
  insertBefore = false,
): RootEntry[] {
  if (container === '__root__') {
    const from = entries.findIndex(e => entryId(e) === activeId)
    let to     = entries.findIndex(e => entryId(e) === overId)
    if (from === -1 || to === -1) return entries
    // When inserting before and the active item is below the target, arrayMove
    // already ends up at `to`. When inserting after and the active item is
    // above the target, arrayMove already ends up at `to`. We only need to
    // adjust when the desired direction disagrees with the default behaviour.
    if (insertBefore && from > to) {
      // active is below target; arrayMove(from, to) would place it at to → correct
    } else if (insertBefore && from < to) {
      // active is above target; arrayMove(from, to) would place it at to (after) → we want to-1
      to = to - 1
    } else if (!insertBefore && from > to) {
      // active is below target; arrayMove(from, to) would place it at to (before) → we want to+1
      to = to + 1
    }
    // else: !insertBefore && from < to → arrayMove already places after → correct
    return arrayMove(entries, from, Math.max(0, Math.min(to, entries.length - 1)))
  }
  return entries.map(e => {
    if (e.kind !== 'group' || e.id !== container) return e
    const from = e.items.findIndex(i => i.id === activeId)
    let to     = e.items.findIndex(i => i.id === overId)
    if (from === -1 || to === -1) return e
    if (insertBefore && from > to) {
      // no adjustment needed
    } else if (insertBefore && from < to) {
      to = to - 1
    } else if (!insertBefore && from > to) {
      to = to + 1
    }
    return { ...e, items: arrayMove(e.items, from, Math.max(0, Math.min(to, e.items.length - 1))) }
  })
}

function moveToContainer(
  entries: RootEntry[],
  itemId: string,
  fromContainer: string,
  toContainer: string,
  overId: string | null,
): RootEntry[] {
  let moving: ContentItem | null = null

  // Remove from source
  let next = entries.map(e => {
    if (e.kind === 'item' && e.item.id === itemId) {
      moving = e.item; return null
    }
    if (e.kind === 'group' && e.id === fromContainer) {
      moving = e.items.find(i => i.id === itemId) ?? null
      return { ...e, items: e.items.filter(i => i.id !== itemId) }
    }
    return e
  }).filter(Boolean) as RootEntry[]

  if (!moving) return entries

  if (toContainer === '__root__') {
    const idx = overId
      ? next.findIndex(e => (e.kind === 'item' && e.item.id === overId) || (e.kind === 'group' && e.id === overId))
      : -1
    next.splice(idx >= 0 ? idx : next.length, 0, { kind: 'item', item: moving })
  } else {
    next = next.map(e => {
      if (e.kind !== 'group' || e.id !== toContainer) return e
      const idx = overId ? e.items.findIndex(i => i.id === overId) : -1
      const items = [...e.items]
      items.splice(idx >= 0 ? idx : items.length, 0, moving!)
      return { ...e, items }
    })
  }
  return next
}


// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: contentData, isLoading, dataUpdatedAt: contentUpdatedAt } = useQuery({ queryKey: ['admin-content'], queryFn: api.content.list })
  const { data: groupsData, dataUpdatedAt: groupsUpdatedAt } = useQuery({ queryKey: ['admin-groups'], queryFn: api.groups.list })
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: api.sites.list })
  const availableSites = sitesData?.sites ?? []

  // ── Create/edit dialogs (spec 09): the open dialog is in the URL (FR-113) ──
  const dialogs = useDialogSearchParam()
  const dialog = dialogs.dialog
  const dataReady = !!contentData && !!groupsData
  const dialogItem = dialog?.kind === 'edit' ? contentData?.items.find(i => i.id === dialog.id) : undefined
  const dialogGroup = dialog?.kind === 'editGroup' ? groupsData?.groups.find(g => g.id === dialog.id) : undefined
  const missingTarget = dataReady && (
    (dialog?.kind === 'edit' && !dialogItem) || (dialog?.kind === 'editGroup' && !dialogGroup))

  useEffect(() => {
    if (!dialog || !dataReady) return
    if (missingTarget) {
      toast(dialog.kind === 'edit' ? 'Elementul nu mai există' : 'Grupul nu mai există', 'error')
      dialogs.strip()
      return
    }
    dialogs.normalizeDeepLink()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog && dialogKey(dialog), dataReady, missingTarget])

  // ── After-save landing (FR-112): expand, scroll into view, highlight, focus ──
  type Landing = { kind: 'item' | 'group'; id: string; savedAt: number }
  const [landing, setLanding] = useState<Landing | null>(null)
  const [highlight, setHighlight] = useState<{ kind: 'item' | 'group'; id: string } | null>(null)

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const initialCollapseApplied = useRef(false)

  // Collapse all groups by default on first load
  useEffect(() => {
    if (!groupsData || initialCollapseApplied.current) return
    initialCollapseApplied.current = true
    setCollapsedGroups(new Set(groupsData.groups.map(g => g.id)))
  }, [groupsData])

  const toggleGroupCollapse = (id: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const [rootEntries, setRootEntries] = useState<RootEntry[]>([])
  const rootEntriesRef = useRef<RootEntry[]>([])
  useEffect(() => { rootEntriesRef.current = rootEntries }, [rootEntries])

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [activeDragType, setActiveDragType] = useState<string | null>(null)
  const dragOriginRef = useRef<string | null>(null)
  const lastOverIdRef = useRef<string | null>(null)
  const activatorYRef = useRef<number | null>(null)

  // Build root entries from server data.
  // Groups and standalone items are interleaved by their respective orderPosition values
  // (groups.orderPosition for groups, content_items.orderPosition for standalone items).
  // When positions tie (e.g. initial data before first root-order call), standalone items
  // sort before groups to preserve the legacy behaviour.
  useEffect(() => {
    if (!contentData || !groupsData) return
    const items = contentData.items
    const allGroups = groupsData.groups

    type WithPos = RootEntry & { _pos: number; _isGroup: boolean }

    const combined: WithPos[] = [
      ...items
        .filter(i => !i.groupId)
        .map(item => ({ kind: 'item' as const, item, _pos: item.orderPosition, _isGroup: false })),
      ...allGroups.map(g => ({
        kind: 'group' as const,
        id: g.id,
        title: g.title,
        sites: g.sites ?? [],
        items: items
          .filter(i => i.groupId === g.id)
          .sort((a, b) => a.orderPosition - b.orderPosition),
        _pos: g.orderPosition,
        _isGroup: true,
      })),
    ]

    combined.sort((a, b) => a._pos !== b._pos ? a._pos - b._pos : (a._isGroup ? 1 : -1))
    setRootEntries(combined.map(({ _pos: _, _isGroup: __, ...e }) => e as RootEntry))
  }, [contentData, groupsData])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-content'] })

  const setContentCache = (items: ContentItem[]) =>
    qc.setQueryData(['admin-content'], { items })
  const setAllCache = (items: ContentItem[], groups: Group[]) => {
    qc.setQueryData(['admin-content'], { items })
    qc.setQueryData(['admin-groups'], { groups })
  }

  const deleteMut      = useMutation({ mutationFn: api.content.remove,      onSuccess: () => { invalidate(); toast('Element șters') } })
  const publishMut     = useMutation({ mutationFn: api.content.publish,     onSuccess: () => { invalidate(); toast('Publicat') } })
  const archiveMut     = useMutation({ mutationFn: api.content.archive,     onSuccess: () => { invalidate(); toast('Ascuns') } })
  const duplicateMut   = useMutation({ mutationFn: api.content.duplicate,   onSuccess: () => { invalidate(); toast('Element duplicat') } })

  const togglePublishMut = useMutation({
    mutationFn: ({ id, currentState }: { id: string; currentState: string }) =>
      currentState === 'published'
        ? api.content.update(id, { state: 'draft' })
        : api.content.publish(id),
    onMutate: async ({ id, currentState }) => {
      await qc.cancelQueries({ queryKey: ['admin-content'] })
      const previous = qc.getQueryData<{ items: ContentItem[] }>(['admin-content'])
      const newState = currentState === 'published' ? 'draft' : 'published'
      qc.setQueryData<{ items: ContentItem[] }>(['admin-content'], old =>
        old ? { items: old.items.map(i => i.id === id ? { ...i, state: newState } : i) } : old
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['admin-content'], context.previous)
      toast('Eroare la actualizarea stării')
    },
    onSuccess: (_data, { currentState }) => {
      invalidate()
      toast(currentState === 'published' ? 'Depublicat' : 'Publicat')
    },
  })
  const reorderMut     = useMutation({ mutationFn: api.content.reorder,     onSuccess: data => setContentCache(data.items) })
  const reorderRootMut = useMutation({ mutationFn: api.content.reorderRoot, onSuccess: data => setAllCache(data.items, data.groups) })

  const sortGroupChronologically = (groupId: string) => {
    setRootEntries(prev => prev.map(e => {
      if (e.kind !== 'group' || e.id !== groupId) return e
      const sorted = sortByStartDate(e.items)
      reorderMut.mutate(sorted.map(i => i.id))
      return { ...e, items: sorted }
    }))
  }
  const createGroupMut = useMutation({
    mutationFn: ({ title, sites, sectionPreview }: { title: string; sites: string[]; sectionPreview: boolean }) =>
      api.groups.create(title, sites, sectionPreview),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); toast('Grup creat') },
  })
  const updateGroupMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { title?: string; sites?: string[]; sectionPreview?: boolean } }) =>
      api.groups.update(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); toast('Grup actualizat') },
  })
  const deleteGroupMut = useMutation({
    mutationFn: (groupId: string) => api.groups.remove(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] })
      qc.invalidateQueries({ queryKey: ['admin-content'] })
      toast('Grup șters')
    },
  })

  useEffect(() => {
    if (!landing || dialog) return
    const fresh = (landing.kind === 'item' ? contentUpdatedAt : groupsUpdatedAt) >= landing.savedAt
    if (landing.kind === 'item') {
      const item = contentData?.items.find(i => i.id === landing.id)
      // Not in the refreshed list (e.g. filtered out): focus stays on the trigger.
      if (!item) { if (fresh) setLanding(null); return }
      if (item.groupId && collapsedGroups.has(item.groupId)) {
        const groupId = item.groupId
        setCollapsedGroups(prev => { const next = new Set(prev); next.delete(groupId); return next })
        return
      }
    } else if (!groupsData?.groups.some(g => g.id === landing.id)) {
      if (fresh) setLanding(null)
      return
    }
    const prefix = landing.kind === 'item' ? 'content' : 'group'
    const block = document.querySelector<HTMLElement>(
      `[data-testid="${landing.kind === 'item' ? 'content-row' : 'group-block'}-${landing.id}"]`)
    if (!block) return // the list is rebuilt from the refreshed data in an effect; try again then
    block.scrollIntoView({ block: 'nearest' })
    document.querySelector<HTMLElement>(`[data-testid="${prefix}-name-${landing.id}"]`)?.focus({ preventScroll: true })
    setHighlight({ kind: landing.kind, id: landing.id })
    setLanding(null)
  }, [landing, dialog, contentData, groupsData, rootEntries, collapsedGroups, contentUpdatedAt, groupsUpdatedAt])

  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(null), 2500)
    return () => clearTimeout(t)
  }, [highlight])

  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setActiveId(active.id)
    setActiveDragType(active.data.current?.type ?? 'item')
    dragOriginRef.current = findContainerOf(rootEntriesRef.current, active.id as string)
    lastOverIdRef.current = null
    const pt = activatorEvent as PointerEvent
    activatorYRef.current = typeof pt.clientY === 'number' ? pt.clientY : null
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    lastOverIdRef.current = over.id as string
    const overType = over.data.current?.type
    const activeType = active.data.current?.type
    const entries = rootEntriesRef.current

    const NON_GROUPABLE = ['video', 'richtext']

    // Items can't be dragged into groups by hovering the group-body droppable
    if (overType === 'group-body') {
      const targetGroupId = over.data.current?.groupId as string | undefined
      if (!targetGroupId) return
      const fromContainer = findContainerOf(entries, active.id as string)
      if (!fromContainer || fromContainer === targetGroupId) return
      // Groups can't be put into groups
      if (activeType === 'group') return
      // Video and richtext cards can't be dropped into groups
      if (NON_GROUPABLE.includes(active.data.current?.contentType)) return
      setRootEntries(prev => moveToContainer(prev, active.id as string, fromContainer, targetGroupId, null))
      return
    }

    const fromContainer = findContainerOf(entries, active.id as string)
    const toContainer   = findContainerOf(entries, over.id  as string)
    if (!fromContainer || !toContainer || fromContainer === toContainer) return

    // Whole group blocks stay at root level only
    if (activeType === 'group') return

    // Video and richtext cards can't be dropped into groups
    if (toContainer !== '__root__' && NON_GROUPABLE.includes(active.data.current?.contentType)) return

    // An item inside group G hovering over group G's own sortable header would
    // compute toContainer = '__root__', incorrectly ejecting the item from the group.
    if (fromContainer !== '__root__' && over.id === fromContainer) return

    setRootEntries(prev => moveToContainer(prev, active.id as string, fromContainer, toContainer, over.id as string))
  }

  const handleDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const origin = dragOriginRef.current
    const rawOverId = (over?.id as string | undefined) ?? lastOverIdRef.current
    const activatorY = activatorYRef.current
    setActiveId(null)
    setActiveDragType(null)
    dragOriginRef.current = null
    lastOverIdRef.current = null
    activatorYRef.current = null

    const entries = rootEntriesRef.current
    if (!rawOverId || !origin) return

    const current = findContainerOf(entries, active.id as string)
    if (!current) return

    // Resolve group-body droppable IDs (e.g. "<groupId>-body") to the group ID itself
    const resolvedOverId = rawOverId.endsWith('-body') ? rawOverId.slice(0, -5) : rawOverId

    // Same container → apply arrayMove and persist
    if (current === origin) {
      if (active.id === resolvedOverId) return

      // For root-level drags: if `over` is an item inside a group, snap to that group
      let overId = resolvedOverId
      if (current === '__root__') {
        const overContainer = findContainerOf(entries, overId)
        if (overContainer && overContainer !== '__root__') overId = overContainer
      }

      if (overId === active.id) return
      const overContainer = findContainerOf(entries, overId)
      if (overContainer !== current) return

      // Determine insert position using the 50% threshold:
      // compare the current pointer Y (activator start + total delta) against
      // the vertical midpoint of the over element.  This approach works reliably
      // in both real-browser drags and Cypress synthetic-event drags, unlike
      // active.rect.current.translated which can be inaccurate when DragOverlay
      // positioning is not measured correctly.
      let insertBefore = false
      if (over && activatorY !== null) {
        const pointerY = activatorY + delta.y
        insertBefore = getInsertPosition(over, pointerY) === 'before'
      }

      const newEntries = reorderInContainer(entries, current, active.id as string, overId, insertBefore)
      setRootEntries(newEntries)

      if (current === '__root__') {
        // Single call: send all root entries (groups + standalone items) in new order
        reorderRootMut.mutate(newEntries.map(e => ({
          id: entryId(e),
          kind: e.kind === 'item' ? 'item' as const : 'group' as const,
        })))
      } else {
        // Within-group: only send items belonging to this group
        const groupEntry = newEntries.find(e => e.kind === 'group' && e.id === current) as GroupEntry | undefined
        if (groupEntry) reorderMut.mutate(groupEntry.items.map(i => i.id))
      }
      return
    }

    // Cross-container → already moved by onDragOver; persist all changes atomically.
    // All requests run in parallel; on completion the query cache is updated directly
    // from the responses so no additional GET is required.
    const itemId = active.id as string
    const targetGroupId = current === '__root__' ? null : current

    const rootPayload = entries.map(e => ({
      id: entryId(e),
      kind: e.kind === 'item' ? 'item' as const : 'group' as const,
    }))
    const targetGroup = targetGroupId
      ? entries.find(e => e.kind === 'group' && e.id === targetGroupId) as GroupEntry | undefined
      : null
    const sourceGroup = origin !== '__root__'
      ? entries.find(e => e.kind === 'group' && e.id === origin) as GroupEntry | undefined
      : null

    Promise.all([
      api.content.reorderRoot(rootPayload),
      api.content.update(itemId, { groupId: targetGroupId }),
      targetGroup?.items.length ? api.content.reorder(targetGroup.items.map(i => i.id)) : null,
      sourceGroup?.items.length ? api.content.reorder(sourceGroup.items.map(i => i.id)) : null,
    ] as const).then(([rootResult, patchedItem, tgResult, sgResult]) => {
      // Synthesize the final item list:
      // 1. rootResult has all items with updated root-level positions
      // 2. patchedItem has the correct groupId for the moved item
      // 3. tgResult/sgResult have correct within-group positions
      const itemMap = new Map(rootResult.items.map(i => [i.id, { ...i }]))
      itemMap.set(patchedItem.id, { ...itemMap.get(patchedItem.id)!, groupId: patchedItem.groupId })
      if (tgResult) for (const i of tgResult.items) itemMap.set(i.id, { ...itemMap.get(i.id)!, orderPosition: i.orderPosition })
      if (sgResult) for (const i of sgResult.items) itemMap.set(i.id, { ...itemMap.get(i.id)!, orderPosition: i.orderPosition })
      setAllCache(Array.from(itemMap.values()), rootResult.groups)
    })
  }

  const activeItem = activeId && activeDragType !== 'group'
    ? rootEntriesRef.current.flatMap(e => e.kind === 'item' ? [e.item] : e.items).find(i => i.id === activeId)
    : null
  const activeGroup = activeId && activeDragType === 'group'
    ? rootEntriesRef.current.find(e => e.kind === 'group' && e.id === activeId) as GroupEntry | undefined
    : undefined

  const groups = groupsData?.groups ?? []
  const rootIds = rootEntries.map(entryId)

  const groupEntries = rootEntries.filter(e => e.kind === 'group') as GroupEntry[]
  const allGroupsCollapsed = groupEntries.length > 0 && groupEntries.every(e => collapsedGroups.has(e.id))
  const toggleAllGroups = () => {
    if (allGroupsCollapsed) setCollapsedGroups(new Set())
    else setCollapsedGroups(new Set(groupEntries.map(e => e.id)))
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Conținut</h1>
        <div className="flex gap-2 flex-wrap">
          {groupEntries.length > 0 && (
            <button
              onClick={toggleAllGroups}
              data-testid="toggle-all-groups-btn"
              title={allGroupsCollapsed ? 'Extinde toate grupurile' : 'Restrânge toate grupurile'}
              className="px-4 py-2 theme-secondary text-xs tracking-widest uppercase font-content
                         hover:bg-[var(--surface-3)] hover:text-[var(--accent)] transition-colors">
              {allGroupsCollapsed ? <><ChevronDown size={14} className="inline" /> Extinde toate</> : <><ChevronUp size={14} className="inline" /> Restrânge toate</>}
            </button>
          )}
          <button
            onClick={() => dialogs.open({ kind: 'newGroup' })}
            data-testid="create-group-btn"
            className="px-4 py-2 theme-secondary text-xs tracking-widest uppercase font-content
                       hover:bg-[var(--surface-3)] hover:text-[var(--accent)] transition-colors">
            + Grup nou
          </button>
          <button
            onClick={() => dialogs.open({ kind: 'create', groupId: null })}
            data-testid="create-content-btn"
            className="px-4 py-2 theme-secondary text-xs tracking-widest uppercase font-content
                       hover:bg-[var(--surface-3)] hover:text-[var(--accent)] transition-colors">
            + Adaugă
          </button>
        </div>
      </div>

      {isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          <div data-testid="content-list" className="flex flex-col gap-2">
            {rootEntries.map(entry => (
              <Fragment key={entryId(entry)}>
                {entry.kind === 'item' ? (
                  <>
                    <SortableContentRow
                      item={entry.item}
                      dragData={{ type: 'item' }}
                      availableSites={availableSites}
                      highlighted={highlight?.kind === 'item' && highlight.id === entry.item.id}
                      onEdit={() => dialogs.open({ kind: 'edit', id: entry.item.id })}
                      onPublish={() => publishMut.mutate(entry.item.id)}
                      onArchive={() => archiveMut.mutate(entry.item.id)}
                      onDelete={() => { if (confirm('Muți acest element în arhivă?')) deleteMut.mutate(entry.item.id) }}
                      onDuplicate={() => duplicateMut.mutate(entry.item.id)}
                      onTogglePublish={() => togglePublishMut.mutate({ id: entry.item.id, currentState: entry.item.state })}
                    />
                  </>
                ) : (
                  <SortableGroupBlock
                    entry={entry}
                    availableSites={availableSites}
                    isCollapsed={collapsedGroups.has(entry.id)}
                    onToggleCollapse={() => toggleGroupCollapse(entry.id)}
                    highlightedId={highlight?.id ?? null}
                    onEdit={item => dialogs.open({ kind: 'edit', id: item.id })}
                    onEditGroup={() => dialogs.open({ kind: 'editGroup', id: entry.id })}
                    onPublish={id => publishMut.mutate(id)}
                    onArchive={id => archiveMut.mutate(id)}
                    onDelete={id => { if (confirm('Muți acest element în arhivă?')) deleteMut.mutate(id) }}
                    onDuplicate={id => duplicateMut.mutate(id)}
                    onTogglePublish={(id, currentState) => togglePublishMut.mutate({ id, currentState })}
                    onDeleteGroup={() => {
                      if (confirm(`Ștergi grupul "${entry.title}"? Elementele din grup vor fi mutate în arhivă.`))
                        deleteGroupMut.mutate(entry.id)
                    }}
                    onAddContent={() => dialogs.open({ kind: 'create', groupId: entry.id })}
                    onSortChronological={() => sortGroupChronologically(entry.id)}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeGroup && <GroupBlockOverlay title={activeGroup.title} />}
          {activeItem  && <ContentRowOverlay item={activeItem} />}
        </DragOverlay>
      </DndContext>

      {dataReady && dialog?.kind === 'create' && (
        <ContentDialog
          key={dialogKey(dialog)}
          groups={groups}
          availableSites={availableSites}
          defaultGroupId={dialog.groupId && groups.some(g => g.id === dialog.groupId) ? dialog.groupId : undefined}
          onClose={dialogs.close}
          onSaved={saved => {
            invalidate()
            if (saved?.id) setLanding({ kind: 'item', id: saved.id, savedAt: Date.now() })
            dialogs.close()
          }}
        />
      )}
      {dialog?.kind === 'edit' && dialogItem && (
        <ContentDialog
          key={dialogKey(dialog)}
          item={dialogItem}
          groups={groups}
          availableSites={availableSites}
          onClose={dialogs.close}
          onSaved={() => {
            invalidate()
            setLanding({ kind: 'item', id: dialogItem.id, savedAt: Date.now() })
            dialogs.close()
          }}
        />
      )}
      {dataReady && dialog?.kind === 'newGroup' && (
        <GroupDialog
          key={dialogKey(dialog)}
          availableSites={availableSites}
          onSubmit={(title, sites, sectionPreview) => createGroupMut.mutateAsync({ title, sites, sectionPreview })}
          onClose={dialogs.close}
          onSaved={saved => {
            if (saved?.id) setLanding({ kind: 'group', id: saved.id, savedAt: Date.now() })
            dialogs.close()
          }}
        />
      )}
      {dialog?.kind === 'editGroup' && dialogGroup && (
        <GroupDialog
          key={dialogKey(dialog)}
          group={dialogGroup}
          availableSites={availableSites}
          onSubmit={(title, sites, sectionPreview) => updateGroupMut.mutateAsync({ id: dialogGroup.id, patch: { title, sites, sectionPreview } })}
          onClose={dialogs.close}
          onSaved={() => {
            setLanding({ kind: 'group', id: dialogGroup.id, savedAt: Date.now() })
            dialogs.close()
          }}
        />
      )}
    </div>
  )
}

// ── Sortable group block ───────────────────────────────────────────────────────

function SortableGroupBlock({ entry, availableSites, isCollapsed, onToggleCollapse, highlightedId, onEdit, onEditGroup, onPublish, onArchive, onDelete, onDuplicate, onTogglePublish, onDeleteGroup, onAddContent, onSortChronological }: {
  entry: GroupEntry
  availableSites: Site[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  /** Item or group id carrying the after-save highlight (FR-112). */
  highlightedId: string | null
  onEdit: (item: ContentItem) => void
  /** Opens the "Editează grupul" dialog (FR-114). */
  onEditGroup: () => void
  onPublish: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onTogglePublish: (id: string, currentState: string) => void
  onDeleteGroup: () => void
  onAddContent: () => void
  onSortChronological: () => void
}) {
  const {
    attributes, listeners, setNodeRef: setSortableRef,
    setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: entry.id, data: { type: 'group' } })

  const { setNodeRef: setBodyRef, isOver } = useDroppable({
    id: `${entry.id}-body`,
    data: { type: 'group-body', groupId: entry.id },
    disabled: isCollapsed,
  })

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setSortableRef} style={style}
         className={`transition-colors ${isOver ? 'theme-selected' : 'theme-card'}`}
         data-testid={`group-block-${entry.id}`}
         data-highlight={highlightedId === entry.id ? 'true' : undefined}>
      <div className="flex items-center gap-2 px-3 py-2 theme-divider">
        <button ref={setActivatorNodeRef} {...listeners} {...attributes}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
          aria-label="Reordonează grup">
          <GripVertical size={16} />
        </button>
        <button
          onClick={onToggleCollapse}
          data-testid={`collapse-toggle-${entry.id}`}
          aria-label={isCollapsed ? 'Extinde grup' : 'Restrânge grup'}
          className="flex-shrink-0 text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1 text-xs leading-none">
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={onEditGroup}
          data-testid={`group-name-${entry.id}`}
          className="flex-1 text-xs tracking-widest uppercase font-content font-bold text-left hover:text-[var(--accent)] transition-colors cursor-pointer"
        >{entry.title}</button>
        <SiteCircles sites={entry.sites} exclusiveSite={null} availableSites={availableSites} />
        <button
          onClick={onSortChronological}
          data-testid={`group-sort-chronological-${entry.id}`}
          title="Sortează cronologic"
          className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
          aria-label="Sortează cronologic"
        >
          <ArrowUpDown size={14} />
        </button>
        <button
          onClick={onAddContent}
          data-testid={`group-add-content-${entry.id}`}
          title="Adaugă conținut în grup"
          className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
          aria-label="Adaugă conținut în grup"
        >
          <Plus size={14} />
        </button>
        <GroupContextMenu groupId={entry.id} onEdit={onEditGroup} onDelete={onDeleteGroup} />
      </div>

      {!isCollapsed && (
        <SortableContext items={entry.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <ul ref={setBodyRef} className="min-h-[2.5rem] flex flex-col gap-2 p-2" data-testid={`container-${entry.id}`}>
            {entry.items.map(item => (
              <SortableContentRow
                key={item.id} item={item}
                dragData={{ type: 'group-item', groupId: entry.id }}
                groupItems={entry.items}
                availableSites={availableSites}
                highlighted={highlightedId === item.id}
                onEdit={() => onEdit(item)}
                onPublish={() => onPublish(item.id)}
                onArchive={() => onArchive(item.id)}
                onDelete={() => onDelete(item.id)}
                onDuplicate={() => onDuplicate(item.id)}
                onTogglePublish={() => onTogglePublish(item.id, item.state)}
              />
            ))}
            {entry.items.length === 0 && (
              <li className="px-4 py-3 text-xs font-content text-[var(--muted)] italic">
                Trage elemente de conținut aici
              </li>
            )}
          </ul>
        </SortableContext>
      )}
    </div>
  )
}

// ── Item context menu ──────────────────────────────────────────────────────────

function ItemContextMenu({ itemId, onEdit, onDelete, onPublish, onArchive, onDuplicate, itemState }: {
  itemId: string
  onEdit: () => void
  onDelete: () => void
  onPublish: () => void
  onArchive: () => void
  onDuplicate: () => void
  itemState: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        data-testid={`item-menu-trigger-${itemId}`}
        onClick={() => setOpen(v => !v)}
        className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
        aria-label="Opțiuni"
      >
        <Settings size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] theme-overlay">
          {itemState !== 'published' && (
            <button
              data-testid={`item-menu-publish-${itemId}`}
              onClick={() => { setOpen(false); onPublish() }}
              className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--success)] transition-colors"
            >
              Publică
            </button>
          )}
          {itemState === 'published' && (
            <button
              data-testid={`item-menu-hide-${itemId}`}
              onClick={() => { setOpen(false); onArchive() }}
              className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--warning)] transition-colors"
            >
              Ascunde
            </button>
          )}
          <button
            data-testid={`item-menu-edit-${itemId}`}
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
          >
            Editează
          </button>
          <button
            data-testid={`item-menu-duplicate-${itemId}`}
            onClick={() => { setOpen(false); onDuplicate() }}
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
          >
            Duplică
          </button>
          <button
            data-testid={`item-menu-delete-${itemId}`}
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--danger)] transition-colors"
          >
            Șterge
          </button>
        </div>
      )}
    </div>
  )
}

// ── Group context menu ─────────────────────────────────────────────────────────

function GroupContextMenu({ groupId, onEdit, onDelete }: {
  groupId: string
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        data-testid={`group-menu-trigger-${groupId}`}
        onClick={() => setOpen(v => !v)}
        className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
        aria-label="Opțiuni grup"
      >
        <Settings size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] theme-overlay">
          <button
            data-testid={`group-menu-edit-${groupId}`}
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
          >
            Editează
          </button>
          <button
            data-testid={`group-menu-delete-${groupId}`}
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-[var(--danger)] transition-colors"
          >
            Șterge grup
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sortable content row ───────────────────────────────────────────────────────

function SortableContentRow({ item, dragData, groupItems, availableSites = [], highlighted = false, onEdit, onPublish, onArchive, onDelete, onDuplicate, onTogglePublish }: {
  item: ContentItem
  dragData: Record<string, unknown>
  /** Set on rows inside a group: shows the phone-preview pin toggle (spec 08, FR-104). */
  groupItems?: ContentItem[]
  availableSites?: Site[]
  highlighted?: boolean
  onEdit: () => void
  onPublish: () => void
  onArchive: () => void
  onDelete: () => void
  onDuplicate: () => void
  onTogglePublish: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { ...dragData, contentType: item.type } })

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const stateColor = item.state === 'published' ? 'text-[var(--success)]'
    : item.state === 'archived' ? 'text-[var(--muted)]'
    : item.state === 'deleted' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'
  const past = isItemPast(item)

  return (
    <li ref={setNodeRef} style={style}
        className="flex items-center gap-4 theme-card bg-[var(--surface)] px-4 py-3"
        data-testid={`content-row-${item.id}`}
        data-highlight={highlighted ? 'true' : undefined}>
      <button ref={setActivatorNodeRef} {...listeners} {...attributes}
        data-testid={`drag-handle-${item.id}`}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"
        aria-label="Reordonează">
        <GripVertical size={16} />
      </button>
      <span title={item.type} className="w-8 flex-shrink-0 flex items-center text-[var(--muted)]"><ContentTypeIcon type={item.type} /></span>
      <button
        onClick={onEdit}
        data-testid={`content-name-${item.id}`}
        className="flex-1 text-sm font-content truncate text-left hover:text-[var(--accent)] transition-colors cursor-pointer"
      >
        {(item.data as any).title ?? (item.data as any).name ?? (item.data as any).url ?? item.id}
      </button>
      {past && (
        <span
          data-testid={`past-badge-${item.id}`}
          className="hidden sm:inline flex-shrink-0 text-xs font-content uppercase tracking-widest text-[var(--warning)]"
          title="Conținut din trecut"
        >
          expirat
        </span>
      )}
      <SiteCircles sites={item.sites} exclusiveSite={item.exclusiveSite} availableSites={availableSites} />
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`hidden sm:inline text-xs font-content uppercase tracking-widest ${stateColor}`}>{item.state}</span>
        <button
          role="switch"
          aria-checked={item.state === 'published'}
          data-testid={`publish-toggle-${item.id}`}
          onClick={onTogglePublish}
          title={item.state === 'published' ? 'Depublică' : 'Publică'}
          className={`relative inline-flex h-5 w-9 p-0.5 flex-shrink-0 cursor-pointer
            transition-colors duration-200 focus:outline-none
            ${item.state === 'published' ? 'bg-green-500' : 'bg-[var(--surface-2)]'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
              ${item.state === 'published' ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
      </div>
      {groupItems && <GroupPinToggle item={item} />}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ItemContextMenu
          itemId={item.id}
          onEdit={onEdit}
          onDelete={onDelete}
          onPublish={onPublish}
          onArchive={onArchive}
          onDuplicate={onDuplicate}
          itemState={item.state}
        />
      </div>
    </li>
  )
}

// ── Drag overlays ──────────────────────────────────────────────────────────────

function ContentRowOverlay({ item }: { item: ContentItem }) {
  const stateColor = item.state === 'published' ? 'text-[var(--success)]'
    : item.state === 'archived' ? 'text-[var(--muted)]'
    : item.state === 'deleted' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'
  return (
    <li className="flex items-center gap-4 theme-selected px-4 py-3 opacity-90 list-none">
      <span className="flex-shrink-0 text-[var(--muted)] p-1"><GripVertical size={16} /></span>
      <span title={item.type} className="w-8 flex-shrink-0 flex items-center text-[var(--muted)]"><ContentTypeIcon type={item.type} /></span>
      <span className="flex-1 text-sm font-content truncate">{(item.data as any).title ?? (item.data as any).name ?? (item.data as any).url ?? item.id}</span>
      <span className={`text-xs font-content uppercase tracking-widest flex-shrink-0 ${stateColor}`}>{item.state}</span>
    </li>
  )
}

function GroupBlockOverlay({ title }: { title: string }) {
  return (
    <div className="theme-selected opacity-90">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[var(--muted)] p-1"><GripVertical size={16} /></span>
        <span className="text-xs tracking-widest uppercase font-content font-bold">{title}</span>
      </div>
    </div>
  )
}

function ContentTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'card':     return <SquareAsterisk size={16} />
    case 'richtext': return <AlignLeft size={16} />
    case 'video':    return <Video size={16} />
    case 'poster':   return <Image size={16} />
    default:         return <SquareAsterisk size={16} />
  }
}
