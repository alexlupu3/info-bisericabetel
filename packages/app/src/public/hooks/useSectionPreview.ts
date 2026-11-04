import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'

// Section preview ("hand of cards") on phones — spec 08, FR-096 – FR-102, ADR-026.
//
// The hand itself is CSS (index.css, `[data-preview="hand"]`), so this hook only keeps the
// per-group state, hides the back tiles from keyboard and screen readers while collapsed,
// moves focus, announces the change and runs the FLIP animation (transform / opacity only).

export type PreviewState = 'hand' | 'open'

const PHONE_QUERY = '(max-width: 639px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const DURATION_MS = 560
const EASING = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const EXPAND_STAGGER_MS = 30
const COLLAPSE_STAGGER_MS = 20
/** Marks a tabindex this hook added, so it only removes its own. */
const TABINDEX_MARK = 'data-hand-tabindex'
const FOCUSABLE = 'a[href], button, iframe, input, select, textarea, [tabindex]'

/**
 * Hand slot geometry, mirroring index.css: translate (fractions of the tile width, px),
 * rotation, around a transform origin at 50 % / 140 % of the tile.
 */
const SLOT_GEOMETRY = [
  { tx: 0, ty: 20, rotate: -5 },
  { tx: 0.5, ty: 10, rotate: 0 },
  { tx: 1, ty: 20, rotate: 5 },
] as const

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setValue(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return value
}

interface Box { x: number; y: number; w: number; h: number }

/** Layout box relative to the list (offset* ignore transforms, so the hand rotation does not skew it). */
function layoutBox(el: HTMLElement): Box {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
}

/**
 * The transform (with `transform-origin: 0 0`) that draws an element laid out at `at` the
 * way hand slot `slot` draws a tile laid out at `tile`.
 */
function handTransform(slot: number, tile: Box, at: Box): string {
  const g = SLOT_GEOMETRY[Math.min(slot, SLOT_GEOMETRY.length - 1)]
  const ox = tile.w * 0.5
  const oy = tile.h * 1.4
  const scale = at.w > 0 ? tile.w / at.w : 1
  return `translate(${tile.x - at.x}px, ${tile.y - at.y}px) `
    + `translate(${ox}px, ${oy}px) translate(${g.tx * tile.w}px, ${g.ty}px) rotate(${g.rotate}deg) translate(${-ox}px, ${-oy}px) `
    + `scale(${scale})`
}

interface Options {
  /** False for groups of 3 or fewer: no state, no buttons. */
  collapsible: boolean
  /** Hand slot (0 = front) per item index, from previewSlots(). */
  slotOf: (index: number) => number | undefined
  /** Called with the live-region text after a change. */
  onAnnounce?: (text: string) => void
  expandedText: string
  collapsedText: string
}

