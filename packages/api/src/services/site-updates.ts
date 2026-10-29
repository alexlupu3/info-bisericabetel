// Validation of PATCH /api/admin/sites/:slug bodies (pure, no database access).

// Optional text columns of a site: '' or null clears the value (stored as NULL).
const TEXT_FIELDS = ['address', 'streetAddress', 'postalCode', 'addressLocality', 'addressRegion', 'telephone', 'email'] as const
const TEXT_MAX = 200

export type SiteBody = {
  name?: string
  accent?: string
  address?: string | null
  streetAddress?: string | null
  postalCode?: string | null
  addressLocality?: string | null
  addressRegion?: string | null
  addressCountry?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  telephone?: string | null
  email?: string | null
}

function parseCoordinate(value: unknown, field: 'latitude' | 'longitude'): { value: number | null } | { error: string } {
  if (value === null || value === '') return { value: null }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(',', '.')) : NaN
  const limit = field === 'latitude' ? 90 : 180
  if (!Number.isFinite(n) || Math.abs(n) > limit) return { error: `${field} must be a number between -${limit} and ${limit}` }
  return { value: n }
}

/**
 * Validated column updates for PATCH /api/admin/sites/:slug, or an error message.
 * `current` is the stored row, used to check the resulting coordinate pair.
 */
export function siteUpdates(
  body: SiteBody,
  current: { latitude: number | null; longitude: number | null },
): { updates: Record<string, unknown> } | { error: string } {
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.accent !== undefined) updates.accent = body.accent

  for (const field of TEXT_FIELDS) {
    const value = body[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') return { error: `${field} must be a string` }
    const trimmed = value?.trim() ?? ''
    if (trimmed.length > TEXT_MAX) return { error: `${field} must be at most ${TEXT_MAX} characters` }
    updates[field] = trimmed || null
  }

  if (body.addressCountry !== undefined) {
    const c = body.addressCountry?.trim().toUpperCase() ?? ''
    if (c && !/^[A-Z]{2}$/.test(c)) return { error: 'addressCountry must be an ISO 3166-1 alpha-2 code (e.g. RO)' }
    updates.addressCountry = c || null
  }

  for (const field of ['latitude', 'longitude'] as const) {
    if (body[field] === undefined) continue
    const parsed = parseCoordinate(body[field], field)
    if ('error' in parsed) return parsed
    updates[field] = parsed.value
  }

  // Check the pair as it will be stored: a patch touching one coordinate is combined
  // with the other one's current value, so a half-set pair can never be written.
  const lat = updates.latitude !== undefined ? updates.latitude : current.latitude
  const lng = updates.longitude !== undefined ? updates.longitude : current.longitude
  if ((lat === null) !== (lng === null)) {
    return { error: 'latitude and longitude must be set together' }
  }
  return { updates }
}
