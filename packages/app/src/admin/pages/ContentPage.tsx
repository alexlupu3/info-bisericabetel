import { useState, useEffect, useRef, Fragment } from 'react'
import { GripVertical, ChevronRight, ChevronDown, ChevronUp, Settings, SquareAsterisk, AlignLeft, Video, Image, Plus } from 'lucide-react'
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
import { api, type ContentItem, type Group, type Site } from '../api/client'
import { useToast } from '../context/ToastContext'

const CONTENT_TYPES = ['card', 'richtext', 'poster', 'video'] as const

// ── Site circles ───────────────────────────────────────────────────────────────

function SiteCircles({ sites, availableSites }: { sites: string[]; availableSites: Site[] }) {
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
  const { data: contentData, isLoading } = useQuery({ queryKey: ['admin-content'], queryFn: api.content.list })
  const { data: groupsData } = useQuery({ queryKey: ['admin-groups'], queryFn: api.groups.list })
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: api.sites.list })
  const availableSites = sitesData?.sites ?? []

  const [creating, setCreating] = useState(false)
  const [creatingInGroup, setCreatingInGroup] = useState<string | null>(null)
  const [editing, setEditing] = useState<ContentItem | null>(null)
  const editingFormRef = useRef<HTMLDivElement | null>(null)

  // Scroll the inline edit form into view whenever a different item is opened for editing
  useEffect(() => {
    if (editing && editingFormRef.current) {
      editingFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [editing?.id])

  const [creatingGroup, setCreatingGroup] = useState(false)
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
  const createGroupMut = useMutation({
    mutationFn: ({ title, sites }: { title: string; sites: string[] }) => api.groups.create(title, sites),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); toast('Grup creat'); setCreatingGroup(false) },
  })
  const updateGroupMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { title?: string; sites?: string[] } }) =>
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Conținut</h1>
        <div className="flex gap-2">
          {groupEntries.length > 0 && (
            <button
              onClick={toggleAllGroups}
              data-testid="toggle-all-groups-btn"
              title={allGroupsCollapsed ? 'Extinde toate grupurile' : 'Restrânge toate grupurile'}
              className="px-4 py-2 border border-[var(--border)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
              {allGroupsCollapsed ? <><ChevronDown size={14} className="inline" /> Extinde toate</> : <><ChevronUp size={14} className="inline" /> Restrânge toate</>}
            </button>
          )}
          <button
            onClick={() => setCreatingGroup(v => !v)}
            data-testid="create-group-btn"
            className="px-4 py-2 border border-[var(--border)] text-xs tracking-widest uppercase font-content
                       hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
            + Grup nou
          </button>
          <button
            onClick={() => { setEditing(null); setCreating(true) }}
            data-testid="create-content-btn"
            className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                       hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
            + Adaugă
          </button>
        </div>
      </div>

      {creatingGroup && (
        <CreateGroupForm
          availableSites={availableSites}
          onClose={() => setCreatingGroup(false)}
          onCreated={(title, sites) => createGroupMut.mutate({ title, sites })}
          busy={createGroupMut.isPending}
        />
      )}

      {creating && (
        <ContentForm groups={groups} availableSites={availableSites}
          onClose={() => setCreating(false)}
          onSaved={() => { invalidate(); setCreating(false) }} />
      )}

      {creatingInGroup && (
        <ContentForm
          groups={groups}
          availableSites={availableSites}
          defaultGroupId={creatingInGroup}
          onClose={() => setCreatingInGroup(null)}
          onSaved={() => { invalidate(); setCreatingInGroup(null) }}
        />
      )}

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
                      onEdit={() => { setCreating(false); setEditing(entry.item) }}
                      onPublish={() => publishMut.mutate(entry.item.id)}
                      onArchive={() => archiveMut.mutate(entry.item.id)}
                      onDelete={() => { if (confirm('Muți acest element în arhivă?')) deleteMut.mutate(entry.item.id) }}
                      onTogglePublish={() => togglePublishMut.mutate({ id: entry.item.id, currentState: entry.item.state })}
                    />
                    {editing?.id === entry.item.id && (
                      <div ref={editingFormRef}>
                        <ContentForm item={editing} groups={groups} availableSites={availableSites}
                          onClose={() => setEditing(null)}
                          onSaved={() => { invalidate(); setEditing(null) }} />
                      </div>
                    )}
                  </>
                ) : (
                  <SortableGroupBlock
                    entry={entry}
                    availableSites={availableSites}
                    isCollapsed={collapsedGroups.has(entry.id)}
                    onToggleCollapse={() => toggleGroupCollapse(entry.id)}
                    editingItem={editing}
                    editingFormRef={editing && entry.items.some(i => i.id === editing.id) ? editingFormRef : null}
                    onEdit={item => { setCreating(false); setEditing(item) }}
                    onEditClose={() => setEditing(null)}
                    onEditSaved={() => { invalidate(); setEditing(null) }}
                    onEditGroup={(id, patch) => updateGroupMut.mutate({ id, patch })}
                    onPublish={id => publishMut.mutate(id)}
                    onArchive={id => archiveMut.mutate(id)}
                    onDelete={id => { if (confirm('Muți acest element în arhivă?')) deleteMut.mutate(id) }}
                    onTogglePublish={(id, currentState) => togglePublishMut.mutate({ id, currentState })}
                    onDeleteGroup={() => {
                      if (confirm(`Ștergi grupul "${entry.title}"? Elementele din grup vor fi mutate în arhivă.`))
                        deleteGroupMut.mutate(entry.id)
                    }}
                    onAddContent={() => { setEditing(null); setCreating(false); setCreatingInGroup(entry.id) }}
                    groups={groups}
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
    </div>
  )
}