export function useSectionPreview({ collapsible, slotOf, onAnnounce, expandedText, collapsedText }: Options) {
  const [state, setState] = useState<PreviewState>('hand')
  const isPhone = useMediaQuery(PHONE_QUERY)
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const showAllRef = useRef<HTMLButtonElement>(null)
  const busy = useRef(false)

  /** The hand is on screen: collapsible, collapsed and below 640 px. */
  const handVisible = collapsible && state === 'hand' && isPhone

  // Back tiles (slots 1 and 2) stay tappable (no `inert`) but get no tab stop (FR-102).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    Array.from(list.children).forEach((li, index) => {
      const back = handVisible && (slotOf(index) ?? 0) > 0
      li.querySelectorAll<HTMLElement>(FOCUSABLE).forEach(el => {
        if (el.hasAttribute('data-hand-expand')) return
        if (back && !el.hasAttribute('tabindex')) {
          el.setAttribute('tabindex', '-1')
          el.setAttribute(TABINDEX_MARK, '')
        } else if (!back && el.hasAttribute(TABINDEX_MARK)) {
          el.removeAttribute('tabindex')
          el.removeAttribute(TABINDEX_MARK)
        }
      })
    })
  })

  const animate = useCallback(async (to: PreviewState) => {
    const list = listRef.current
    if (!list) {
      flushSync(() => setState(to))
      return
    }
    const items = Array.from(list.children) as HTMLElement[]
    const before = items.map(layoutBox)
    // Hand shadows (and the stack under the back tile) fade instead of vanishing in one frame.
    const shadowsBefore = items.map(el => getComputedStyle(el).boxShadow)

    flushSync(() => setState(to))

    const after = items.map(layoutBox)
    // The tile every hand slot is laid out in (all slots share grid cell 1/1).
    const tileFor = (boxes: Box[]) => {
      const index = items.findIndex((_, i) => slotOf(i) === 0)
      return boxes[index >= 0 ? index : 0]
    }

    type Final = { transform: string; opacity: string; boxShadow: string }
    const animated: Array<{ el: HTMLElement; delay: number; final: Final }> = []
    // Expand order: the hand tiles leave together, front first, wherever they sit in the list
    // (a pinned item can be the last one); the items dealt from behind the hand follow in
    // list order. A list-index stagger would hold a pinned last item in the hand for ~200 ms.
    let dealt = 0
    items.forEach((el, index) => {
      const slot = slotOf(index)
      // Keep the hand's stacking for the whole flight: the front tile on top, then the
      // other slots, and the items dealt from behind the hand under all of them. Without
      // it the tiles stack in DOM order the moment the state flips (a visible flicker).
      const zIndex = String(slot === undefined ? 1 : 10 - slot)
      if (to === 'open') {
        // From the hand (or, for hidden items, from behind the last tile) to the list.
        const tile = tileFor(before)
        const from = handTransform(slot ?? SLOT_GEOMETRY.length - 1, tile, after[index])
        el.style.transition = 'none'
        el.style.transformOrigin = '0 0'
        el.style.transform = from
        el.style.zIndex = zIndex
        if (slot === undefined) el.style.opacity = '0'
        el.style.boxShadow = shadowsBefore[index]
        const order = slot ?? SLOT_GEOMETRY.length + dealt++
        animated.push({ el, delay: order * EXPAND_STAGGER_MS, final: { transform: 'none', opacity: '1', boxShadow: 'none' } })
      } else if (slot !== undefined) {
        // From the list back to the hand; hidden items are already display: none.
        const tile = after[index]
        const at = after[index]
        const from = before[index]
        const scale = at.w > 0 ? from.w / at.w : 1
        el.style.transition = 'none'
        el.style.transformOrigin = '0 0'
        const handShadow = getComputedStyle(el).boxShadow
        el.style.transform = `translate(${from.x - at.x}px, ${from.y - at.y}px) scale(${scale})`
        el.style.zIndex = zIndex
        el.style.boxShadow = 'none'
        animated.push({ el, delay: (SLOT_GEOMETRY.length - 1 - slot) * COLLAPSE_STAGGER_MS, final: { transform: handTransform(slot, tile, at), opacity: '1', boxShadow: handShadow } })
      }
    })

    // Commit the inverted positions (forced layout), then let them play. No
    // requestAnimationFrame: background / throttled pages would never start it.
    void list.offsetHeight
    for (const { el, delay, final } of animated) {
      el.style.transition = ['transform', 'opacity', 'box-shadow'].map(p => `${p} ${DURATION_MS}ms ${EASING} ${delay}ms`).join(', ')
      el.style.transform = final.transform
      el.style.opacity = final.opacity
      el.style.boxShadow = final.boxShadow
    }
    const longest = animated.reduce((max, a) => Math.max(max, a.delay), 0) + DURATION_MS
    await new Promise(resolve => setTimeout(resolve, longest + 20))
    for (const { el } of animated) {
      el.style.transition = ''
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.opacity = ''
      el.style.boxShadow = ''
      el.style.zIndex = ''
    }
  }, [slotOf])

  const focusItem = useCallback((index: number) => {
    const li = listRef.current?.children[index] as HTMLElement | undefined
    if (!li) return
    const target = li.querySelector<HTMLElement>('a[href], button, iframe')
    if (target) {
      target.focus({ preventScroll: true })
    } else {
      li.setAttribute('tabindex', '-1')
      li.focus({ preventScroll: true })
      li.addEventListener('blur', () => li.removeAttribute('tabindex'), { once: true })
    }
  }, [])

  /**
   * Scrolls the open list so item `index` is centred (or its top in view when taller than the
   * screen). Uses layout offsets, which ignore the FLIP transforms still playing.
   */
  const scrollToItem = useCallback((index: number) => {
    const list = listRef.current
    const li = list?.children[index] as HTMLElement | undefined
    if (!list || !li) return
    const top = list.getBoundingClientRect().top + window.scrollY + li.offsetTop
    const y = Math.max(0, top - Math.max(16, (window.innerHeight - li.offsetHeight) / 2))
    window.scrollTo({ top: y, behavior: matches(REDUCED_MOTION_QUERY) ? 'auto' : 'smooth' })
  }, [])

  /** `index`: the tapped back tile's item, scrolled to and focused; otherwise the first item. */
  const expand = useCallback(async (index?: number) => {
    if (!collapsible || busy.current || state === 'open') return
    busy.current = true
    try {
      // animate() switches the state synchronously, so focus moves without waiting for the motion.
      const animation = !isPhone || matches(REDUCED_MOTION_QUERY)
        ? (flushSync(() => setState('open')), Promise.resolve())
        : animate('open')
      focusItem(index ?? 0)
      if (index !== undefined) scrollToItem(index)
      onAnnounce?.(expandedText)
      await animation
    } finally {
      busy.current = false
    }
  }, [collapsible, state, isPhone, animate, focusItem, scrollToItem, onAnnounce, expandedText])

  const collapse = useCallback(async () => {
    if (!collapsible || busy.current || state === 'hand') return
    busy.current = true
    try {
      const reduced = matches(REDUCED_MOTION_QUERY)
      const animation = !isPhone || reduced ? (flushSync(() => setState('hand')), Promise.resolve()) : animate('hand')
      // Bring the heading back only if it scrolled off the top (FR-100).
      const heading = headingRef.current
      const scrolled = !!heading && heading.getBoundingClientRect().top < 0
      if (scrolled) heading.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
      showAllRef.current?.focus({ preventScroll: scrolled })
      onAnnounce?.(collapsedText)
      await animation
    } finally {
      busy.current = false
    }
  }, [collapsible, state, isPhone, animate, onAnnounce, collapsedText])

  /**
   * Click on a back tile's `[data-hand-expand]` overlay: expand instead of following its link,
   * then bring that tile's item into view.
   */
  const onExpandTarget = useCallback((event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const li = (event.currentTarget as HTMLElement).closest('li')
    const index = li?.parentElement ? Array.prototype.indexOf.call(li.parentElement.children, li) : -1
    void expand(index >= 0 ? index : undefined)
  }, [expand])

  return { state, isPhone, handVisible, expand, collapse, onExpandTarget, listRef, headingRef, showAllRef }
}
