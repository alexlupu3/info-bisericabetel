import { useLanguage } from '../../context/LanguageContext'
import { UI_KEYS, UI_DEFAULTS } from '../../i18n/keys'
import { META_ROW_CLASS, MapPinIcon } from './meta-icons'

/** A card's event location (spec 07, BR-052): own metadata row under the date/time row, never a link. */
export default function EventLocation({ location, className = '' }: { location: string | null | undefined; className?: string }) {
  const { t } = useLanguage()
  if (!location) return null
  return (
    <p className={`${META_ROW_CLASS} ${className}`} data-testid="event-location">
      <MapPinIcon />
      <span className="sr-only">{t(UI_KEYS.LOCATION_LABEL, UI_DEFAULTS['location.label'])}: </span>
      <span className="min-w-0 break-words">{location}</span>
    </p>
  )
}
