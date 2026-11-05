import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'

// Section preview (swipeable pair of tiles) on phones — spec 08, FR-096 – FR-102, ADR-026.
//
// The deck itself is CSS (index.css, `[data-preview="hand"]`): two small preview tiles, the top
// one in front, the next one fanned out behind it. This hook keeps the per-group state
// (collapsed / open and how far the deck has been swiped), hides the back tile from keyboard
// and screen readers, handles the swipe and the taps that open the group, moves focus,
// announces the change and runs the FLIP animations (transform / opacity only), cross-fading
// each tile into its full card on expand.

export type PreviewState = 'hand' | 'open'

const PHONE_QUERY = '(max-width: 639px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const DURATION_MS = 520
const EASING = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const EXPAND_STAGGER_MS = 30
const COLLAPSE_STAGGER_MS = 20
/** Swipe: movement before a gesture counts as horizontal, commit distance and speed. */
const SWIPE_SLOP_PX = 8
const SWIPE_COMMIT_SHARE = 0.28
const SWIPE_COMMIT_SPEED = 0.45 // px / ms
const SWIPE_OUT_MS = 280
const SWIPE_SETTLE_MS = 240
/**
 * Slot geometry, mirroring index.css (`li[data-slot="0|1"]`, transform origin 50 % 140 %):
 * translate x in % of the tile width, y in px, rotation in degrees. The back tile moves to
 * the top tile's place while the top tile is dragged away.
 */
const SLOTS = [
  { tx: 0, ty: 16, rotate: -4 },
  { tx: 68, ty: 10, rotate: 4 },
] as const
const slotTransform = (tx: number, ty: number, rotate: number) => `translate(${tx}%, ${ty}px) rotate(${rotate}deg)`
/** Share of the expand flight over which a tile cross-fades into its open card. */
const CROSSFADE_SHARE = 0.35
/** Marks a tabindex this hook added, so it only removes its own. */
const TABINDEX_MARK = 'data-hand-tabindex'
const FOCUSABLE = 'a[href], button, iframe, input, select, textarea, [tabindex]'
/** On the top card these keep their own click; a tap anywhere else opens the group. */
const INTERACTIVE = 'a[href], button, iframe, input, select, textarea, summary, label'

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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface Box { x: number; y: number; w: number; h: number }

/** Layout box relative to the list (offset* ignore transforms, so a tilt does not skew it). */
function layoutBox(el: HTMLElement): Box {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
}

/** An element's CSS transform and its origin, read from the computed style. */
interface Pose { matrix: string; ox: number; oy: number }

function poseOf(el: HTMLElement): Pose {
  const cs = getComputedStyle(el)
  const [ox, oy] = cs.transformOrigin.split(' ').map(v => parseFloat(v) || 0)
  return { matrix: cs.transform && cs.transform !== 'none' ? cs.transform : 'matrix(1, 0, 0, 1, 0, 0)', ox, oy }
}

/**
 * The transform (with `transform-origin: 0 0`) that draws an element laid out at `at` the way
 * it was drawn laid out at `was` with pose `pose`, scaled to the old width. Always the same
 * function list, so it interpolates with IDENTITY function by function.
 */
function fromPose(was: Box, pose: Pose, at: Box): string {
  const scale = at.w > 0 ? was.w / at.w : 1
  return `translate(${was.x - at.x}px, ${was.y - at.y}px) translate(${pose.ox}px, ${pose.oy}px) ${pose.matrix} `
    + `translate(${-pose.ox}px, ${-pose.oy}px) scale(${scale})`
}

const IDENTITY = 'translate(0px, 0px) translate(0px, 0px) matrix(1, 0, 0, 1, 0, 0) translate(0px, 0px) scale(1)'

/**
 * Copies of the deck tiles (cross-fade on expand). The copies sit in a detached deck —
 * `div[data-preview="hand"] > ul[data-preview-list]` laid exactly over the list, in document
 * coordinates — so the deck CSS draws them exactly like the tiles (every item is copied, so
 * the shared cell keeps its height; only the two deck tiles show). They carry no ids, test
 * ids or expand overlays, and are inert and hidden from assistive tech.
 */
