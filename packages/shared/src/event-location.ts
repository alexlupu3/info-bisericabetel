// Event location (spec 07): `data.location` on Cards — an optional, single-line, plain-text
// place name or short address shown under the card's date (BR-050–BR-053).
//
// Length is measured in UTF-16 code units (`String.prototype.length`), the same measure as
// the HTML `maxLength` attribute, so the admin form, its counter and the API agree exactly.

/** Hard limit enforced by API, admin form and MCP tools (UTF-16 code units, = HTML maxLength). */
export const LOCATION_MAX_LENGTH = 70
/** Above this the admin form shows a soft "will wrap on phones" hint. Not enforced. */
export const LOCATION_SOFT_LENGTH = 50

// C0/C1 control characters plus the Unicode line/paragraph separators. Tabs and newlines
// are controls too, so they are replaced by a space first to keep words apart.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g

/**
 * Canonical form of a location string: C0/C1 controls and U+2028/U+2029 removed, every
 * whitespace run (incl. newlines/tabs/NBSP) collapsed to one space, trimmed.
 * Does not truncate. "" means "no location".
 */
export function normalizeLocationText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Validation for data.location (any JSON value). null when valid or absent
 * (undefined/null); otherwise 'location must be a string' or
 * 'location must be at most 70 characters'. Length is measured after normalizeLocationText().
 */
export function invalidLocation(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return 'location must be a string'
  if (normalizeLocationText(value).length > LOCATION_MAX_LENGTH) {
    return `location must be at most ${LOCATION_MAX_LENGTH} characters`
  }
  return null
}

/**
 * Consumer-side accessor: the normalised, non-empty location of an item's (already
 * locale-merged) data, or null. Tolerates legacy/unnormalised values and non-strings.
 * Used by CardItem, feeds (2), JSON-LD (3), notifications (1) and previews (6).
 */
export function readLocation(data: Record<string, unknown> | null | undefined): string | null {
  const raw = data?.location
  if (typeof raw !== 'string') return null
  return normalizeLocationText(raw) || null
}
