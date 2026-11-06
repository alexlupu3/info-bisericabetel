import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'

// Section preview (swipeable pair of tiles) on phones — spec 08, FR-096 – FR-102, ADR-026.
//
// The deck itself is CSS (index.css, `[data-preview="hand"]`): two small preview tiles, the top
// one in front on the left, the next one fanned out behind it on the right, each lying on a
// pile (data-under: the previous tile under the top one, the next-but-one under the back one). This hook keeps the per-group state
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
const SWIPE_LAND_MS = 300
const SWIPE_SETTLE_MS = 240
/** How far past the other pile a dragged tile may go (share of the gap), and its arc height. */
const SWIPE_OVERSHOOT = 1.12
const SWIPE_LIFT_PX = 10
/**
 * Slot geometry, mirroring index.css (`li[data-slot="0|1"]`, transform origin 50 % 140 %):
 * translate x in % of the tile width, y in px, rotation in degrees. The back tile moves to
 * the other pile's place while it is dragged.
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
  /** Net swipes to the left (never below 0); the deck shows previewSlots / deckUnder(items, swiped). */
  const [swiped, setSwiped] = useState(0)
  const swipedRef = useRef(0)
  swipedRef.current = swiped
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

  // The back card stays tappable (no `inert`) but gets no tab stop (FR-102); nor do the tiles
  // lying under the two piles.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    Array.from(list.children).forEach(li => {
      const el = li as HTMLElement
      const back = handVisible && (Number(el.dataset.slot ?? 0) > 0 || el.dataset.under !== undefined)
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
  // The deck is two piles: the top tile on the left (with the tiles already swiped through
  // under it) and the back tile on the right (with the next one already under it). A swipe to
  // the left lays the back tile onto the left pile, revealing the next tile in its place; a
  // swipe to the right takes the top tile back onto the right pile. Only the moving tile
  // animates: the tiles underneath are already in place. Vertical drags stay native page
  // scrolls (`touch-action: pan-y` on the deck).

  /** Draws the drag: the moving tile follows the finger from its pile towards the other one. */
  const paintDrag = (moving: HTMLElement, dir: number, dx: number) => {
    const w = moving.offsetWidth || 1
    const dist = ((SLOTS[1].tx - SLOTS[0].tx) / 100) * w
    const [from, to] = dir < 0 ? [SLOTS[1], SLOTS[0]] : [SLOTS[0], SLOTS[1]]
    const x = dir < 0 ? Math.max(dx, -dist * SWIPE_OVERSHOOT) : Math.min(dx, dist * SWIPE_OVERSHOOT)
    const p = Math.min(1, Math.abs(x) / dist)
    const mix = (a: number, b: number) => a + (b - a) * p
    // A small arc while the tile crosses over to the other pile.
    const lift = Math.sin(p * Math.PI) * SWIPE_LIFT_PX
    moving.style.transform = `translate(${x}px, ${-lift}px) ` + slotTransform(from.tx, mix(from.ty, to.ty), mix(from.rotate, to.rotate))
  }

  /** A drag right with nothing on the left pile: the top tile gives a little and springs back. */
  const paintResist = (top: HTMLElement, dx: number) => {
    const [f] = SLOTS
    top.style.transform = `translate(${Math.sign(dx) * Math.min(Math.abs(dx) * 0.25, 24)}px, 0px) ` + slotTransform(f.tx, f.ty, f.rotate)
  }

  /** Snaps a cancelled drag back to the resting deck. */
  const settle = useCallback(async (moving: HTMLElement) => {
    moving.style.transition = `transform ${SWIPE_SETTLE_MS}ms ${EASING}`
    moving.style.transform = ''
    await wait(SWIPE_SETTLE_MS + 20)
    clearInline(moving)
  }, [])

  /** Lands the moving tile on the other pile (-1: back tile onto the left, 1: top tile back right). */
  const advance = useCallback(async (moving: HTMLElement, dir: number) => {
    busy.current = true
    try {
      if (!matches(REDUCED_MOTION_QUERY)) {
        const to = dir < 0 ? SLOTS[0] : SLOTS[1]
        moving.style.transition = `transform ${SWIPE_LAND_MS}ms ${EASING}`
        moving.style.transform = slotTransform(to.tx, to.ty, to.rotate)
        await wait(SWIPE_LAND_MS + 10)
      }
      // The landed tile takes the slot it is drawn in; the tiles under both piles move up a
      // role in place, so dropping the inline styles moves nothing.
      flushSync(() => setSwiped(s => s - dir))
      clearInline(moving)
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list || !handVisible || count < 2) return
    let drag: {
      id: number; x0: number; y0: number; t0: number; dx: number
      dir: number; moving: HTMLElement | null; resist: boolean
    } | null = null

    const onDown = (e: PointerEvent) => {
      suppressClick.current = false
      if (busy.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      if (!slotEl(0)) return
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, dir: 0, moving: null, resist: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x0
      const dy = e.clientY - drag.y0
      if (!drag.dir) {
        if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return
        if (Math.abs(dy) >= Math.abs(dx)) { drag = null; return } // a page scroll
        drag.dir = Math.sign(dx)
        // Left: the back tile crosses over. Right: the top tile goes back, if anything is under it.
        drag.resist = drag.dir > 0 && swipedRef.current <= 0
        drag.moving = drag.dir < 0 ? slotEl(1) : slotEl(0)
        if (!drag.moving) { drag = null; return }
        try { list.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        drag.moving.style.transition = 'none'
        drag.moving.style.zIndex = '10'
      }
      e.preventDefault()
      drag.dx = dx
      if (drag.resist) paintResist(drag.moving!, dx)
      else paintDrag(drag.moving!, drag.dir, dx)
    }
    const onEnd = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (!d.dir || !d.moving) return
      suppressClick.current = true
      // Touch drags fire no click afterwards: do not swallow a later, unrelated one.
      setTimeout(() => { suppressClick.current = false }, 400)
      const along = d.dx * d.dir // distance travelled in the drag's own direction
      const speed = along / Math.max(1, e.timeStamp - d.t0)
      const commit = e.type === 'pointerup' && !d.resist
        && (along > d.moving.offsetWidth * SWIPE_COMMIT_SHARE || (speed > SWIPE_COMMIT_SPEED && along > 30))
      void (commit ? advance(d.moving, d.dir) : settle(d.moving))
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
