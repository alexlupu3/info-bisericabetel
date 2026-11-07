import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTopDialogElement } from '../components/ui/DialogStackContext'

type ToastType = 'success' | 'error'
interface Toast { id: number; message: string; type: ToastType }

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  // While a dialog is open the top layer covers everything else: render the toasts inside
  // the top-most dialog so they stay visible (FR-109, ADR-027).
  const topDialog = useTopDialogElement()

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId.current
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  // Phones: above the FAB, full width minus 1 rem gutters, right-aligned (FR-109).
  const stack = (
    <div
      data-testid="toast-container"
      aria-live="polite"
      className="fixed z-[var(--z-toast)] flex flex-col items-end gap-2 pointer-events-none
                 left-4 right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))]
                 md:left-auto md:right-5 md:bottom-5"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          data-testid="toast"
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto max-w-full px-4 py-3 text-xs font-content tracking-wide theme-overlay animate-fade-in
            ${t.type === 'error'
              ? 'text-[var(--danger)]'
              : 'text-[var(--text)]'
            }`}>
          {t.message}
        </div>
      ))}
    </div>
  )

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {createPortal(stack, topDialog ?? document.body)}
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
