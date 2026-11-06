import { useCallback, useSyncExternalStore } from 'react'

/** Live `matchMedia` result. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

/** ≥ 768 px: sidebar; below: phone header, FAB and drawer (FR-105, FR-108). */
export const DESKTOP_QUERY = '(min-width: 768px)'
