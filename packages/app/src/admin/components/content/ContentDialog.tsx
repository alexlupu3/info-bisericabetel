import { useState } from 'react'
import type { ContentItem, Group, Site } from '../../api/client'
import { useUnsavedChanges } from '../../context/UnsavedChangesContext'
import Dialog from '../ui/Dialog'
import DiscardConfirm from '../ui/DiscardConfirm'
import ContentForm from './ContentForm'

function itemLabel(item: ContentItem): string {
  const d = item.data as Record<string, unknown>
  return String(d.title ?? d.name ?? d.url ?? item.id)
}

/**
 * Create or edit a content item in a modal dialog (FR-111, FR-114). Owns the dismissal
 * rules (BR-060): an untouched form closes at once; a changed one asks first, also when
 * the editor navigates away (via `useUnsavedChanges`); nothing can be dismissed while a
 * save is in flight.
 */
export default function ContentDialog({ item, groups, availableSites, defaultGroupId, onClose, onSaved }: {
  /** Present in edit mode. */
  item?: ContentItem | null
  groups: Group[]
  availableSites: Site[]
  defaultGroupId?: string
  onClose: () => void
  /** Called after a successful Romanian save, once the form stopped guarding. */
  onSaved: (saved: ContentItem | null) => void
}) {
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const unsaved = useUnsavedChanges(dirty, { onBlocked: () => setConfirming(true) })
  const isEdit = !!item

  const keepEditing = () => { unsaved.keepEditing(); setConfirming(false) }
  const discard = () => {
    setConfirming(false)
    // A blocked navigation completes and unmounts us; otherwise close ourselves.
    if (!unsaved.release()) onClose()
  }
  const requestClose = () => {
    if (busy) return
    if (confirming) { keepEditing(); return }
    if (dirty) setConfirming(true)
    else onClose()
  }

  return (
    <Dialog
      testId="content-dialog"
      closeTestId="content-dialog-close"
      title={isEdit ? 'Editează element' : 'Element nou'}
      description={item ? itemLabel(item) : undefined}
      layout={isEdit ? 'wide' : 'centered'}
      onRequestClose={requestClose}
      closeDisabled={busy}
      contentInert={confirming}
      overlay={confirming && <DiscardConfirm onKeep={keepEditing} onDiscard={discard} />}
    >
      <ContentForm
        item={item}
        groups={groups}
        availableSites={availableSites}
        defaultGroupId={defaultGroupId}
        onCancel={requestClose}
        onDirtyChange={setDirty}
        onBusyChange={setBusy}
        onSaved={saved => { unsaved.release(); onSaved(saved) }}
      />
    </Dialog>
  )
}
