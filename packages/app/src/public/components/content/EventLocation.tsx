import { useLanguage } from '../../context/LanguageContext'
import { UI_KEYS, UI_DEFAULTS } from '../../i18n/keys'

function MapPinIcon() {
  // Map pin outline (lucide "map-pin" geometry, ISC); hairline stroke like ExternalLinkIcon.
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="h-[1.2em] w-[1.2em] shrink-0" aria-hidden="true" focusable="false">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  )
}

/** A card's event location (spec 07, BR-052): own metadata row under the date/time row, never a link. */
export default function EventLocation({ location, className = '' }: { location: string | null | undefined; className?: string }) {
  const { t } = useLanguage()
  if (!location) return null
  return (
    <p className={`flex items-start gap-1.5 text-[10px] tracking-widest uppercase font-content text-[var(--muted)] ${className}`}
       data-testid="event-location">
      <MapPinIcon />
      <span className="sr-only">{t(UI_KEYS.LOCATION_LABEL, UI_DEFAULTS['location.label'])}: </span>
      <span className="min-w-0 break-words">{location}</span>
    </p>
  )
}
