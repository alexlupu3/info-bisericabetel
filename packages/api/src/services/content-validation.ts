// Validation of a content item's `data`, shared by the admin REST API and the remote
// MCP endpoint so both reject the same writes. Always call it on the data as it will
// be stored (after a PATCH merge), never on the partial patch alone.

import { invalidStartTime } from '@betel/shared'
import { invalidEventDate } from './time.js'

const REQUIRED_FIELDS: Record<string, string> = {
  card:     'title',
  richtext: 'body',
  poster:   'imageUrl',
  video:    'url',
}

export function missingRequiredField(type: string, data: Record<string, unknown>): string | null {
  const field = REQUIRED_FIELDS[type]
  if (!field) return null
  const val = data[field]
  return (!val || (typeof val === 'string' && val.trim() === ''))
    ? `${field} is required for content type "${type}"`
    : null
}

/**
 * The first rule the resulting `data` of an item of `type` breaks, or null:
 * the type's required field, event dates (format and order, BR-015) and the
 * single-day start time (BR-035).
 */
export function invalidContentData(type: string, data: Record<string, unknown>): string | null {
  return missingRequiredField(type, data) ?? invalidEventDate(data) ?? invalidStartTime(data)
}
