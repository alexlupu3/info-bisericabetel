// Maintenance of stored content translations outside the AI translation job.

import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentTranslations } from '../db/schema.js'

/**
 * Removes `location` from every translation of an item. Called when a write removes the
 * Romanian location: no locale may keep showing a venue the card no longer has (BR-051).
 */
export async function dropTranslatedLocation(contentItemId: string): Promise<void> {
  await db.update(contentTranslations)
    .set({ data: sql`${contentTranslations.data} - 'location'`, updatedAt: new Date() })
    .where(and(eq(contentTranslations.contentItemId, contentItemId), sql`${contentTranslations.data} ? 'location'`))
}