function buildDeckGhost(list: HTMLElement, items: HTMLElement[]) {
  const rect = list.getBoundingClientRect()
  const wrap = document.createElement('div')
  wrap.setAttribute('data-preview', 'hand')
  wrap.setAttribute('data-hand-ghost', '')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.inert = true
  Object.assign(wrap.style, {
    position: 'absolute',
    left: `${rect.left + window.scrollX}px`,
    top: `${rect.top + window.scrollY}px`,
    width: `${rect.width}px`,
    margin: '0',
    zIndex: '20',
    pointerEvents: 'none',
  })
  const ul = document.createElement('ul')
  ul.className = list.className
  ul.setAttribute('data-preview-list', '')
  ul.style.margin = '0'
  const tiles = new Map<number, HTMLElement>()
  items.forEach((li, index) => {
    const copy = li.cloneNode(true) as HTMLElement
    copy.removeAttribute('aria-hidden')
    copy.removeAttribute('style')
    copy.querySelectorAll('[data-hand-expand]').forEach(el => el.remove())
    copy.querySelectorAll('[id], [data-item-id], [data-testid]').forEach(el => {
      el.removeAttribute('id')
      el.removeAttribute('data-item-id')
      el.removeAttribute('data-testid')
    })
    copy.querySelectorAll('img').forEach(img => { img.loading = 'eager' })
    ul.appendChild(copy)
    if (li.dataset.slot !== undefined) tiles.set(index, copy)
  })
  wrap.appendChild(ul)
  document.body.appendChild(wrap)
  return { wrap, tiles }
}

function clearInline(el: HTMLElement) {
  el.style.transition = ''
  el.style.transform = ''
  el.style.transformOrigin = ''
  el.style.opacity = ''
  el.style.boxShadow = ''
  el.style.zIndex = ''
}

interface Options {
  /** False for groups of 3 or fewer and for groups that opted out: no state, no buttons. */
  collapsible: boolean
  /** Visible items in the group (the deck wraps around after the last one). */
  count: number
  /** Called with the live-region text after a change. */
  onAnnounce?: (text: string) => void
  expandedText: string
  collapsedText: string
}

