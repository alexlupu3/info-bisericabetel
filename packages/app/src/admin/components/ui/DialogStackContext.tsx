import { useSyncExternalStore } from 'react'

/**
 * The stack of open admin dialogs (FR-110), top-most last. It is a tiny external store
 * rather than a React context so that providers mounted above the dialogs (the toast
 * outlet, the phone FAB) can follow it without re-rendering the whole admin tree.
 */

export type DialogKind = 'form' | 'drawer' | 'picker'

export interface DialogEntry {
  el: HTMLDialogElement
  kind: DialogKind
}

let stack: DialogEntry[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function pushDialog(entry: DialogEntry) {
  stack = [...stack.filter(e => e.el !== entry.el), entry]
  emit()
}

export function removeDialog(el: HTMLDialogElement) {
  if (!stack.some(e => e.el === el)) return
  stack = stack.filter(e => e.el !== el)
  emit()
}

export function isTopDialog(el: HTMLDialogElement): boolean {
  return stack.length > 0 && stack[stack.length - 1].el === el
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot() {
  return stack
}

export function useDialogStack(): DialogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The top-most open dialog element, or null: toasts render inside it (FR-109). */
export function useTopDialogElement(): HTMLDialogElement | null {
  const s = useDialogStack()
  return s.length ? s[s.length - 1].el : null
}

/** True while a form dialog (or a picker on top of one) is open: the phone FAB hides (FR-108). */
export function useHasModalDialog(): boolean {
  return useDialogStack().some(e => e.kind !== 'drawer')
}
