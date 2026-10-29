// Glyphs and layout of a card's metadata rows (date/time, location). Hairline outlines
// (lucide geometry, ISC) in currentColor, sized to the text and centred on it with a
// 4 px gap. Mirrored by packages/api/src/services/seo/render-snapshot.ts.

/** Classes shared by the metadata rows (`items-center`, `gap-1` = 4 px). */
export const META_ROW_CLASS = 'flex items-center gap-1 text-[10px] tracking-widest uppercase font-content text-[var(--muted)]'

const ICON_CLASS = 'h-[1.2em] w-[1.2em] shrink-0'

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={ICON_CLASS} aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  )
}

export function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={ICON_CLASS} aria-hidden="true" focusable="false">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  )
}
