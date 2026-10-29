// FR-090 / BR-050: one rule for `data.location` on every write path — the admin content
// API (POST, PATCH, translations PUT), the remote MCP card tools and the AI translation job.

import { invalidLocation, normalizeLocationText } from '@betel/shared'

/**
 * Normalises `data.location` in place on the RESULTING type and data of a write (POST body,
 * PATCH merge result, translation object, MCP tool input). Returns a 400 message or null.
 * Empty input (null / undefined / "" / whitespace-only) removes the key on any type; a
 * non-empty location is only valid on a card.
 */
export function applyLocation(resultingType: string, data: Record<string, unknown>): string | null {
  if (!('location' in data)) return null
  const raw = data.location
  if (raw === null || raw === undefined) { delete data.location; return null }
  const error = invalidLocation(raw)
  if (error) return error
  const value = normalizeLocationText(raw as string)
  if (!value) { delete data.location; return null }
  if (resultingType !== 'card') return 'location is only supported on cards'
  data.location = value
  return null
}

/**
 * The AI translation job's variant of FR-090: a translated location that breaks the rule is
 * dropped (the Romanian fallback applies) and logged instead of answered with a 400.
 */
export function sanitizeTranslatedLocation(translated: Record<string, unknown>, entityId: string, locale: string): void {
  if (!('location' in translated)) return
  const reason = applyLocation('card', translated) ?? (translated.location === undefined ? 'empty' : null)
  if (!reason) return
  delete translated.location
  console.warn(JSON.stringify({ service: 'ai-translation', event: 'location_dropped', entityType: 'content', entityId, locale, reason }))
}

/**
 * Merges a partial AI translation (already passed through sanitizeTranslatedLocation) over a
 * locale's stored translation. When `location` was sent for translation but no valid value came
 * back, the stored translated location is dropped: it translated the previous Romanian venue,
 * and the Romanian fallback is better than a stale one (BR-051).
 */
export function mergePartialTranslation(
  existing: Record<string, unknown>,
  translated: Record<string, unknown>,
  requestedKeys: string[],
): Record<string, unknown> {
  const merged = { ...existing, ...translated }
  if (requestedKeys.includes('location') && !('location' in translated)) delete merged.location
  return merged
}
