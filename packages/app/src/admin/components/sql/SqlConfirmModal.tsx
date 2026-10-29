import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export const CONFIRM_WINDOW_MS = 5000

interface Props {
  query: string
  readOnly: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Warning shown before every console query. The confirm button must be pressed
 * twice within CONFIRM_WINDOW_MS; after that the first press expires.
 */
export default function SqlConfirmModal({ query, readOnly, onConfirm, onCancel }: Props) {
  const [armedAt, setArmedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { cancelRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  useEffect(() => {
    if (armedAt === null) return
    const tick = setInterval(() => {
      const t = Date.now()
      if (t - armedAt >= CONFIRM_WINDOW_MS) setArmedAt(null)
      setNow(t)
    }, 200)
    return () => clearInterval(tick)
  }, [armedAt])

  function handleConfirm() {
    const t = Date.now()
    if (armedAt !== null && t - armedAt < CONFIRM_WINDOW_MS) {
      setArmedAt(null)
      onConfirm()
      return
    }
    setArmedAt(t)
    setNow(t)
  }

  const secondsLeft = armedAt === null ? 0 : Math.max(0, Math.ceil((CONFIRM_WINDOW_MS - (now - armedAt)) / 1000))

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sql-confirm-title"
        aria-describedby="sql-confirm-body"
        data-testid="sql-confirm-modal"
        className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-lg"
        onClick={e => e.stopPropagation()}>
        <div className="h-px bg-[var(--accent)]" />
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={18} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
            <h2 id="sql-confirm-title" className="text-lg leading-tight">
              <span className="betel-title-bold">INTEROGARE</span>{' '}
              <span className="betel-title-condensed text-[var(--accent)]">DIRECTĂ</span>
            </h2>
          </div>

          <div id="sql-confirm-body" className="font-content text-sm text-[var(--muted)] space-y-3 mb-5">
            <p>
              Interogarea rulează direct pe baza de date de producție și ocolește regulile aplicației
              (arhivare, jurnalul de modificări, traduceri). O comandă greșită poate modifica sau
              pierde date în mod ireversibil.
            </p>
            <p>
              Mod:{' '}
              <span data-testid="sql-confirm-mode" className={readOnly ? 'text-[var(--text)]' : 'text-[var(--accent)]'}>
                {readOnly ? 'doar citire' : 'cu modificări de date'}
              </span>
              . Fiecare rulare este înregistrată în jurnal.
            </p>
          </div>

          <pre className="font-mono text-xs bg-[var(--surface)] border border-[var(--border)] p-3 max-h-40 overflow-auto whitespace-pre-wrap break-all mb-6">
            {query}
          </pre>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
            <button
              ref={cancelRef}
              data-testid="sql-confirm-cancel"
              onClick={onCancel}
              className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Anulează
            </button>
            <button
              data-testid="sql-confirm-run"
              data-armed={armedAt !== null}
              onClick={handleConfirm}
              className={`px-5 py-2 rounded-full border text-xs tracking-widest uppercase font-content transition-colors
                ${armedAt !== null
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'}`}>
              {armedAt !== null ? `Apasă din nou · ${secondsLeft}s` : 'Confirmă rularea'}
            </button>
          </div>
          <p className="font-content text-[11px] text-[var(--muted)] mt-3 sm:text-right" aria-live="polite">
            {armedAt !== null
              ? 'Apasă încă o dată pentru a rula interogarea.'
              : 'Butonul trebuie apăsat de două ori în 5 secunde.'}
          </p>
        </div>
      </div>
    </div>
  )
}