export function useSectionPreview({ collapsible, count, onAnnounce, expandedText, collapsedText }: Options) {
  const [state, setState] = useState<PreviewState>('hand')
  /** Swipes so far; the deck shows previewSlots(items, swiped). */
  const [swiped, setSwiped] = useState(0)
  const isPhone = useMediaQuery(PHONE_QUERY)
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const showAllRef = useRef<HTMLButtonElement>(null)
  const busy = useRef(false)
  /** Set by a drag; swallows the click the browser fires after it. */
  const suppressClick = useRef(false)

  /** The deck is on screen: collapsible, collapsed and below 640 px. */
  const handVisible = collapsible && state === 'hand' && isPhone

  const slotEl = (slot: number) =>
    listRef.current?.querySelector<HTMLElement>(`:scope > li[data-slot="${slot}"]`) ?? null

  // The back card stays tappable (no `inert`) but gets no tab stop (FR-102).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    Array.from(list.children).forEach(li => {
      const back = handVisible && Number((li as HTMLElement).dataset.slot ?? 0) > 0
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

  // ── Swipe ────────────────────────────────────────────────────────────
  // Either direction sends the top card off that side; the back card rises to the top and the
  // next card of the deck order slides in behind it. Vertical drags stay native page scrolls
  // (`touch-action: pan-y` on the deck).

  /** Draws the drag: the top tile follows the finger, the back tile moves up in proportion. */
  const paintDrag = (top: HTMLElement, back: HTMLElement | null, dx: number) => {
    const w = top.offsetWidth || 1
    const [front, rear] = SLOTS
    top.style.transform = `translate(${dx}px, ${Math.abs(dx) * 0.04}px) `
      + slotTransform(front.tx, front.ty, front.rotate + (dx / w) * 10)
    if (back) {
      const p = Math.min(1, Math.abs(dx) / w)
      const mix = (a: number, b: number) => a + (b - a) * p
      back.style.transform = slotTransform(mix(rear.tx, front.tx), mix(rear.ty, front.ty), mix(rear.rotate, front.rotate))
    }
  }

  /** Snaps a cancelled drag back to the resting deck. */
  const settle = useCallback(async (top: HTMLElement, back: HTMLElement | null) => {
    for (const el of [top, back]) {
      if (!el) continue
      el.style.transition = `transform ${SWIPE_SETTLE_MS}ms ${EASING}`
      el.style.transform = ''
    }
    await wait(SWIPE_SETTLE_MS + 20)
    for (const el of [top, back]) if (el) el.style.transition = ''
  }, [])

  /** Sends the top card off to side `dir` (-1 left, 1 right) and deals the next card. */
  const advance = useCallback(async (top: HTMLElement, back: HTMLElement | null, dir: number) => {
    const list = listRef.current
    if (!list) return
    busy.current = true
    try {
      if (matches(REDUCED_MOTION_QUERY)) {
        flushSync(() => setSwiped(s => s + 1))
        clearInline(top)
        if (back) clearInline(back)
        return
      }
      const w = top.offsetWidth
      top.style.transition = `transform ${SWIPE_OUT_MS}ms ease-in, opacity ${SWIPE_OUT_MS}ms ease-in`
      top.style.transform = `translate(${dir * w * 1.6}px, ${w * 0.06}px) `
        + slotTransform(SLOTS[0].tx, SLOTS[0].ty, SLOTS[0].rotate + dir * 16)
      top.style.opacity = '0'
      if (back) {
        back.style.transition = `transform ${SWIPE_OUT_MS}ms ${EASING}`
        back.style.transform = slotTransform(SLOTS[0].tx, SLOTS[0].ty, SLOTS[0].rotate)
      }
      await wait(SWIPE_OUT_MS + 10)

      flushSync(() => setSwiped(s => s + 1))
      // The old top tile is now hidden and the old back tile is the top tile, already drawn at
      // the top slot, so dropping the inline styles moves nothing. The new back tile fades in.
      clearInline(top)
      if (back) clearInline(back)
      const next = slotEl(1)
      if (next) {
        next.style.transition = 'none'
        next.style.opacity = '0'
        next.style.transform = `${slotTransform(SLOTS[1].tx, SLOTS[1].ty, SLOTS[1].rotate)} scale(0.96)`
      }
      void list.offsetHeight
      if (next) {
        next.style.transition = `transform ${SWIPE_SETTLE_MS}ms ${EASING}, opacity ${SWIPE_SETTLE_MS}ms ease-out`
        next.style.opacity = ''
        next.style.transform = ''
      }
      await wait(SWIPE_SETTLE_MS + 20)
      if (next) next.style.transition = ''
    } finally {
      busy.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list || !handVisible || count < 2) return
    let drag: { id: number; x0: number; y0: number; t0: number; dx: number; active: boolean; top: HTMLElement; back: HTMLElement | null } | null = null

    const onDown = (e: PointerEvent) => {
      suppressClick.current = false
      if (busy.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      const top = slotEl(0)
      if (!top) return
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, active: false, top, back: slotEl(1) }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x0
      const dy = e.clientY - drag.y0
      if (!drag.active) {
        if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return
        if (Math.abs(dy) >= Math.abs(dx)) { drag = null; return } // a page scroll
        drag.active = true
        try { list.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        drag.top.style.transition = 'none'
        if (drag.back) drag.back.style.transition = 'none'
      }
      e.preventDefault()
      drag.dx = dx
      paintDrag(drag.top, drag.back, dx)
    }
    const onEnd = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (!d.active) return
      suppressClick.current = true
      // Touch drags fire no click afterwards: do not swallow a later, unrelated one.
      setTimeout(() => { suppressClick.current = false }, 400)
      const speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t0)
      const commit = e.type === 'pointerup'
        && (Math.abs(d.dx) > d.top.offsetWidth * SWIPE_COMMIT_SHARE || (speed > SWIPE_COMMIT_SPEED && Math.abs(d.dx) > 30))
      void (commit ? advance(d.top, d.back, Math.sign(d.dx) || -1) : settle(d.top, d.back))
    }
    // A native drag of a link or image would swallow the pointer stream.
    const onDragStart = (e: DragEvent) => e.preventDefault()

    list.addEventListener('pointerdown', onDown)
    list.addEventListener('pointermove', onMove)
    list.addEventListener('pointerup', onEnd)
    list.addEventListener('pointercancel', onEnd)
    list.addEventListener('dragstart', onDragStart)
    return () => {
      list.removeEventListener('pointerdown', onDown)
      list.removeEventListener('pointermove', onMove)
      list.removeEventListener('pointerup', onEnd)
      list.removeEventListener('pointercancel', onEnd)
      list.removeEventListener('dragstart', onDragStart)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handVisible, count, advance, settle])

  // ── Expand / collapse ────────────────────────────────────────────────

  const animate = useCallback(async (to: PreviewState) => {
    const list = listRef.current
    if (!list) {
      flushSync(() => setState(to))
      return
    }
    const items = Array.from(list.children) as HTMLElement[]
    const slotOfEl = (el: HTMLElement) => (el.dataset.slot === undefined ? undefined : Number(el.dataset.slot))
    const before = items.map(layoutBox)
    const posesBefore = items.map(poseOf)
    // Deck shadows (and the stack under the back card) fade instead of vanishing in one frame.
    const shadowsBefore = items.map(el => getComputedStyle(el).boxShadow)
    // Expand: copies of the deck tiles, made while they still look like tiles.
    const ghost = to === 'open' ? buildDeckGhost(list, items) : null

    flushSync(() => setState(to))

    const after = items.map(layoutBox)
    type Final = { transform: string; opacity: string; boxShadow: string }
    const animated: Array<{ el: HTMLElement; delay: number; final: Final; fadeMs?: number }> = []

    if (to === 'open') {
      // Items not in the deck are dealt from behind the back tile (or the top tile).
      const backIndex = items.findIndex(el => slotOfEl(el) === 1)
      const anchor = backIndex >= 0 ? backIndex : items.findIndex(el => slotOfEl(el) === 0)
      let dealt = 0
      items.forEach((el, index) => {
        const slot = slotOfEl(el)
        const src = slot === undefined ? anchor : index
        if (src < 0) return
        const from = fromPose(before[src], posesBefore[src], after[index])
        el.style.transition = 'none'
        el.style.transformOrigin = '0 0'
        el.style.transform = from
        // The deck's stacking holds for the whole flight: top tile, back tile, then the rest.
        el.style.zIndex = String(slot === undefined ? 1 : 10 - slot)
        el.style.boxShadow = shadowsBefore[src]
        if (slot === undefined) el.style.opacity = '0'
        const order = slot ?? 2 + dealt++
        const delay = order * EXPAND_STAGGER_MS
        const copy = ghost?.tiles.get(index)
        if (copy) {
          // Cross-fade: the copy keeps the tile's look and follows the card's exact path — the
          // card's transform wrapped so the copy's box maps onto the card's box — while it fades
          // out and the card (already in its open layout) fades in.
          const b = layoutBox(copy)
          const at = after[index]
          const wrapIn = (inner: string) => `translate(${at.x - b.x}px, ${at.y - b.y}px) ${inner} scale(${b.w > 0 ? at.w / b.w : 1})`
          copy.style.transition = 'none'
          copy.style.transformOrigin = '0 0'
          copy.style.transform = wrapIn(from)
          el.style.opacity = '0'
          const fadeMs = Math.round(DURATION_MS * CROSSFADE_SHARE)
          animated.push({ el: copy, delay, fadeMs, final: { transform: wrapIn(IDENTITY), opacity: '0', boxShadow: '' } })
          animated.push({ el, delay, fadeMs, final: { transform: IDENTITY, opacity: '1', boxShadow: 'none' } })
        } else {
          animated.push({ el, delay, final: { transform: IDENTITY, opacity: '1', boxShadow: 'none' } })
        }
      })
    } else {
      // From the list back to the deck; the other items are already display: none.
      items.forEach((el, index) => {
        const slot = slotOfEl(el)
        if (slot === undefined) return
        const pose = poseOf(el)
        const handShadow = getComputedStyle(el).boxShadow
        const at = after[index]
        const from = before[index]
        el.style.transition = 'none'
        el.style.transformOrigin = '0 0'
        el.style.transform = `translate(${from.x - at.x}px, ${from.y - at.y}px) translate(0px, 0px) matrix(1, 0, 0, 1, 0, 0) translate(0px, 0px) scale(${at.w > 0 ? from.w / at.w : 1})`
        el.style.zIndex = String(10 - slot)
        el.style.boxShadow = 'none'
        animated.push({ el, delay: slot * COLLAPSE_STAGGER_MS, final: { transform: fromPose(at, pose, at), opacity: '1', boxShadow: handShadow } })
      })
    }

    // Commit the inverted positions (forced layout), then let them play. No
    // requestAnimationFrame: background / throttled pages would never start it.
    void list.offsetHeight
    for (const { el, delay, final, fadeMs } of animated) {
      el.style.transition = [
        `transform ${DURATION_MS}ms ${EASING} ${delay}ms`,
        `box-shadow ${DURATION_MS}ms ${EASING} ${delay}ms`,
        `opacity ${fadeMs ?? Math.round(DURATION_MS * 0.6)}ms ease-out ${delay}ms`,
      ].join(', ')
      el.style.transform = final.transform
      el.style.opacity = final.opacity
      el.style.boxShadow = final.boxShadow
    }
    const longest = animated.reduce((max, a) => Math.max(max, a.delay), 0) + DURATION_MS
    await wait(longest + 20)
    ghost?.wrap.remove()
    for (const { el } of animated) clearInline(el)
  }, [])

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

  /** `index`: the tapped card's item, scrolled to and focused; otherwise the first item. */
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
   * Clicks inside the deck (capture phase): the click after a swipe is swallowed; a tap on the
   * back card, or on the top card outside its own link / button / player, opens the group and
   * brings that card's item into view. A top card's link keeps working as usual.
   */
  const onListClickCapture = useCallback((event: MouseEvent) => {
    if (!handVisible) return
    if (suppressClick.current) {
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const target = event.target as HTMLElement
    const li = target.closest<HTMLElement>('[data-preview-list] > li')
    if (!li || li.dataset.slot === undefined) return
    const top = li.dataset.slot === '0'
    if (top && target.closest(INTERACTIVE)) return
    event.preventDefault()
    event.stopPropagation()
    const index = Array.prototype.indexOf.call(li.parentElement!.children, li)
    void expand(index >= 0 ? index : undefined)
  }, [handVisible, expand])

  return { state, swiped, isPhone, handVisible, expand, collapse, onListClickCapture, listRef, headingRef, showAllRef }
}
