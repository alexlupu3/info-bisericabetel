import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom'

/**
 * Leave-page protection for admin form dialogs (BR-060, FR-113).
 *
 * While any registered form is dirty:
 *  1. a `beforeunload` listener makes the browser ask before a reload, tab close or
 *     leaving the site (registered only while dirty);
 *  2. in-app navigation (Back/Forward, links, programmatic `navigate`) does not take
 *     effect: the provider keeps rendering the location captured when the form became
 *     dirty (so the dialog and its state stay mounted), puts the URL back, and asks the
 *     form to show its discard confirmation. "Renunță" releases the form and completes
 *     the navigation the user asked for; "Continuă editarea" drops it;
 *  3. `guard(action)` lets links and "Ieșire" ask before they act.
 *
 * The app uses `<BrowserRouter>` (no data router, so no `useBlocker`); this provider is
 * the admin-level substitute. Mount it inside the router and render the admin `<Routes>`
 * with `location={useDisplayLocation()}`.
 */

interface Registration {
  id: number
  dirty: boolean
  released: boolean
  onBlocked: () => void
}

type Pending =
  | { kind: 'pop'; delta: number }
  | { kind: 'nav'; to: Location; replace: boolean }
  | { kind: 'action'; run: () => void }

interface UnsavedChangesApi {
  register: (onBlocked: () => void) => number
  unregister: (id: number) => void
  setDirty: (id: number, dirty: boolean) => void
  /** Stop guarding this form (after a save or a discard); runs a blocked navigation if any. */
  release: (id: number) => boolean
  /** "Continuă editarea": forget the blocked navigation. */
  keep: () => void
  /** Run `action` now, or after the editor confirms discarding unsaved input. */
  guard: (action: () => void) => void
  isGuarding: () => boolean
}

const ApiCtx = createContext<UnsavedChangesApi | null>(null)
const LocationCtx = createContext<Location | null>(null)

const urlOf = (l: Pick<Location, 'pathname' | 'search' | 'hash'>) => `${l.pathname}${l.search}${l.hash}`

function historyIdx(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : null
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const [, rerender] = useReducer((x: number) => x + 1, 0)

  const regs = useRef<Registration[]>([])
  const nextId = useRef(1)
  const captured = useRef<{ location: Location; idx: number | null } | null>(null)
  const pending = useRef<Pending | null>(null)
  const locationRef = useRef(location)
  locationRef.current = location
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const activeReg = () => regs.current.find(r => r.dirty && !r.released)

  const [api] = useState<UnsavedChangesApi>(() => {
    const sync = () => {
      if (!activeReg()) { captured.current = null; pending.current = null }
      rerender()
    }
    const run = (p: Pending) => {
      if (p.kind === 'pop') window.history.go(p.delta)
      else if (p.kind === 'nav') navigateRef.current(urlOf(p.to), { replace: p.replace, state: p.to.state })
      else p.run()
    }
    return {
      register(onBlocked) {
        const id = nextId.current++
        regs.current = [...regs.current, { id, dirty: false, released: false, onBlocked }]
        return id
      },
      unregister(id) {
        regs.current = regs.current.filter(r => r.id !== id)
        sync()
      },
      setDirty(id, dirty) {
        const reg = regs.current.find(r => r.id === id)
        if (!reg || reg.dirty === dirty) return
        reg.dirty = dirty
        if (dirty && !reg.released && !captured.current) {
          captured.current = { location: locationRef.current, idx: historyIdx() }
        }
        sync()
      },
      release(id) {
        const reg = regs.current.find(r => r.id === id)
        if (reg) reg.released = true
        const p = pending.current
        pending.current = null
        sync()
        if (p) { run(p); return true }
        return false
      },
      keep() {
        pending.current = null
      },
      guard(action) {
        const reg = activeReg()
        if (!reg) { action(); return }
        pending.current = { kind: 'action', run: action }
        reg.onBlocked()
      },
      isGuarding: () => !!activeReg(),
    }
  })

  const guarding = !!activeReg()
  const cap = captured.current
  const blocked = guarding && !!cap && urlOf(location) !== urlOf(cap.location)
  const displayLocation = blocked ? cap!.location : location

  // Put the URL back when a navigation left the dirty form's URL.
  useEffect(() => {
    const reg = activeReg()
    const c = captured.current
    if (!reg || !c || urlOf(location) === urlOf(c.location)) return
    const idx = historyIdx()
    const delta = c.idx !== null && idx !== null ? idx - c.idx : null
    if (navigationType === 'POP' && delta) {
      // Back/Forward: undo the traversal, replay it on "Renunță" (history keeps its shape).
      pending.current = { kind: 'pop', delta }
      window.history.go(-delta)
    } else if (navigationType === 'PUSH' && delta === 1) {
      pending.current = { kind: 'nav', to: location, replace: false }
      window.history.go(-1)
    } else {
      pending.current = { kind: 'nav', to: location, replace: navigationType !== 'PUSH' }
      navigate(urlOf(c.location), { replace: true, state: c.location.state })
    }
    reg.onBlocked()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location])

  // Reload / tab close: the browser's own leave-page dialog, only while dirty.
  useEffect(() => {
    if (!guarding) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [guarding])

  return (
    <ApiCtx.Provider value={api}>
      <LocationCtx.Provider value={displayLocation}>{children}</LocationCtx.Provider>
    </ApiCtx.Provider>
  )
}

/** The location the admin pages should render: frozen while a dirty form blocks a navigation. */
export function useDisplayLocation(): Location {
  const display = useContext(LocationCtx)
  const real = useLocation()
  return display ?? real
}

export function useUnsavedChangesGuard() {
  const api = useContext(ApiCtx)
  return {
    guard: (action: () => void) => (api ? api.guard(action) : action()),
    isGuarding: () => api?.isGuarding() ?? false,
  }
}

/**
 * Registers a form's dirty flag. `onBlocked` is called when the editor tries to leave the
 * dirty form through navigation; the form then shows `DiscardConfirm`, calling `release()`
 * on "Renunță" (it returns true when it completed a blocked navigation, false when the form
 * should close itself) and `keepEditing()` on "Continuă editarea". Call `release()` after
 * a successful save too, before closing.
 */
export function useUnsavedChanges(dirty: boolean, { onBlocked }: { onBlocked: () => void }) {
  const api = useContext(ApiCtx)
  const idRef = useRef<number | null>(null)
  const onBlockedRef = useRef(onBlocked)
  onBlockedRef.current = onBlocked

  useEffect(() => {
    if (!api) return
    const id = api.register(() => onBlockedRef.current())
    idRef.current = id
    return () => { api.unregister(id); idRef.current = null }
  }, [api])

  useEffect(() => {
    if (api && idRef.current !== null) api.setDirty(idRef.current, dirty)
  }, [api, dirty])

  return {
    release: () => (api && idRef.current !== null ? api.release(idRef.current) : false),
    keepEditing: () => api?.keep(),
  }
}
