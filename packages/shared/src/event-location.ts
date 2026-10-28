// Event location (spec 07, `data.location` on Cards).
//
// Spec 07 owns this module and has not landed yet. Until it does, `readLocation`
// is the stub its consumers agreed on (spec 03 §7): same signature, always null,
// so every consumer falls back to the site as the place name. Spec 07 replaces
// this file with the real helpers (LOCATION_MAX_LENGTH, normalizeLocationText,
// invalidLocation, readLocation).

/**
 * Consumer-side accessor: the normalised, non-empty location of an item's (already
 * locale-merged) data, or null. Stub until spec 07 lands: always null.
 */
export function readLocation(_data: Record<string, unknown> | null | undefined): string | null {
  return null
}
