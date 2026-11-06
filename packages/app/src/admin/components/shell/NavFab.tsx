import { forwardRef, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { useHasModalDialog } from '../ui/DialogStackContext'

export const DRAWER_ID = 'admin-nav-drawer'

/** Round FAB geometry shared by the FAB and the drawer's × (drawn at the same spot). */
export const FAB_CLASS = `fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))]
  w-14 h-14 rounded-full items-center justify-center
  bg-[var(--text)] text-[var(--bg)] theme-shadow-3
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]`

export function FabFace({ open }: { open: boolean }): ReactNode {
  return open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />
}

/** Phone menu button, bottom-right (FR-108). Hidden while a form dialog is open. */
const NavFab = forwardRef<HTMLButtonElement, { open: boolean; onOpen: () => void }>(function NavFab({ open, onOpen }, ref) {
  const modal = useHasModalDialog()
  return (
    <button
      ref={ref}
      type="button"
      data-testid="nav-fab"
      hidden={modal}
      onClick={onOpen}
      aria-label={open ? 'Închide meniul' : 'Deschide meniul'}
      aria-expanded={open}
      aria-controls={DRAWER_ID}
      className={`${FAB_CLASS} ${modal ? 'hidden' : 'flex'} z-[var(--z-fab)]`}
    >
      <FabFace open={open} />
    </button>
  )
})

export default NavFab
