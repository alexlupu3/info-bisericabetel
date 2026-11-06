import { useEffect, useId, useRef } from 'react'

/**
 * In-dialog confirmation shown before unsaved form input is discarded (BR-060, FR-111).
 * Rendered as the `overlay` of a `Dialog` (whose content is inert meanwhile); `Esc` is
 * routed by the dialog to `onKeep`.
 */
export default function DiscardConfirm({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descId = useId()

  // "Continuă editarea" is focused; the dialog gives focus back to the field afterwards.
  useEffect(() => { keepRef.current?.focus() }, [])

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="discard-confirm"
        className="w-full max-w-[360px] bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-5"
      >
        <h3 id={titleId} className="text-sm font-bold uppercase tracking-widest">Renunți la modificări?</h3>
        <span aria-hidden="true" className="block w-6 h-0.5 mt-2 bg-[var(--accent)]" />
        <p id={descId} className="mt-3 text-sm font-content text-[var(--muted)]">
          Ai modificări nesalvate. Dacă închizi, se pierd.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            data-testid="discard-confirm-discard"
            className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--danger)] hover:opacity-80 transition-opacity"
          >
            Renunță
          </button>
          <button
            ref={keepRef}
            type="button"
            onClick={onKeep}
            data-testid="discard-confirm-keep"
            className="px-4 py-2 border border-[var(--text)] bg-[var(--text)] text-[var(--bg)] text-xs tracking-widest uppercase font-content
                       hover:border-[var(--accent)] transition-colors"
          >
            Continuă editarea
          </button>
        </div>
      </div>
    </div>
  )
}