// ── Sortable group block ───────────────────────────────────────────────────────

function SortableGroupBlock({ entry, availableSites, isCollapsed, onToggleCollapse, editingItem, editingFormRef, onEdit, onEditClose, onEditSaved, onEditGroup, onPublish, onArchive, onDelete, onTogglePublish, onDeleteGroup, onAddContent, groups }: {
  entry: GroupEntry
  availableSites: Site[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  editingItem: ContentItem | null
  editingFormRef: React.MutableRefObject<HTMLDivElement | null> | null
  onEdit: (item: ContentItem) => void
  onEditClose: () => void
  onEditSaved: () => void
  onEditGroup: (id: string, patch: { title?: string; sites?: string[] }) => void
  onPublish: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onTogglePublish: (id: string, currentState: string) => void
  onDeleteGroup: () => void
  onAddContent: () => void
  groups: Group[]
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

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(entry.title)
  const [editSites, setEditSites] = useState<string[]>(entry.sites)

  const openEdit = () => {
    setEditTitle(entry.title)
    setEditSites(entry.sites)
    setIsEditing(true)
  }
  const saveEdit = () => {
    onEditGroup(entry.id, { title: editTitle, sites: editSites })
    setIsEditing(false)
  }
  const toggleEditSite = (slug: string) =>
    setEditSites(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setSortableRef} style={style}
         className={`border transition-colors ${isOver ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
         data-testid={`group-block-${entry.id}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
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
          onClick={openEdit}
          data-testid={`group-name-${entry.id}`}
          className="flex-1 text-xs tracking-widest uppercase font-content font-bold text-left hover:text-[var(--accent)] transition-colors cursor-pointer"
        >{entry.title}</button>
        <SiteCircles sites={entry.sites} availableSites={availableSites} />
        <button
          onClick={onAddContent}
          data-testid={`group-add-content-${entry.id}`}
          title="Adaugă conținut în grup"
          className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1 rounded"
          aria-label="Adaugă conținut în grup"
        >
          <Plus size={14} />
        </button>
        <GroupContextMenu groupId={entry.id} onEdit={openEdit} onDelete={onDeleteGroup} />
      </div>

      {isEditing && (
        <div className="px-4 py-3 border-b border-[var(--border)] space-y-3 bg-[var(--surface)]"
             data-testid={`edit-group-panel-${entry.id}`}>
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Titlu grup *</label>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              data-testid={`edit-group-title-${entry.id}`}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && editTitle) saveEdit() }}
              className="w-full bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
          </div>
          {availableSites.length > 0 && (
            <div>
              <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
                Locații <span className="normal-case text-[var(--muted)]">(gol = toate)</span>
              </label>
              <div className="flex gap-4">
                {availableSites.map(s => (
                  <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={editSites.includes(s.slug)}
                      onChange={() => toggleEditSite(s.slug)}
                      data-testid={`edit-group-site-${s.slug}`}
                      className="accent-[var(--accent)]" />
                    <span className="text-xs font-content">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={!editTitle}
              data-testid={`edit-group-save-${entry.id}`}
              className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] transition-colors disabled:opacity-40">
              Salvează
            </button>
            <button onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]">
              Anulează
            </button>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <SortableContext items={entry.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <ul ref={setBodyRef} className="min-h-[2.5rem] flex flex-col gap-2 p-2" data-testid={`container-${entry.id}`}>
            {entry.items.map(item => (
              <SortableContentRow
                key={item.id} item={item}
                dragData={{ type: 'group-item', groupId: entry.id }}
                availableSites={availableSites}
                onEdit={() => onEdit(item)}
                onPublish={() => onPublish(item.id)}
                onArchive={() => onArchive(item.id)}
                onDelete={() => onDelete(item.id)}
                onTogglePublish={() => onTogglePublish(item.id, item.state)}
              />
            ))}
            {entry.items.length === 0 && (
              <li className="px-4 py-3 text-xs font-content text-[var(--muted)] italic">
                Trage elemente de conținut aici
              </li>
            )}
          </ul>
          {editingItem && editingFormRef && entry.items.some(i => i.id === editingItem.id) && (
            <div ref={editingFormRef} className="border-t border-[var(--border)]">
              <ContentForm item={editingItem} groups={groups} availableSites={availableSites}
                onClose={onEditClose}
                onSaved={onEditSaved} />
            </div>
          )}
        </SortableContext>
      )}
    </div>
  )
}

// ── Item context menu ──────────────────────────────────────────────────────────

function ItemContextMenu({ itemId, onEdit, onDelete, onPublish, onArchive, itemState }: {
  itemId: string
  onEdit: () => void
  onDelete: () => void
  onPublish: () => void
  onArchive: () => void
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
        className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1 rounded"
        aria-label="Opțiuni"
      >
        <Settings size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] bg-[var(--surface)] border border-[var(--border)] shadow-lg">
          {itemState !== 'published' && (
            <button
              data-testid={`item-menu-publish-${itemId}`}
              onClick={() => { setOpen(false); onPublish() }}
              className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-green-400 transition-colors"
            >
              Publică
            </button>
          )}
          {itemState === 'published' && (
            <button
              data-testid={`item-menu-hide-${itemId}`}
              onClick={() => { setOpen(false); onArchive() }}
              className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-yellow-400 transition-colors"
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
            data-testid={`item-menu-delete-${itemId}`}
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-red-400 transition-colors"
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
        className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1 rounded"
        aria-label="Opțiuni grup"
      >
        <Settings size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-[var(--surface)] border border-[var(--border)] shadow-lg">
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
            className="w-full text-left px-4 py-2 text-xs font-content tracking-widest uppercase hover:bg-[var(--bg)] text-red-400 transition-colors"
          >
            Șterge grup
          </button>
        </div>
      )}
    </div>
  )
}

// ── Past-item helper ───────────────────────────────────────────────────────────

function isItemPast(item: ContentItem): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const d = item.data as { endDate?: string; startDate?: string }
  if (d.endDate) return new Date(d.endDate) < today
  if (d.startDate) return new Date(d.startDate) < today

  if (item.expiresAt) return new Date(item.expiresAt) <= today
  return false
}

// ── Sortable content row ───────────────────────────────────────────────────────

function SortableContentRow({ item, dragData, availableSites = [], onEdit, onPublish, onArchive, onDelete, onTogglePublish }: {
  item: ContentItem
  dragData: Record<string, unknown>
  availableSites?: Site[]
  onEdit: () => void
  onPublish: () => void
  onArchive: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { ...dragData, contentType: item.type } })

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const stateColor = item.state === 'published' ? 'text-green-400'
    : item.state === 'archived' ? 'text-[var(--muted)]'
    : item.state === 'deleted' ? 'text-red-400' : 'text-yellow-400'
  const past = isItemPast(item)

  return (
    <li ref={setNodeRef} style={style}
        className="flex items-center gap-4 border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
        data-testid={`content-row-${item.id}`}>
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
          className="hidden sm:inline flex-shrink-0 text-xs font-content uppercase tracking-widest text-amber-500"
          title="Conținut din trecut"
        >
          expirat
        </span>
      )}
      <SiteCircles sites={item.sites} availableSites={availableSites} />
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`hidden sm:inline text-xs font-content uppercase tracking-widest ${stateColor}`}>{item.state}</span>
        <button
          role="switch"
          aria-checked={item.state === 'published'}
          data-testid={`publish-toggle-${item.id}`}
          onClick={onTogglePublish}
          title={item.state === 'published' ? 'Depublică' : 'Publică'}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 focus:outline-none
            ${item.state === 'published' ? 'bg-green-500' : 'bg-[var(--border)]'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
              ${item.state === 'published' ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ItemContextMenu
          itemId={item.id}
          onEdit={onEdit}
          onDelete={onDelete}
          onPublish={onPublish}
          onArchive={onArchive}
          itemState={item.state}
        />
      </div>
    </li>
  )
}

