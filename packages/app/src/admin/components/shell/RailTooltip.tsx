import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Label shown beside a rail link on hover or keyboard focus (FR-107). Purely visual
 * (`aria-hidden`): the link keeps its own visually hidden label as accessible name.
 * Rendered in `<body>` with fixed coordinates because the sidebar scrolls (and clips).
 */
export default function RailTooltip({ anchor, label }: { anchor: RefObject<HTMLElement | null>; label: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8 })
  }, [anchor])

  if (!pos) return null
  return createPortal(
    <span
      aria-hidden="true"
      data-testid="rail-tooltip"
      style={{ top: pos.top, left: pos.left }}
      className="fixed -translate-y-1/2 z-[calc(var(--z-sidebar)+1)] pointer-events-none whitespace-nowrap
                 px-2.5 py-1.5 text-[11px] tracking-widest uppercase font-content
                 bg-[var(--text)] text-[var(--bg)] shadow-lg animate-fade-in"
    >
      {label}
    </span>,
    document.body,
  )
}
