import {
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { X } from 'lucide-react'
import { isTopDialog, pushDialog, removeDialog, type DialogKind } from './DialogStackContext'
import { useScrollLock } from './useScrollLock'

/**
 * The admin dialog primitive (FR-110, ADR-027): a native `<dialog>` opened with
 * `showModal()`, so the browser puts it in the top layer, makes the rest of the page inert
 * and keeps focus inside it. On top of the platform it adds:
 *  - initial focus on a chosen element (default: the first form field, never the × button);
 *  - focus returned to the opener (or to `returnFocus()`) when it unmounts;
 *  - document scroll lock while any dialog is open;
 *  - `Esc` and backdrop clicks routed to `onRequestClose`, which the caller may ignore
 *    (the native `cancel` is always prevented); only the top-most dialog reacts to `Esc`;
 *  - a backdrop click counts only when the pointer went down *and* up on the backdrop;
 *  - layouts: `compact` / `centered` / `wide` (a full-screen sheet below 768 px) and `drawer`.
 *
 * The dialog is open while it is mounted: render it conditionally.
 */

export type DialogLayout = 'compact' | 'centered' | 'wide' | 'drawer'
export type CloseReason = 'escape' | 'backdrop' | 'close-button'

interface DialogProps {
  id?: string
  /** Visible title; also the accessible name unless `ariaLabel` is given. */
  title?: ReactNode
  /** Accessible name for dialogs without a visible title (the phone drawer). */
  ariaLabel?: string
  /** Context line under the title (e.g. the item being edited); wired to aria-describedby. */
  description?: ReactNode
  layout?: DialogLayout
  kind?: DialogKind
  onRequestClose: (reason: CloseReason) => void
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Element to focus after closing; defaults to the element focused before opening. */
  returnFocus?: () => HTMLElement | null | undefined
  testId?: string
  closeTestId?: string
  closeLabel?: string
  closeDisabled?: boolean
  /** Render the standard header (title + ×). The drawer draws its own. */
  header?: boolean
  /** Layer drawn over the dialog's content, e.g. the discard confirmation. */
  overlay?: ReactNode
  /** Makes the header and content inert while `overlay` is shown. */
  contentInert?: boolean
  /** Extra elements rendered outside the panel (e.g. the drawer's × at the FAB position). */
  outside?: ReactNode
  children: ReactNode
}

const PANEL_WIDTH: Record<Exclude<DialogLayout, 'drawer'>, string> = {
  compact: 'md:max-w-[440px]',
  centered: 'md:max-w-[640px]',
  wide: 'md:max-w-[720px]',
}

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Dialog({
  id,
  title,
  ariaLabel,
  description,
  layout = 'centered',
  kind = 'form',
  onRequestClose,
  initialFocusRef,
  returnFocus,
  testId,
  closeTestId,
  closeLabel = 'Închide',
  closeDisabled = false,
  header = true,
  overlay,
  contentInert = false,
  outside,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const closingRef = useRef(false)
  const downOnBackdrop = useRef(false)
  const lastEscAt = useRef(0)
  const latest = useRef({ onRequestClose, returnFocus, initialFocusRef })
  latest.current = { onRequestClose, returnFocus, initialFocusRef }

  useScrollLock()

  useLayoutEffect(() => {
    const el = ref.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closingRef.current = false
    if (!el.open) el.showModal()
    pushDialog({ el, kind })

    const target =
      latest.current.initialFocusRef?.current ??
      mainRef.current?.querySelector<HTMLElement>(`[data-dialog-content] :is(${FIELD_SELECTOR})`) ??
      mainRef.current?.querySelector<HTMLElement>(`[data-dialog-content] :is(${FOCUSABLE_SELECTOR})`) ??
      // Nothing focusable yet (e.g. still loading): the content itself, never the × button.
      mainRef.current?.querySelector<HTMLElement>('[data-dialog-content]') ??
      el
    target.focus({ preventScroll: true })

    return () => {
      closingRef.current = true
      removeDialog(el)
      if (el.open) el.close()
      const back = latest.current.returnFocus?.() ?? opener
      if (back && back.isConnected) back.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // `inert` is not a React 18 prop: set it by hand while the overlay is shown (in a layout
  // effect, so it is lifted before the overlay's cleanup returns focus to the content).
  // The focused field is remembered before it goes inert and gets its focus back afterwards.
  const focusBeforeInert = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (contentInert) {
      const active = document.activeElement
      focusBeforeInert.current = active instanceof HTMLElement && main.contains(active) ? active : null
      main.setAttribute('inert', '')
    } else if (main.hasAttribute('inert')) {
      main.removeAttribute('inert')
      const back = focusBeforeInert.current
      focusBeforeInert.current = null
      if (back?.isConnected) back.focus({ preventScroll: true })
    }
  }, [contentInert])

  const request = (reason: CloseReason) => latest.current.onRequestClose(reason)

  const isDrawer = layout === 'drawer'

  return (
    <dialog
      ref={ref}
      id={id}
      data-testid={testId}
      data-layout={layout}
      aria-modal="true"
      aria-labelledby={ariaLabel ? undefined : titleId}
      aria-label={ariaLabel}
      aria-describedby={description ? descId : undefined}
      className={`admin-dialog m-0 p-0 bg-transparent w-full h-full max-w-none max-h-none overflow-hidden
        text-[var(--text)] open:flex ${isDrawer
          ? 'justify-end'
          : 'items-stretch justify-center md:items-center md:p-6'}`}
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        const el = ref.current!
        if (!isTopDialog(el)) return
        // Preventing the keydown stops the native `cancel`, so the dialog only closes
        // when the caller agrees (BR-060).
        e.preventDefault()
        e.stopPropagation()
        lastEscAt.current = Date.now()
        request('escape')
      }}
      onCancel={e => {
        e.preventDefault()
        if (Date.now() - lastEscAt.current < 100) return
        if (!isTopDialog(ref.current!)) return
        request('escape')
      }}
      onClose={() => {
        // A browser may still force-close (e.g. a repeated Android back gesture): keep the
        // dialog modal while it is mounted and let the caller decide.
        const el = ref.current
        if (closingRef.current || !el || !el.isConnected || el.open) return
        el.showModal()
        request('escape')
      }}
      onPointerDown={e => { downOnBackdrop.current = e.target === ref.current }}
      onClick={e => {
        const fromBackdrop = downOnBackdrop.current && e.target === ref.current
        downOnBackdrop.current = false
        if (fromBackdrop) request('backdrop')
      }}
    >
      <div
        data-dialog-panel
        className={isDrawer
          ? 'admin-drawer-panel relative flex flex-col h-full w-[84%] max-w-[320px] theme-overlay'
          : `admin-dialog-panel relative flex flex-col w-full h-[100dvh] theme-overlay
             md:h-auto md:max-h-[calc(100dvh-3rem)] ${PANEL_WIDTH[layout]}`}
      >
        <div ref={mainRef} className="flex flex-col flex-1 min-h-0">
          {header && (
            <div className="flex items-start gap-3 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] theme-divider flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 id={titleId} className="text-sm font-bold uppercase tracking-widest">{title}</h2>
                <span aria-hidden="true" className="block w-6 h-0.5 mt-2 bg-[var(--accent)]" />
                {description && (
                  <p id={descId} className="mt-2 text-xs font-content text-[var(--muted)] truncate">{description}</p>
                )}
              </div>
              <button
                type="button"
                data-testid={closeTestId}
                onClick={() => request('close-button')}
                disabled={closeDisabled}
                aria-label={closeLabel}
                title={closeLabel}
                className="flex-shrink-0 -mr-1 p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>
          )}
          {!header && title && <h2 id={titleId} className="sr-only">{title}</h2>}
          <div data-dialog-content tabIndex={-1} className="flex flex-col flex-1 min-h-0 focus:outline-none">
            {children}
          </div>
        </div>
        {overlay}
      </div>
      {outside}
    </dialog>
  )
}

/** The scrolling middle of a dialog. */
export function DialogBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 ${className}`}>
      {children}
    </div>
  )
}

/** The fixed bottom bar of a dialog (sticky on the phone sheet). */
export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] theme-divider bg-[var(--surface-2)] flex-shrink-0">
      {children}
    </div>
  )
}