// ── Drag overlays ──────────────────────────────────────────────────────────────

function ContentRowOverlay({ item }: { item: ContentItem }) {
  const stateColor = item.state === 'published' ? 'text-green-400'
    : item.state === 'archived' ? 'text-[var(--muted)]'
    : item.state === 'deleted' ? 'text-red-400' : 'text-yellow-400'
  return (
    <li className="flex items-center gap-4 border border-[var(--accent)] bg-[var(--surface)] px-4 py-3 opacity-90 list-none">
      <span className="flex-shrink-0 text-[var(--muted)] p-1"><GripVertical size={16} /></span>
      <span title={item.type} className="w-8 flex-shrink-0 flex items-center text-[var(--muted)]"><ContentTypeIcon type={item.type} /></span>
      <span className="flex-1 text-sm font-content truncate">{(item.data as any).title ?? (item.data as any).name ?? (item.data as any).url ?? item.id}</span>
      <span className={`text-xs font-content uppercase tracking-widest flex-shrink-0 ${stateColor}`}>{item.state}</span>
    </li>
  )
}

function GroupBlockOverlay({ title }: { title: string }) {
  return (
    <div className="border border-[var(--accent)] bg-[var(--surface)] opacity-90">
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

// ── Create group form ──────────────────────────────────────────────────────────

function CreateGroupForm({ availableSites, onClose, onCreated, busy }: {
  availableSites: Site[]
  onClose: () => void
  onCreated: (title: string, sites: string[]) => void
  busy: boolean
}) {
  const [title, setTitle] = useState('')
  const [sites, setSites] = useState<string[]>([])
  const toggleSite = (slug: string) =>
    setSites(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])

  return (
    <div className="border border-[var(--border)] p-4 mb-4 space-y-3" data-testid="create-group-form">
      <div>
        <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Titlu grup *</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="ex. Anunțuri duminică"
          data-testid="create-group-title"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && title) onCreated(title, sites) }}
          className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
      </div>
      {availableSites.length > 0 && (
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
            Locații <span className="normal-case text-[var(--muted)]">(gol = toate)</span>
          </label>
          <div className="flex gap-4">
            {availableSites.map(s => (
              <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={sites.includes(s.slug)}
                  onChange={() => toggleSite(s.slug)}
                  data-testid={`create-group-site-${s.slug}`}
                  className="accent-[var(--accent)]" />
                <span className="text-xs font-content">{s.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={() => onCreated(title, sites)} disabled={busy || !title}
          data-testid="create-group-submit"
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] transition-colors disabled:opacity-40">
          {busy ? 'Se creează…' : 'Creează'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]">Anulează</button>
      </div>
    </div>
  )
}

// ── Shared form state ──────────────────────────────────────────────────────────

type FormData = {
  type: string; sites: string[]; exclusiveSite: string | null; expiresAt: string; groupId: string
  title: string; body: string; description: string; date: string; endDate: string; link: string; cta: string; imageUrl: string; url: string
  name: string; thumbnail: string
  siteLinks: Record<string, string>
}

function itemToForm(item?: ContentItem | null): FormData {
  const d = (item?.data ?? {}) as Record<string, any>
  return {
    type:        item?.type ?? 'card',
    sites:       item?.sites ?? [],
    exclusiveSite: item?.exclusiveSite ?? null,
    expiresAt:   item?.expiresAt ? item.expiresAt.slice(0, 10) : '',
    groupId:     item?.groupId ?? '',
    title:       d.title ?? '',
    body:        d.body  ?? '',
    description: d.description ?? '',
    date:        d.startDate ?? '',
    link:        d.link  ?? '',
    endDate:     d.endDate ?? '',
    cta:         d.cta   ?? '',
    imageUrl:    d.imageUrl   ?? '',
    url:         d.url        ?? '',
    name:        d.name       ?? '',
    thumbnail:   d.thumbnail  ?? '',
    siteLinks:   d.siteLinks ?? {},
  }
}

function formToPayload(f: FormData) {
  const data: Record<string, any> = {}
  // Filter out empty siteLinks entries
  const siteLinks = Object.fromEntries(Object.entries(f.siteLinks).filter(([, v]) => v))
  if (f.type === 'richtext') {
    if (f.title) data.title = f.title
    data.body = f.body
  } else if (f.type === 'card') {
    data.title = f.title
    if (f.description) data.description = f.description
    if (f.link)        data.link        = f.link
    if (f.cta)         data.cta         = f.cta
    if (f.thumbnail)   data.thumbnail   = f.thumbnail
    if (Object.keys(siteLinks).length) data.siteLinks = siteLinks
  } else if (f.type === 'poster') {
    data.imageUrl = f.imageUrl
    if (f.name) data.name = f.name
    if (f.link) data.link = f.link
    if (Object.keys(siteLinks).length) data.siteLinks = siteLinks
  } else if (f.type === 'video') {
    data.url = f.url
    if (f.title) data.title = f.title
  }
  // Shared date fields — apply to all content types
  if (f.date)    data.startDate = f.date
  if (f.endDate) data.endDate   = f.endDate
  const exclusive = f.exclusiveSite !== null
  return {
    type: f.type,
    sites: exclusive ? [] : f.sites,
    exclusiveSite: f.exclusiveSite,
    groupId: f.groupId || null,
    expiresAt: f.expiresAt || null,
    data,
  }
}

// ── Media library modal ─────────────────────────────────────────────────────────

function MediaLibraryModal({ onSelect, onClose }: {
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

// ── Image picker ────────────────────────────────────────────────────────────────

function ImagePicker({ label, value, onChange, testId }: {
  label: string
  value: string
  onChange: (url: string) => void
  testId?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  const handleUpload = async (file: File) => {
    setUploading(true); setUploadError('')
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Imaginea depășește limita de 5 MB.')
      setUploading(false)
      return
    }
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionStorage.getItem('betel-admin-token')}` },
        body: fd,
      })
      if (!res.ok) {
        let msg = `Eroare la upload (${res.status})`
        try { const j = await res.json(); msg = j.error ?? msg } catch {}
        throw new Error(msg)
      }
      const json = await res.json()
      onChange(json.url)
    } catch (e: any) { setUploadError(e.message) } finally { setUploading(false) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <div>
      <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
        {label}
      </label>

      {value ? (
        <div className="space-y-2">
          <img src={value} alt="" data-testid={testId} className="max-h-32 object-cover opacity-80" />
          <div className="flex gap-2">
            <label className="px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content cursor-pointer hover:border-[var(--accent)] transition-colors"
                   data-testid="upload-btn">
              {uploading ? '…' : 'Înlocuiește'}
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
            </label>
            <button type="button" onClick={() => setShowLibrary(true)}
              className="px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content hover:border-[var(--accent)] transition-colors">
              Librărie
            </button>
            <button type="button" onClick={() => onChange('')}
              className="px-3 py-1.5 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Șterge
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label
            className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed h-28 cursor-pointer transition-colors ${
              dragging ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--border)] hover:border-[var(--accent)]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            data-testid="upload-btn"
          >
            {uploading
              ? <span className="text-sm font-content text-[var(--muted)]">Se încarcă…</span>
              : <>
                  <span className="text-sm font-content text-[var(--muted)]">Trage imaginea aici</span>
                  <span className="text-xs font-content text-[var(--muted)] opacity-60">sau click pentru upload</span>
                </>
            }
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
          </label>
          <button type="button" onClick={() => setShowLibrary(true)}
            className="w-full px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content hover:border-[var(--accent)] transition-colors">
            Alege din librărie
          </button>
        </div>
      )}

      {uploadError && <p className="text-red-400 text-xs font-content mt-1">{uploadError}</p>}
      {showLibrary && (
        <MediaLibraryModal
          onSelect={url => { onChange(url); setShowLibrary(false) }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  )
}

// ── Site link overrides ────────────────────────────────────────────────────────

function SiteLinkOverrides({ form, set, availableSites }: {
  form: FormData
  set: (patch: Partial<FormData>) => void
  availableSites: Site[]
}) {
  if (!form.link) return null

  const relevantSites = form.sites.length > 0
    ? availableSites.filter(s => form.sites.includes(s.slug))
    : availableSites

  if (relevantSites.length === 0) return null

  const hasOverrides = relevantSites.some(s => form.siteLinks[s.slug])
  const [expanded, setExpanded] = useState(hasOverrides)

  const setSiteLink = (slug: string, url: string) =>
    set({ siteLinks: { ...form.siteLinks, [slug]: url } })

  return (
    <div>
      <button
        type="button"
        data-testid="site-link-overrides-toggle"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Link-uri per locație
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 pl-4 border-l-2 border-[var(--border)]">
          {relevantSites.map(s => (
            <div key={s.slug} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.accent }}
              />
              <label className="text-xs font-content text-[var(--muted)] w-20 flex-shrink-0">{s.name}</label>
              <input
                data-testid={`site-link-input-${s.slug}`}
                value={form.siteLinks[s.slug] ?? ''}
                onChange={e => setSiteLink(s.slug, e.target.value)}
                placeholder="Folosește link-ul implicit"
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 text-sm font-content"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Content form ───────────────────────────────────────────────────────────────

function ContentForm({ item, groups, availableSites, defaultGroupId, onClose, onSaved }: {
  item?: ContentItem | null; groups: Group[]; availableSites: Site[]; defaultGroupId?: string; onClose: () => void; onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<FormData>(() => {
    const base = itemToForm(item)
    if (!item && defaultGroupId) return { ...base, groupId: defaultGroupId }
    return base
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<FormData>) => setForm(f => ({ ...f, ...patch }))
  const toggleSite = (slug: string) =>
    set({ sites: form.sites.includes(slug) ? form.sites.filter(s => s !== slug) : [...form.sites, slug] })

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const payload = formToPayload(form)
      if (item) { await api.content.update(item.id, payload); toast('Salvat') }
      else       { await api.content.create(payload); toast('Element creat') }
      onSaved()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const isEdit = !!item

  return (
    <div className="border border-[var(--border)] p-4 mb-6 space-y-4"
         data-testid={isEdit ? 'edit-form' : 'create-form'}>
      <span className="text-sm font-bold uppercase tracking-widest">{isEdit ? 'Editează' : 'Conținut nou'}</span>
      {error && <p className="text-red-400 text-sm font-content">{error}</p>}

      {!isEdit && (
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Tip</label>
          <select value={form.type} onChange={e => set({ type: e.target.value })}
            data-testid="create-type-select"
            className="bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content">
            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {(form.type === 'richtext' || form.type === 'card') && (
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
            Titlu{form.type === 'card' ? ' *' : ' (opțional)'}
          </label>
          <input value={form.title} onChange={e => set({ title: e.target.value })}
            data-testid="create-title-input"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
      )}

      {form.type === 'richtext' && (
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Conținut Markdown *</label>
          <textarea value={form.body} onChange={e => set({ body: e.target.value })}
            data-testid="create-body-input" rows={5}
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
      )}

      {form.type === 'card' && (<>
        <ImagePicker
          label="Miniatură (opțional)"
          value={form.thumbnail}
          onChange={url => set({ thumbnail: url })}
          testId="create-thumbnail-input"
        />
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Descriere</label>
          <textarea value={form.description} onChange={e => set({ description: e.target.value })}
            data-testid="create-description-input" rows={3}
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Link CTA</label>
            <input value={form.link} onChange={e => set({ link: e.target.value })} placeholder="https://..."
              data-testid="create-link-input"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
          </div>
          <div className="flex-1">
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Text buton (opțional)</label>
            <input value={form.cta} onChange={e => set({ cta: e.target.value })} placeholder="ex: Înregistrează-te"
              data-testid="create-cta-input"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
          </div>
        </div>
        <SiteLinkOverrides form={form} set={set} availableSites={availableSites} />
      </>)}

      {form.type === 'poster' && (<>
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Nume (admin)</label>
          <input value={form.name} onChange={e => set({ name: e.target.value })}
            placeholder="ex: Poster Paște 2025"
            data-testid="create-poster-name-input"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
        <ImagePicker
          label="Imagine *"
          value={form.imageUrl}
          onChange={url => set({ imageUrl: url })}
          testId="create-image-url-input"
        />
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Link (opțional)</label>
          <input value={form.link} onChange={e => set({ link: e.target.value })} placeholder="https://..."
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
        <SiteLinkOverrides form={form} set={set} availableSites={availableSites} />
      </>)}

      {form.type === 'video' && (<>
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">URL YouTube *</label>
          <input value={form.url} onChange={e => set({ url: e.target.value })}
            placeholder="https://youtu.be/... sau ID"
            data-testid="create-url-input"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
        <div>
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Titlu (opțional)</label>
          <input value={form.title} onChange={e => set({ title: e.target.value })}
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
      </>)}

      {/* Shared date fields — available for all content types */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Dată (opțional)</label>
          <input type="date" value={form.date} onChange={e => set({ date: e.target.value, endDate: e.target.value ? form.endDate : '' })}
            data-testid="create-date-input"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
        </div>
        {form.date && (
          <div className="flex-1">
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Până la (opțional)</label>
            <input type="date" value={form.endDate} min={form.date} onChange={e => set({ endDate: e.target.value })}
              data-testid="create-end-date-input"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-1.5 cursor-pointer" title="Ascunde din vizualizarea tuturor locațiilor">
          <input type="checkbox" checked={form.exclusiveSite !== null}
            onChange={e => set(e.target.checked
              ? { exclusiveSite: availableSites[0]?.slug ?? null, sites: [] }
              : { exclusiveSite: null })}
            data-testid="exclusive-toggle"
            className="accent-[var(--accent)]" />
          <span className="text-xs tracking-widest uppercase text-[var(--muted)] font-content">
            Exclusiv unei locații <span className="normal-case text-[var(--muted)]">(ascunde din vizualizarea tuturor locațiilor)</span>
          </span>
        </label>

        {form.exclusiveSite === null ? (
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
              Locații <span className="normal-case text-[var(--muted)]">(gol = toate)</span>
            </label>
            <div className="flex gap-4">
              {availableSites.map(s => (
                <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.sites.includes(s.slug)}
                    onChange={() => toggleSite(s.slug)}
                    data-testid={`site-check-${s.slug}`}
                    className="accent-[var(--accent)]" />
                  <span className="text-xs font-content">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-2">
              Locație <span className="normal-case text-[var(--muted)]">(obligatoriu)</span>
            </label>
            <div className="flex gap-4">
              {availableSites.map(s => (
                <label key={s.slug} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="exclusive-site"
                    checked={form.exclusiveSite === s.slug}
                    onChange={() => set({ exclusiveSite: s.slug })}
                    data-testid={`exclusive-site-radio-${s.slug}`}
                    className="accent-[var(--accent)]" />
                  <span className="text-xs font-content">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={submit}
          disabled={busy || (form.exclusiveSite !== null && !availableSites.find(s => s.slug === form.exclusiveSite))}
          data-testid="create-submit-btn"
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] transition-colors disabled:opacity-40">
          {busy ? 'Se salvează…' : isEdit ? 'Salvează' : 'Creează'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]">
          Anulează
        </button>
      </div>
    </div>
  )
}
