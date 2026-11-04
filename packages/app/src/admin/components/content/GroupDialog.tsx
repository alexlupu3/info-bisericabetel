import { useState } from 'react'
import type { Group, Site } from '../../api/client'
import { useUnsavedChanges } from '../../context/UnsavedChangesContext'
import Dialog from '../ui/Dialog'
import DiscardConfirm from '../ui/DiscardConfirm'
import GroupForm from './GroupForm'

/**
 * "Grup nou" / "Editează grupul" (FR-114): same dismissal and leave-page rules as the
 * content dialog (BR-060). `onSubmit` performs the API call and resolves with the group.
 */
export default function GroupDialog({ group, availableSites, onSubmit, onClose, onSaved }: {
  /** Present in edit mode. */
  group?: Group | null
  availableSites: Site[]
  onSubmit: (title: string, sites: string[]) => Promise<Group>
  onClose: () => void
  onSaved: (group: Group | null) => void
}) {
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const unsaved = useUnsavedChanges(dirty, { onBlocked: () => setConfirming(true) })

  const keepEditing = () => { unsaved.keepEditing(); setConfirming(false) }
  const discard = () => {
    setConfirming(false)
    if (!unsaved.release()) onClose()
  }
  const requestClose = () => {
    if (busy) return
    if (confirming) { keepEditing(); return }
    if (dirty) setConfirming(true)
    else onClose()
  }

  const submit = async (title: string, sites: string[]) => {
    setBusy(true); setError('')
    try {
      const saved = await onSubmit(title, sites)
      setBusy(false)
      unsaved.release()
      onSaved(saved ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      testId="group-dialog"
      closeTestId="group-dialog-close"
      title={group ? 'Editează grupul' : 'Grup nou'}
      description={group?.title}
      layout="compact"
      onRequestClose={requestClose}
      closeDisabled={busy}
      contentInert={confirming}
      overlay={confirming && <DiscardConfirm onKeep={keepEditing} onDiscard={discard} />}
    >
      <GroupForm
        groupId={group?.id}
        initialTitle={group?.title ?? ''}
        initialSites={group?.sites ?? []}
        availableSites={availableSites}
        busy={busy}
        error={error}
        onSubmit={submit}
        onCancel={requestClose}
        onDirtyChange={setDirty}
      />
    </Dialog>
  )
}
